-- A user's corrected product values apply to future diary entries without changing the shared catalog.
CREATE TABLE IF NOT EXISTS nutrition_personal_values (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES nutrition_products(id) ON DELETE CASCADE,
    kbju JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, product_id)
);
