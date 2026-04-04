import json
import os
import uuid
import hashlib
import hmac
import time
import base64
import psycopg2
from psycopg2.extras import RealDictCursor
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

def get_conn():
    return psycopg2.connect(os.environ['DATABASE_URL'])

def verify_token(token: str) -> str | None:
    secret = os.environ.get('TOKEN_SECRET', 'hazy-secret-key-change-me')
    try:
        parts = token.split(':')
        if len(parts) != 3:
            return None
        user_id, expires, sig = parts
        if int(expires) < int(time.time()):
            return None
        expected = hmac.new(secret.encode(), f"{user_id}:{expires}".encode(), hashlib.sha256).hexdigest()[:32]
        if not hmac.compare_digest(sig, expected):
            return None
        return user_id
    except Exception:
        return None

def get_user_id(event):
    auth = event.get('headers', {}).get('X-Authorization', event.get('headers', {}).get('x-authorization', ''))
    return verify_token(auth.replace('Bearer ', ''))

def encrypt_message(text: str, chat_key: bytes) -> tuple:
    iv = os.urandom(12)
    cipher = Cipher(algorithms.AES(chat_key), modes.GCM(iv), backend=default_backend())
    encryptor = cipher.encryptor()
    ct = encryptor.update(text.encode()) + encryptor.finalize()
    encrypted = base64.b64encode(ct + encryptor.tag).decode()
    iv_b64 = base64.b64encode(iv).decode()
    return encrypted, iv_b64

def decrypt_message(encrypted_body: str, iv_b64: str, chat_key: bytes) -> str:
    data = base64.b64decode(encrypted_body)
    ct = data[:-16]
    tag = data[-16:]
    iv = base64.b64decode(iv_b64)
    cipher = Cipher(algorithms.AES(chat_key), modes.GCM(iv, tag), backend=default_backend())
    decryptor = cipher.decryptor()
    return (decryptor.update(ct) + decryptor.finalize()).decode()

def get_or_create_chat_key(conn, schema, chat_id, user_id):
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(f"SELECT encrypted_chat_key FROM {schema}.encryption_keys WHERE chat_id = '{chat_id}' AND user_id = '{user_id}'")
    row = cur.fetchone()
    if row:
        return base64.b64decode(row['encrypted_chat_key'])

    cur.execute(f"SELECT encrypted_chat_key FROM {schema}.encryption_keys WHERE chat_id = '{chat_id}' LIMIT 1")
    existing = cur.fetchone()
    if existing:
        chat_key = base64.b64decode(existing['encrypted_chat_key'])
    else:
        chat_key = os.urandom(32)

    key_b64 = base64.b64encode(chat_key).decode()
    cur.execute(f"INSERT INTO {schema}.encryption_keys (chat_id, user_id, encrypted_chat_key) VALUES ('{chat_id}', '{user_id}', '{key_b64}') ON CONFLICT (chat_id, user_id) DO NOTHING")
    conn.commit()
    cur.close()
    return chat_key

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Authorization',
    'Access-Control-Max-Age': '86400'
}

def resp(status, body):
    return {'statusCode': status, 'headers': {**CORS, 'Content-Type': 'application/json'}, 'body': json.dumps(body, default=str)}

def handler(event, context):
    """Отправка и получение зашифрованных сообщений E2E"""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    user_id = get_user_id(event)
    if not user_id:
        return resp(401, {'error': 'Не авторизован'})

    method = event.get('httpMethod', 'GET')
    params = event.get('queryStringParameters') or {}
    action = params.get('action', '')
    body = json.loads(event.get('body') or '{}')
    schema = os.environ.get('MAIN_DB_SCHEMA', 'public')

    if method == 'POST' and action == 'send':
        chat_id = body.get('chat_id', '')
        text = body.get('text', '')
        if not chat_id or not text:
            return resp(400, {'error': 'chat_id и text обязательны'})

        conn = get_conn()
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute(f"SELECT 1 FROM {schema}.chat_participants WHERE chat_id = '{chat_id}' AND user_id = '{user_id}'")
            if not cur.fetchone():
                return resp(403, {'error': 'Нет доступа к чату'})

            chat_key = get_or_create_chat_key(conn, schema, chat_id, user_id)
            encrypted_body, iv = encrypt_message(text, chat_key)

            msg_id = str(uuid.uuid4())
            cur.execute(
                f"INSERT INTO {schema}.messages (id, chat_id, sender_id, encrypted_body, iv) "
                f"VALUES ('{msg_id}', '{chat_id}', '{user_id}', '{encrypted_body}', '{iv}')"
            )
            conn.commit()

            return resp(201, {
                'id': msg_id,
                'chat_id': chat_id,
                'sender_id': user_id,
                'text': text,
                'timestamp': time.strftime('%H:%M'),
                'is_encrypted': True
            })
        finally:
            conn.close()

    elif method == 'GET' and action == 'list':
        chat_id = params.get('chat_id', '')
        if not chat_id:
            return resp(400, {'error': 'chat_id обязателен'})

        limit = int(params.get('limit', '50'))
        offset = int(params.get('offset', '0'))

        conn = get_conn()
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute(f"SELECT 1 FROM {schema}.chat_participants WHERE chat_id = '{chat_id}' AND user_id = '{user_id}'")
            if not cur.fetchone():
                return resp(403, {'error': 'Нет доступа к чату'})

            chat_key = get_or_create_chat_key(conn, schema, chat_id, user_id)

            cur.execute(
                f"SELECT m.id, m.chat_id, m.sender_id, m.encrypted_body, m.iv, m.is_read, m.created_at, "
                f"u.display_name as sender_name "
                f"FROM {schema}.messages m "
                f"JOIN {schema}.users u ON u.id = m.sender_id "
                f"WHERE m.chat_id = '{chat_id}' "
                f"ORDER BY m.created_at ASC LIMIT {limit} OFFSET {offset}"
            )
            rows = cur.fetchall()

            messages = []
            for row in rows:
                try:
                    decrypted = decrypt_message(row['encrypted_body'], row['iv'], chat_key)
                except Exception:
                    decrypted = '[не удалось расшифровать]'

                messages.append({
                    'id': str(row['id']),
                    'chat_id': str(row['chat_id']),
                    'sender_id': str(row['sender_id']),
                    'sender_name': row['sender_name'],
                    'text': decrypted,
                    'is_read': row['is_read'],
                    'is_encrypted': True,
                    'timestamp': row['created_at'].strftime('%H:%M') if row['created_at'] else '',
                    'created_at': str(row['created_at'])
                })

            return resp(200, {'messages': messages})
        finally:
            conn.close()

    elif method == 'POST' and action == 'read':
        chat_id = body.get('chat_id', '')
        if not chat_id:
            return resp(400, {'error': 'chat_id обязателен'})

        conn = get_conn()
        try:
            cur = conn.cursor()
            cur.execute(f"UPDATE {schema}.messages SET is_read = true WHERE chat_id = '{chat_id}' AND sender_id != '{user_id}' AND is_read = false")
            conn.commit()
            return resp(200, {'ok': True})
        finally:
            conn.close()

    return resp(400, {'error': 'Укажите action: send, list, read'})
