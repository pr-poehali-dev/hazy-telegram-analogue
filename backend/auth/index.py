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

def make_token(user_id: str) -> str:
    secret = os.environ.get('TOKEN_SECRET', 'hazy-secret-key-change-me')
    payload = f"{user_id}:{int(time.time()) + 86400 * 30}"
    sig = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()[:32]
    return f"{payload}:{sig}"

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

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Authorization',
    'Access-Control-Max-Age': '86400'
}

def resp(status, body):
    return {'statusCode': status, 'headers': {**CORS, 'Content-Type': 'application/json'}, 'body': json.dumps(body, default=str)}

def handler(event, context):
    """Авторизация и регистрация пользователей Hazy"""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    method = event.get('httpMethod', 'GET')
    params = event.get('queryStringParameters') or {}
    action = params.get('action', '')
    body = json.loads(event.get('body') or '{}')
    schema = os.environ.get('MAIN_DB_SCHEMA', 'public')

    if method == 'POST' and action == 'register':
        username = body.get('username', '').strip().lower()
        display_name = body.get('display_name', '').strip()
        password = body.get('password', '')
        public_key = body.get('public_key', '')

        if not username or not display_name or not password:
            return resp(400, {'error': 'username, display_name и password обязательны'})
        if len(username) < 3 or len(password) < 6:
            return resp(400, {'error': 'username >= 3 символов, password >= 6 символов'})

        pw_hash = hashlib.sha256(password.encode()).hexdigest()
        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        try:
            cur.execute(f"SELECT id FROM {schema}.users WHERE username = '{username}'")
            if cur.fetchone():
                return resp(409, {'error': 'Пользователь уже существует'})

            user_id = str(uuid.uuid4())
            cur.execute(
                f"INSERT INTO {schema}.users (id, username, display_name, public_key, status, phone) "
                f"VALUES ('{user_id}', '{username}', '{display_name}', '{public_key}', 'online', '{pw_hash}')"
            )
            conn.commit()
            token = make_token(user_id)
            return resp(201, {'user_id': user_id, 'username': username, 'display_name': display_name, 'token': token})
        finally:
            cur.close()
            conn.close()

    elif method == 'POST' and action == 'login':
        username = body.get('username', '').strip().lower()
        password = body.get('password', '')
        if not username or not password:
            return resp(400, {'error': 'username и password обязательны'})

        pw_hash = hashlib.sha256(password.encode()).hexdigest()
        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        try:
            cur.execute(f"SELECT id, username, display_name, public_key FROM {schema}.users WHERE username = '{username}' AND phone = '{pw_hash}'")
            user = cur.fetchone()
            if not user:
                return resp(401, {'error': 'Неверный логин или пароль'})

            cur.execute(f"UPDATE {schema}.users SET status = 'online', last_seen = now() WHERE id = '{user['id']}'")
            conn.commit()
            token = make_token(str(user['id']))
            return resp(200, {'user_id': str(user['id']), 'username': user['username'], 'display_name': user['display_name'], 'public_key': user['public_key'], 'token': token})
        finally:
            cur.close()
            conn.close()

    elif method == 'GET' and action == 'me':
        auth = event.get('headers', {}).get('X-Authorization', event.get('headers', {}).get('x-authorization', ''))
        token = auth.replace('Bearer ', '')
        user_id = verify_token(token)
        if not user_id:
            return resp(401, {'error': 'Не авторизован'})

        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        try:
            cur.execute(f"SELECT id, username, display_name, public_key, status, last_seen, created_at FROM {schema}.users WHERE id = '{user_id}'")
            user = cur.fetchone()
            if not user:
                return resp(404, {'error': 'Пользователь не найден'})
            return resp(200, user)
        finally:
            cur.close()
            conn.close()

    elif method == 'GET' and action == 'users':
        auth = event.get('headers', {}).get('X-Authorization', event.get('headers', {}).get('x-authorization', ''))
        token = auth.replace('Bearer ', '')
        user_id = verify_token(token)
        if not user_id:
            return resp(401, {'error': 'Не авторизован'})

        search = params.get('search', '')
        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        try:
            if search:
                cur.execute(f"SELECT id, username, display_name, status, last_seen FROM {schema}.users WHERE id != '{user_id}' AND (username ILIKE '%{search}%' OR display_name ILIKE '%{search}%') LIMIT 50")
            else:
                cur.execute(f"SELECT id, username, display_name, status, last_seen FROM {schema}.users WHERE id != '{user_id}' LIMIT 50")
            users = cur.fetchall()
            return resp(200, {'users': users})
        finally:
            cur.close()
            conn.close()

    return resp(400, {'error': 'Укажите action: register, login, me, users'})
