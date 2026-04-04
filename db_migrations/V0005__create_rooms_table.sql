
CREATE TABLE rooms (
    code VARCHAR(12) PRIMARY KEY,
    creator_peer_id VARCHAR(64) NOT NULL,
    creator_name VARCHAR(100) NOT NULL,
    joiner_peer_id VARCHAR(64),
    joiner_name VARCHAR(100),
    status VARCHAR(20) DEFAULT 'waiting',
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ DEFAULT now() + interval '5 minutes'
);

CREATE TABLE room_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_code VARCHAR(12) NOT NULL REFERENCES rooms(code),
    from_peer_id VARCHAR(64) NOT NULL,
    to_peer_id VARCHAR(64) NOT NULL,
    signal_type VARCHAR(20) NOT NULL,
    payload TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_room_signals_to_peer ON room_signals(to_peer_id);
CREATE INDEX idx_rooms_expires ON rooms(expires_at);
