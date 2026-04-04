import json
import os
import uuid
import string
import random
import psycopg2
from psycopg2.extras import RealDictCursor

def get_conn():
    return psycopg2.connect(os.environ['DATABASE_URL'])

def gen_code(length=8):
    chars = string.ascii_uppercase + string.digits
    return ''.join(random.choices(chars, k=length))

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
}

def resp(status, body):
    return {'statusCode': status, 'headers': {**CORS, 'Content-Type': 'application/json'}, 'body': json.dumps(body, default=str)}

def handler(event, context):
    """Анонимные комнаты для P2P соединения — без аккаунтов, без хранения данных"""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    method = event.get('httpMethod', 'GET')
    params = event.get('queryStringParameters') or {}
    action = params.get('action', '')
    body = json.loads(event.get('body') or '{}')
    schema = os.environ.get('MAIN_DB_SCHEMA', 'public')

    conn = get_conn()
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(f"UPDATE {schema}.rooms SET status = 'expired' WHERE expires_at < now() AND status = 'waiting'")
        conn.commit()
    except Exception:
        pass

    if method == 'POST' and action == 'create':
        peer_id = body.get('peer_id', '')
        name = body.get('name', 'Аноним')
        if not peer_id:
            return resp(400, {'error': 'peer_id обязателен'})

        code = gen_code()
        conn = get_conn()
        try:
            cur = conn.cursor()
            cur.execute(
                f"INSERT INTO {schema}.rooms (code, creator_peer_id, creator_name, status) "
                f"VALUES ('{code}', '{peer_id}', '{name}', 'waiting')"
            )
            conn.commit()
            return resp(201, {'code': code, 'expires_in': 300})
        finally:
            conn.close()

    elif method == 'POST' and action == 'join':
        code = body.get('code', '').strip().upper()
        peer_id = body.get('peer_id', '')
        name = body.get('name', 'Аноним')
        if not code or not peer_id:
            return resp(400, {'error': 'code и peer_id обязательны'})

        conn = get_conn()
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute(f"SELECT * FROM {schema}.rooms WHERE code = '{code}' AND status = 'waiting' AND expires_at > now()")
            room = cur.fetchone()
            if not room:
                return resp(404, {'error': 'Комната не найдена или истекла'})

            if room['creator_peer_id'] == peer_id:
                return resp(400, {'error': 'Нельзя присоединиться к своей комнате'})

            cur.execute(
                f"UPDATE {schema}.rooms SET joiner_peer_id = '{peer_id}', joiner_name = '{name}', status = 'paired' "
                f"WHERE code = '{code}'"
            )
            conn.commit()
            return resp(200, {
                'code': code,
                'peer_id': room['creator_peer_id'],
                'peer_name': room['creator_name'],
                'role': 'joiner'
            })
        finally:
            conn.close()

    elif method == 'GET' and action == 'status':
        code = params.get('code', '').strip().upper()
        peer_id = params.get('peer_id', '')
        if not code or not peer_id:
            return resp(400, {'error': 'code и peer_id обязательны'})

        conn = get_conn()
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute(f"SELECT * FROM {schema}.rooms WHERE code = '{code}'")
            room = cur.fetchone()
            if not room:
                return resp(404, {'error': 'Комната не найдена'})

            if room['status'] == 'expired':
                return resp(410, {'error': 'Комната истекла'})

            if room['status'] == 'paired' and room['creator_peer_id'] == peer_id:
                return resp(200, {
                    'status': 'paired',
                    'peer_id': room['joiner_peer_id'],
                    'peer_name': room['joiner_name'],
                    'role': 'creator'
                })

            return resp(200, {'status': room['status']})
        finally:
            conn.close()

    elif method == 'POST' and action == 'signal':
        code = body.get('code', '')
        from_peer = body.get('from_peer_id', '')
        to_peer = body.get('to_peer_id', '')
        signal_type = body.get('signal_type', '')
        payload = body.get('payload', '')
        if not code or not from_peer or not to_peer or not signal_type:
            return resp(400, {'error': 'code, from_peer_id, to_peer_id, signal_type обязательны'})

        conn = get_conn()
        try:
            cur = conn.cursor()
            payload_str = json.dumps(payload) if isinstance(payload, (dict, list)) else str(payload)
            sig_id = str(uuid.uuid4())
            cur.execute(
                f"INSERT INTO {schema}.room_signals (id, room_code, from_peer_id, to_peer_id, signal_type, payload) "
                f"VALUES ('{sig_id}', '{code}', '{from_peer}', '{to_peer}', '{signal_type}', '{payload_str}')"
            )
            conn.commit()
            return resp(201, {'ok': True})
        finally:
            conn.close()

    elif method == 'GET' and action == 'poll':
        peer_id = params.get('peer_id', '')
        code = params.get('code', '')
        if not peer_id:
            return resp(400, {'error': 'peer_id обязателен'})

        conn = get_conn()
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            code_filter = f"AND room_code = '{code}'" if code else ""
            cur.execute(
                f"SELECT id, room_code, from_peer_id, signal_type, payload, created_at "
                f"FROM {schema}.room_signals "
                f"WHERE to_peer_id = '{peer_id}' {code_filter} "
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
                    'room_code': s['room_code'],
                    'from_peer_id': s['from_peer_id'],
                    'signal_type': s['signal_type'],
                    'payload': payload,
                })

            if ids_to_remove:
                ids_str = "','".join(ids_to_remove)
                cur.execute(f"UPDATE {schema}.room_signals SET to_peer_id = 'consumed' WHERE id IN ('{ids_str}')")
                conn.commit()

            return resp(200, {'signals': result})
        finally:
            conn.close()

    return resp(400, {'error': 'action: create, join, status, signal, poll'})
