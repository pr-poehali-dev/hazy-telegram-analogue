
CREATE TABLE push_subscriptions (
    peer_id VARCHAR(64) PRIMARY KEY,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE envelopes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    to_peer_id VARCHAR(64) NOT NULL,
    from_peer_id VARCHAR(64) NOT NULL,
    from_name VARCHAR(100) NOT NULL,
    room_code VARCHAR(12) NOT NULL,
    encrypted_body TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_envelopes_to_peer ON envelopes(to_peer_id);
