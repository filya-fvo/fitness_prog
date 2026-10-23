-- Extend existing one-use bot challenge without changing anonymous login semantics.
ALTER TABLE android_login_requests
    ADD COLUMN purpose varchar(16) NOT NULL DEFAULT 'login',
    ADD COLUMN owner_user_id uuid REFERENCES users(id),
    ADD CONSTRAINT android_login_request_purpose CHECK (
        (purpose = 'login' AND owner_user_id IS NULL) OR
        (purpose = 'link' AND owner_user_id IS NOT NULL)
    );
CREATE INDEX idx_android_login_requests_owner ON android_login_requests(owner_user_id);
