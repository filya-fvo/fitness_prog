-- Stage 0: nutrition_products + nutrition_logs (fitness-tz.md §4)
-- pg_trgm index on nutrition_products.name_ru for autocomplete search

CREATE TABLE IF NOT EXISTS nutrition_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name_ru TEXT NOT NULL,
    barcode TEXT,
    calories NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (calories >= 0),
    proteins NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (proteins >= 0),
    fats NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (fats >= 0),
    carbs NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (carbs >= 0),
    category TEXT,
    source nutrition_source NOT NULL DEFAULT 'manual',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_nutrition_products_barcode ON nutrition_products (barcode)
    WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nutrition_products_category ON nutrition_products (category);
CREATE INDEX IF NOT EXISTS idx_nutrition_products_is_deleted
    ON nutrition_products (is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_nutrition_products_name_ru_trgm
    ON nutrition_products USING gin (name_ru gin_trgm_ops);

CREATE TABLE IF NOT EXISTS nutrition_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users (id),
    date DATE NOT NULL,
    meal_type meal_type NOT NULL,
    product_id UUID NOT NULL REFERENCES nutrition_products (id),
    quantity_grams NUMERIC(10, 2) NOT NULL CHECK (quantity_grams > 0),
    calculated_kbj JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_nutrition_logs_user_id ON nutrition_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_nutrition_logs_date ON nutrition_logs (date);
CREATE INDEX IF NOT EXISTS idx_nutrition_logs_user_date ON nutrition_logs (user_id, date);
CREATE INDEX IF NOT EXISTS idx_nutrition_logs_product_id ON nutrition_logs (product_id);
CREATE INDEX IF NOT EXISTS idx_nutrition_logs_is_deleted
    ON nutrition_logs (is_deleted) WHERE is_deleted = FALSE;

COMMENT ON COLUMN nutrition_logs.calculated_kbj IS 'JSONB snapshot: calories, proteins, fats, carbs for quantity_grams';
