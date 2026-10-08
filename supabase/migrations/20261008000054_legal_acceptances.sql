-- No automatic acceptance for existing accounts. Each explicit choice is separate.
CREATE TABLE IF NOT EXISTS public.legal_acceptances (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    document_id varchar(16) NOT NULL CHECK (document_id IN ('privacy', 'consent', 'offer')),
    revision varchar(32) NOT NULL,
    text_sha256 varchar(64) NOT NULL CHECK (text_sha256 ~ '^[a-f0-9]{64}$'),
    accepted_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_legal_acceptance_revision UNIQUE (user_id, document_id, revision)
);
