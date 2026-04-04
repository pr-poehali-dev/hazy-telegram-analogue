import json
import os
import uuid
import hashlib
import hmac
import time
import psycopg2
from psycopg2.extras import RealDictCursor

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

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Authorization',
    'Access-Control-Max-Age': '86400'
}

def resp(status, body):
    return {'statusCode': status, 'headers': {**CORS, 'Content-Type': 'application/json'}, 'body': json.dumps(body, default=str)}

def handler(event, context):
    """Управление чатами — список, создание, поиск"""
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

    if method == 'GET' and action == 'list':
        conn = get_conn()
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute(f"""
                SELECT c.id as chat_id, c.created_at,
                    u.id as participant_id, u.username, u.display_name, u.status, u.last_seen,
                    (SELECT COUNT(*) FROM {schema}.messages m2 
                     WHERE m2.chat_id = c.id AND m2.sender_id != '{user_id}' AND m2.is_read = false) as unread_count
                FROM {schema}.chats c
                JOIN {schema}.chat_participants cp ON cp.chat_id = c.id AND cp.user_id = '{user_id}'
                JOIN {schema}.chat_participants cp2 ON cp2.chat_id = c.id AND cp2.user_id != '{user_id}'
                JOIN {schema}.users u ON u.id = cp2.user_id
                ORDER BY c.created_at DESC
            """)
            rows = cur.fetchall()

            chats = []
            for row in rows:
                chat_id = str(row['chat_id'])
                cur.execute(f"""
                    SELECT id, sender_id, created_at, is_read FROM {schema}.messages 
                    WHERE chat_id = '{chat_id}' ORDER BY created_at DESC LIMIT 1
                """)
                last_msg = cur.fetchone()

                chats.append({
                    'id': chat_id,
                    'participant': {
                        'id': str(row['participant_id']),
                        'name': row['display_name'],
                        'username': row['username'],
                        'status': row['status'],
                        'lastSeen': str(row['last_seen']) if row['last_seen'] else None,
                    },
                    'unreadCount': row['unread_count'],
                    'lastMessageAt': str(last_msg['created_at']) if last_msg else str(row['created_at']),
                    'hasMessages': last_msg is not None,
                })

            chats.sort(key=lambda x: x['lastMessageAt'], reverse=True)
            return resp(200, {'chats': chats})
        finally:
            conn.close()

    elif method == 'POST' and action == 'create':
        participant_id = body.get('participant_id', '')
        if not participant_id:
            return resp(400, {'error': 'participant_id обязателен'})
        if participant_id == user_id:
            return resp(400, {'error': 'Нельзя создать чат с самим собой'})

        conn = get_conn()
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)

            cur.execute(f"SELECT id FROM {schema}.users WHERE id = '{participant_id}'")
            if not cur.fetchone():
                return resp(404, {'error': 'Пользователь не найден'})

            cur.execute(f"""
                SELECT cp1.chat_id FROM {schema}.chat_participants cp1
                JOIN {schema}.chat_participants cp2 ON cp1.chat_id = cp2.chat_id
                WHERE cp1.user_id = '{user_id}' AND cp2.user_id = '{participant_id}'
                LIMIT 1
            """)
            existing = cur.fetchone()
            if existing:
                return resp(200, {'chat_id': str(existing['chat_id']), 'existing': True})

            chat_id = str(uuid.uuid4())
            cur.execute(f"INSERT INTO {schema}.chats (id) VALUES ('{chat_id}')")
            cur.execute(f"INSERT INTO {schema}.chat_participants (chat_id, user_id) VALUES ('{chat_id}', '{user_id}')")
            cur.execute(f"INSERT INTO {schema}.chat_participants (chat_id, user_id) VALUES ('{chat_id}', '{participant_id}')")
            conn.commit()

            cur.execute(f"SELECT id, username, display_name, status, last_seen FROM {schema}.users WHERE id = '{participant_id}'")
            participant = cur.fetchone()

            return resp(201, {
                'chat_id': chat_id,
                'existing': False,
                'participant': {
                    'id': str(participant['id']),
                    'name': participant['display_name'],
                    'username': participant['username'],
                    'status': participant['status'],
                }
            })
        finally:
            conn.close()

    return resp(400, {'error': 'Укажите action: list, create'})
