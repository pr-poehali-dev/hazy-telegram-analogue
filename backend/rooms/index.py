import json
import os
import uuid
import string
import random
import psycopg2
from psycopg2.extras import RealDictCursor
from pywebpush import webpush, WebPushException

def get_conn():
    return psycopg2.connect(os.environ['DATABASE_URL'])

def gen_code(length=8):
    chars = string.ascii_uppercase + string.digits
    return ''.join(random.choices(chars, k=length))

def send_push(schema, conn, to_peer_id, payload_dict):
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(f"SELECT endpoint, p256dh, auth FROM {schema}.push_subscriptions WHERE peer_id = '{to_peer_id}'")
    sub = cur.fetchone()
    cur.close()
    if not sub:
        return

    vapid_private = os.environ.get('VAPID_PRIVATE_KEY', '')
    if not vapid_private:
        return

    subscription_info = {
        "endpoint": sub['endpoint'],
        "keys": {"p256dh": sub['p256dh'], "auth": sub['auth']}
    }
    try:
        webpush(
            subscription_info=subscription_info,
            data=json.dumps(payload_dict),
            vapid_private_key=vapid_private,
            vapid_claims={"sub": "mailto:push@hazy.app"}
        )
    except WebPushException:
        pass

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
}

def resp(status, body):
    return {'statusCode': status, 'headers': {**CORS, 'Content-Type': 'application/json'}, 'body': json.dumps(body, default=str)}

def handler(event, context):
    """P2P комнаты, конверты для офлайн, push-уведомления, подписки"""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    method = event.get('httpMethod', 'GET')
    params = event.get('queryStringParameters') or {}
    action = params.get('action', '')
    body = json.loads(event.get('body') or '{}')
    schema = os.environ.get('MAIN_DB_SCHEMA', 'public')

    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(f"UPDATE {schema}.rooms SET status = 'expired' WHERE expires_at < now() AND status = 'waiting'")
        conn.commit()
    except Exception:
        pass

    # --- ROOMS ---

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
                    p = json.loads(s['payload'])
                except Exception:
                    p = s['payload']
                result.append({
                    'id': str(s['id']),
                    'room_code': s['room_code'],
                    'from_peer_id': s['from_peer_id'],
                    'signal_type': s['signal_type'],
                    'payload': p,
                })

            if ids_to_remove:
                ids_str = "','".join(ids_to_remove)
                cur.execute(f"UPDATE {schema}.room_signals SET to_peer_id = 'consumed' WHERE id IN ('{ids_str}')")
                conn.commit()

            return resp(200, {'signals': result})
        finally:
            conn.close()

    # --- PUSH SUBSCRIPTIONS ---

    elif method == 'POST' and action == 'push_subscribe':
        peer_id = body.get('peer_id', '')
        endpoint = body.get('endpoint', '')
        p256dh = body.get('p256dh', '')
        auth_key = body.get('auth', '')
        if not peer_id or not endpoint or not p256dh or not auth_key:
            return resp(400, {'error': 'peer_id, endpoint, p256dh, auth обязательны'})

        conn = get_conn()
        try:
            cur = conn.cursor()
            cur.execute(
                f"INSERT INTO {schema}.push_subscriptions (peer_id, endpoint, p256dh, auth) "
                f"VALUES ('{peer_id}', '{endpoint}', '{p256dh}', '{auth_key}') "
                f"ON CONFLICT (peer_id) DO UPDATE SET endpoint = '{endpoint}', p256dh = '{p256dh}', auth = '{auth_key}'"
            )
            conn.commit()
            return resp(200, {'ok': True})
        finally:
            conn.close()

    elif method == 'GET' and action == 'vapid_public':
        vapid_pub = os.environ.get('VAPID_PUBLIC_KEY', '')
        return resp(200, {'vapid_public_key': vapid_pub})

    # --- ENVELOPES (offline messages) ---

    elif method == 'POST' and action == 'envelope_send':
        from_peer = body.get('from_peer_id', '')
        from_name = body.get('from_name', 'Аноним')
        to_peer = body.get('to_peer_id', '')
        room_code = body.get('room_code', '')
        encrypted_body = body.get('encrypted_body', '')
        if not from_peer or not to_peer or not encrypted_body or not room_code:
            return resp(400, {'error': 'from_peer_id, to_peer_id, room_code, encrypted_body обязательны'})

        conn = get_conn()
        try:
            cur = conn.cursor()
            env_id = str(uuid.uuid4())
            cur.execute(
                f"INSERT INTO {schema}.envelopes (id, to_peer_id, from_peer_id, from_name, room_code, encrypted_body) "
                f"VALUES ('{env_id}', '{to_peer}', '{from_peer}', '{from_name}', '{room_code}', '{encrypted_body}')"
            )
            conn.commit()

            send_push(schema, conn, to_peer, {
                'title': 'Hazy',
                'body': f'Сообщение от {from_name}',
                'url': '/'
            })

            return resp(201, {'id': env_id})
        finally:
            conn.close()

    elif method == 'GET' and action == 'envelope_fetch':
        peer_id = params.get('peer_id', '')
        if not peer_id:
            return resp(400, {'error': 'peer_id обязателен'})

        conn = get_conn()
        try:
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute(
                f"SELECT id, from_peer_id, from_name, room_code, encrypted_body, created_at "
                f"FROM {schema}.envelopes WHERE to_peer_id = '{peer_id}' ORDER BY created_at ASC"
            )
            rows = cur.fetchall()
            envelopes = [{
                'id': str(r['id']),
                'from_peer_id': r['from_peer_id'],
                'from_name': r['from_name'],
                'room_code': r['room_code'],
                'encrypted_body': r['encrypted_body'],
                'created_at': str(r['created_at']),
            } for r in rows]
            return resp(200, {'envelopes': envelopes})
        finally:
            conn.close()

    elif method == 'POST' and action == 'envelope_ack':
        ids = body.get('ids', [])
        peer_id = body.get('peer_id', '')
        if not ids or not peer_id:
            return resp(400, {'error': 'ids и peer_id обязательны'})

        conn = get_conn()
        try:
            cur = conn.cursor()
            ids_str = "','".join(ids)
            cur.execute(f"UPDATE {schema}.envelopes SET to_peer_id = 'ack' WHERE id IN ('{ids_str}') AND to_peer_id = '{peer_id}'")
            conn.commit()
            return resp(200, {'ok': True})
        finally:
            conn.close()

    return resp(400, {'error': 'action: create, join, status, signal, poll, push_subscribe, vapid_public, envelope_send, envelope_fetch, envelope_ack'})
