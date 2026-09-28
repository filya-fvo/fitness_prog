-- Personal diary overrides are immediate; shared product values need an admin review.
CREATE TABLE IF NOT EXISTS nutrition_corrections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES nutrition_products(id) ON DELETE RESTRICT,
    source_log_id UUID NOT NULL REFERENCES nutrition_logs(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    original_kbju JSONB NOT NULL,
    proposed_kbju JSONB NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
    reviewed_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_nutrition_corrections_pending_log
    ON nutrition_corrections(source_log_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_nutrition_corrections_status_created
    ON nutrition_corrections(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nutrition_corrections_product
    ON nutrition_corrections(product_id);
