import json
import os
import uuid
import hashlib
import hmac
import time
import base64
import struct
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

def get_user_id(event):
    auth = event.get('headers', {}).get('X-Authorization', event.get('headers', {}).get('x-authorization', ''))
    return verify_token(auth.replace('Bearer ', ''))

# --- TOTP ---
BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

def generate_totp_secret(length=20):
    raw = os.urandom(length)
    return base32_encode(raw)

def base32_encode(data: bytes) -> str:
    result = []
    buffer = 0
    bits_left = 0
    for byte in data:
        buffer = (buffer << 8) | byte
        bits_left += 8
        while bits_left >= 5:
            bits_left -= 5
            result.append(BASE32_CHARS[(buffer >> bits_left) & 0x1F])
    if bits_left > 0:
        result.append(BASE32_CHARS[(buffer << (5 - bits_left)) & 0x1F])
    return ''.join(result)

def base32_decode(s: str) -> bytes:
    s = s.upper().rstrip('=')
    result = []
    buffer = 0
    bits_left = 0
    for ch in s:
        val = BASE32_CHARS.index(ch)
        buffer = (buffer << 5) | val
        bits_left += 5
        if bits_left >= 8:
            bits_left -= 8
            result.append((buffer >> bits_left) & 0xFF)
    return bytes(result)

def get_totp_code(secret_b32: str, time_step=30, digits=6) -> str:
    key = base32_decode(secret_b32)
    counter = int(time.time()) // time_step
    msg = struct.pack('>Q', counter)
    h = hmac.new(key, msg, hashlib.sha1).digest()
    offset = h[-1] & 0x0F
    truncated = struct.unpack('>I', h[offset:offset+4])[0] & 0x7FFFFFFF
    code = truncated % (10 ** digits)
    return str(code).zfill(digits)

def verify_totp(secret_b32: str, code: str, window=1) -> bool:
    for offset in range(-window, window + 1):
        key = base32_decode(secret_b32)
        counter = (int(time.time()) // 30) + offset
        msg = struct.pack('>Q', counter)
        h = hmac.new(key, msg, hashlib.sha1).digest()
        o = h[-1] & 0x0F
        truncated = struct.unpack('>I', h[o:o+4])[0] & 0x7FFFFFFF
        expected = str(truncated % 1000000).zfill(6)
        if hmac.compare_digest(expected, code.zfill(6)):
            return True
    return False

def make_totp_uri(secret: str, username: str) -> str:
    issuer = 'Hazy'
    return f"otpauth://totp/{issuer}:{username}?secret={secret}&issuer={issuer}&digits=6&period=30"

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Authorization',
    'Access-Control-Max-Age': '86400'
}

def resp(status, body):
    return {'statusCode': status, 'headers': {**CORS, 'Content-Type': 'application/json'}, 'body': json.dumps(body, default=str)}

def handler(event, context):
    """Авторизация с обязательной 2FA (TOTP) для всех пользователей"""
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
        totp_secret = generate_totp_secret()

        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        try:
            cur.execute(f"SELECT id FROM {schema}.users WHERE username = '{username}'")
            if cur.fetchone():
                return resp(409, {'error': 'Пользователь уже существует'})

            user_id = str(uuid.uuid4())
            cur.execute(
                f"INSERT INTO {schema}.users (id, username, display_name, public_key, status, phone, totp_secret, is_2fa_enabled) "
                f"VALUES ('{user_id}', '{username}', '{display_name}', '{public_key}', 'offline', '{pw_hash}', '{totp_secret}', false)"
            )
            conn.commit()

            totp_uri = make_totp_uri(totp_secret, username)
            return resp(201, {
                'user_id': user_id,
                'username': username,
                'display_name': display_name,
                'requires_2fa_setup': True,
                'totp_secret': totp_secret,
                'totp_uri': totp_uri,
            })
        finally:
            cur.close()
            conn.close()

    elif method == 'POST' and action == 'verify_2fa_setup':
        user_id = body.get('user_id', '')
        code = body.get('code', '')
        if not user_id or not code:
            return resp(400, {'error': 'user_id и code обязательны'})

        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        try:
            cur.execute(f"SELECT id, username, display_name, totp_secret, is_2fa_enabled FROM {schema}.users WHERE id = '{user_id}'")
            user = cur.fetchone()
            if not user:
                return resp(404, {'error': 'Пользователь не найден'})
            if user['is_2fa_enabled']:
                return resp(400, {'error': '2FA уже активирована'})
            if not user['totp_secret']:
                return resp(400, {'error': 'TOTP секрет не найден'})

            if not verify_totp(user['totp_secret'], code):
                return resp(401, {'error': 'Неверный код. Проверьте время на устройстве'})

            cur.execute(f"UPDATE {schema}.users SET is_2fa_enabled = true, status = 'online', last_seen = now() WHERE id = '{user_id}'")
            conn.commit()

            token = make_token(user_id)
            return resp(200, {
                'user_id': user_id,
                'username': user['username'],
                'display_name': user['display_name'],
                'token': token,
                '2fa_enabled': True
            })
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
            cur.execute(f"SELECT id, username, display_name, public_key, is_2fa_enabled, totp_secret FROM {schema}.users WHERE username = '{username}' AND phone = '{pw_hash}'")
            user = cur.fetchone()
            if not user:
                return resp(401, {'error': 'Неверный логин или пароль'})

            if not user['is_2fa_enabled']:
                totp_uri = make_totp_uri(user['totp_secret'], username) if user['totp_secret'] else ''
                return resp(200, {
                    'user_id': str(user['id']),
                    'requires_2fa_setup': True,
                    'totp_secret': user['totp_secret'] or '',
                    'totp_uri': totp_uri,
                })

            return resp(200, {
                'user_id': str(user['id']),
                'username': user['username'],
                'display_name': user['display_name'],
                'requires_2fa': True,
            })
        finally:
            cur.close()
            conn.close()

    elif method == 'POST' and action == 'verify_2fa':
        user_id = body.get('user_id', '')
        code = body.get('code', '')
        if not user_id or not code:
            return resp(400, {'error': 'user_id и code обязательны'})

        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        try:
            cur.execute(f"SELECT id, username, display_name, public_key, totp_secret, is_2fa_enabled FROM {schema}.users WHERE id = '{user_id}'")
            user = cur.fetchone()
            if not user:
                return resp(404, {'error': 'Пользователь не найден'})
            if not user['is_2fa_enabled'] or not user['totp_secret']:
                return resp(400, {'error': '2FA не настроена'})

            if not verify_totp(user['totp_secret'], code):
                return resp(401, {'error': 'Неверный код'})

            cur.execute(f"UPDATE {schema}.users SET status = 'online', last_seen = now() WHERE id = '{user_id}'")
            conn.commit()

            token = make_token(user_id)
            return resp(200, {
                'user_id': user_id,
                'username': user['username'],
                'display_name': user['display_name'],
                'public_key': user['public_key'],
                'token': token
            })
        finally:
            cur.close()
            conn.close()

    elif method == 'GET' and action == 'me':
        user_id = get_user_id(event)
        if not user_id:
            return resp(401, {'error': 'Не авторизован'})

        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        try:
            cur.execute(f"SELECT id, username, display_name, public_key, status, last_seen, created_at, is_2fa_enabled FROM {schema}.users WHERE id = '{user_id}'")
            user = cur.fetchone()
            if not user:
                return resp(404, {'error': 'Пользователь не найден'})
            return resp(200, user)
        finally:
            cur.close()
            conn.close()

    elif method == 'GET' and action == 'users':
        user_id = get_user_id(event)
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

    return resp(400, {'error': 'Укажите action: register, login, verify_2fa_setup, verify_2fa, me, users'})
