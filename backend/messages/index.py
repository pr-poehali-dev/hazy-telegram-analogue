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

def get_or_create_chat_key(conn, schema, chat_id, user_id):
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(f"SELECT encrypted_chat_key FROM {schema}.encryption_keys WHERE chat_id = '{chat_id}' AND user_id = '{user_id}'")
    row = cur.fetchone()
    if row:
        cur.close()
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
    """P2P гибридный мессенджер — конверты для офлайн, сигналинг для WebRTC"""
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

    if method == 'POST' and action == 'envelope_store':
        chat_id = body.get('chat_id', '')
        encrypted_body = body.get('encrypted_body', '')
        iv = body.get('iv', '')
        if not chat_id or not encrypted_body or not iv:
            return resp(400, {'error': 'chat_id, encrypted_body, iv обязательны'})

        conn = get_conn()
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute(f"SELECT user_id FROM {schema}.chat_participants WHERE chat_id = '{chat_id}' AND user_id != '{user_id}'")
            recipient = cur.fetchone()
            if not recipient:
                return resp(404, {'error': 'Получатель не найден'})

            env_id = str(uuid.uuid4())
            recipient_id = str(recipient['user_id'])
            cur.execute(
                f"INSERT INTO {schema}.pending_envelopes (id, chat_id, sender_id, recipient_id, encrypted_body, iv) "
                f"VALUES ('{env_id}', '{chat_id}', '{user_id}', '{recipient_id}', '{encrypted_body}', '{iv}')"
            )
            conn.commit()
            return resp(201, {'id': env_id, 'stored': True})
        finally:
            conn.close()

    elif method == 'POST' and action == 'envelope_store_raw':
        chat_id = body.get('chat_id', '')
        text = body.get('text', '')
        if not chat_id or not text:
            return resp(400, {'error': 'chat_id и text обязательны'})

        conn = get_conn()
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute(f"SELECT user_id FROM {schema}.chat_participants WHERE chat_id = '{chat_id}' AND user_id != '{user_id}'")
            recipient = cur.fetchone()
            if not recipient:
                return resp(404, {'error': 'Получатель не найден'})

            chat_key = get_or_create_chat_key(conn, schema, chat_id, user_id)
            encrypted_body, iv = encrypt_message(text, chat_key)

            env_id = str(uuid.uuid4())
            recipient_id = str(recipient['user_id'])
            cur.execute(
                f"INSERT INTO {schema}.pending_envelopes (id, chat_id, sender_id, recipient_id, encrypted_body, iv) "
                f"VALUES ('{env_id}', '{chat_id}', '{user_id}', '{recipient_id}', '{encrypted_body}', '{iv}')"
            )
            conn.commit()
            return resp(201, {
                'id': env_id,
                'chat_id': chat_id,
                'sender_id': user_id,
                'timestamp': time.strftime('%H:%M'),
                'stored': True
            })
        finally:
            conn.close()

    elif method == 'GET' and action == 'envelope_fetch':
        conn = get_conn()
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            chat_id_filter = params.get('chat_id', '')
            if chat_id_filter:
                cur.execute(
                    f"SELECT e.id, e.chat_id, e.sender_id, e.encrypted_body, e.iv, e.created_at, "
                    f"u.display_name as sender_name "
                    f"FROM {schema}.pending_envelopes e "
                    f"JOIN {schema}.users u ON u.id = e.sender_id "
                    f"WHERE e.recipient_id = '{user_id}' AND e.chat_id = '{chat_id_filter}' "
                    f"ORDER BY e.created_at ASC"
                )
            else:
                cur.execute(
                    f"SELECT e.id, e.chat_id, e.sender_id, e.encrypted_body, e.iv, e.created_at, "
                    f"u.display_name as sender_name "
                    f"FROM {schema}.pending_envelopes e "
                    f"JOIN {schema}.users u ON u.id = e.sender_id "
                    f"WHERE e.recipient_id = '{user_id}' "
                    f"ORDER BY e.created_at ASC"
                )
            rows = cur.fetchall()

            envelopes = []
            for row in rows:
                chat_key = get_or_create_chat_key(conn, schema, str(row['chat_id']), user_id)
                try:
                    data = base64.b64decode(row['encrypted_body'])
                    ct = data[:-16]
                    tag = data[-16:]
                    iv_bytes = base64.b64decode(row['iv'])
                    cipher = Cipher(algorithms.AES(chat_key), modes.GCM(iv_bytes, tag), backend=default_backend())
                    decryptor = cipher.decryptor()
                    text = (decryptor.update(ct) + decryptor.finalize()).decode()
                except Exception:
                    text = '[не удалось расшифровать]'

                envelopes.append({
                    'id': str(row['id']),
                    'chat_id': str(row['chat_id']),
                    'sender_id': str(row['sender_id']),
                    'sender_name': row['sender_name'],
                    'text': text,
                    'timestamp': row['created_at'].strftime('%H:%M') if row['created_at'] else '',
                    'created_at': str(row['created_at'])
                })
            return resp(200, {'envelopes': envelopes})
        finally:
            conn.close()

    elif method == 'POST' and action == 'envelope_ack':
        envelope_ids = body.get('ids', [])
        if not envelope_ids:
            return resp(400, {'error': 'ids обязателен'})

        conn = get_conn()
        try:
            cur = conn.cursor()
            ids_str = "','".join(envelope_ids)
            cur.execute(f"SELECT COUNT(*) FROM {schema}.pending_envelopes WHERE id IN ('{ids_str}') AND recipient_id = '{user_id}'")
            count = cur.fetchone()[0]
            cur.execute(f"INSERT INTO {schema}.messages (id, chat_id, sender_id, encrypted_body, iv, is_read, created_at) SELECT id, chat_id, sender_id, encrypted_body, iv, true, created_at FROM {schema}.pending_envelopes WHERE id IN ('{ids_str}') AND recipient_id = '{user_id}'")
            cur.execute(f"UPDATE {schema}.pending_envelopes SET recipient_id = '00000000-0000-0000-0000-000000000000' WHERE id IN ('{ids_str}') AND recipient_id = '{user_id}'")
            conn.commit()
            return resp(200, {'acknowledged': count})
        finally:
            conn.close()

    elif method == 'POST' and action == 'signal_send':
        chat_id = body.get('chat_id', '')
        to_user_id = body.get('to_user_id', '')
        signal_type = body.get('signal_type', '')
        payload = body.get('payload', '')
        if not chat_id or not to_user_id or not signal_type:
            return resp(400, {'error': 'chat_id, to_user_id, signal_type обязательны'})

        conn = get_conn()
        try:
            cur = conn.cursor()
            sig_id = str(uuid.uuid4())
            payload_str = json.dumps(payload) if isinstance(payload, dict) else str(payload)
            cur.execute(
                f"INSERT INTO {schema}.signaling (id, chat_id, from_user_id, to_user_id, signal_type, payload) "
                f"VALUES ('{sig_id}', '{chat_id}', '{user_id}', '{to_user_id}', '{signal_type}', '{payload_str}')"
            )
            conn.commit()
            return resp(201, {'id': sig_id})
        finally:
            conn.close()

    elif method == 'GET' and action == 'signal_poll':
        conn = get_conn()
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute(
                f"SELECT id, chat_id, from_user_id, signal_type, payload, created_at "
                f"FROM {schema}.signaling "
                f"WHERE to_user_id = '{user_id}' "
                f"ORDER BY created_at ASC LIMIT 50"
            )
            signals = cur.fetchall()

            result = []
            ids_to_remove = []
            for s in signals:
                ids_to_remove.append(str(s['id']))
                try:
                    payload = json.loads(s['payload'])
                except Exception:
                    payload = s['payload']
                result.append({
                    'id': str(s['id']),
                    'chat_id': str(s['chat_id']),
                    'from_user_id': str(s['from_user_id']),
                    'signal_type': s['signal_type'],
                    'payload': payload,
                })

            if ids_to_remove:
                ids_str = "','".join(ids_to_remove)
                cur.execute(f"UPDATE {schema}.signaling SET to_user_id = '00000000-0000-0000-0000-000000000000' WHERE id IN ('{ids_str}')")
                conn.commit()

            return resp(200, {'signals': result})
        finally:
            conn.close()

    elif method == 'POST' and action == 'heartbeat':
        conn = get_conn()
        try:
            cur = conn.cursor()
            cur.execute(f"UPDATE {schema}.users SET status = 'online', last_seen = now() WHERE id = '{user_id}'")
            conn.commit()

            cur2 = conn.cursor(cursor_factory=RealDictCursor)
            cur2.execute(f"SELECT COUNT(*) as cnt FROM {schema}.pending_envelopes WHERE recipient_id = '{user_id}'")
            pending = cur2.fetchone()['cnt']
            return resp(200, {'online': True, 'pending_envelopes': pending})
        finally:
            conn.close()

    return resp(400, {'error': 'Укажите action: envelope_store, envelope_store_raw, envelope_fetch, envelope_ack, signal_send, signal_poll, heartbeat'})
