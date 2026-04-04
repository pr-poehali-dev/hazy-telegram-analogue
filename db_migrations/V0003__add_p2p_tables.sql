
CREATE TABLE pending_envelopes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES chats(id),
    sender_id UUID NOT NULL REFERENCES users(id),
    recipient_id UUID NOT NULL REFERENCES users(id),
    encrypted_body TEXT NOT NULL,
    iv VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE signaling (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES chats(id),
    from_user_id UUID NOT NULL REFERENCES users(id),
    to_user_id UUID NOT NULL REFERENCES users(id),
    signal_type VARCHAR(20) NOT NULL,
    payload TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pending_envelopes_recipient ON pending_envelopes(recipient_id);
CREATE INDEX idx_pending_envelopes_chat ON pending_envelopes(chat_id);
CREATE INDEX idx_signaling_to_user ON signaling(to_user_id);
CREATE INDEX idx_signaling_chat ON signaling(chat_id);
