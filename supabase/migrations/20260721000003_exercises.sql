-- Stage 0: exercises table (fitness-tz.md §4)
-- embedding vector(1536) for RAG; media URLs point to Cloudflare R2

CREATE TABLE IF NOT EXISTS exercises (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name_ru TEXT NOT NULL,
    muscle_group TEXT NOT NULL,
    equipment TEXT,
    description TEXT,
    technique TEXT,
    common_mistakes TEXT,
    difficulty SMALLINT NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),
    video_url TEXT,
    animation_url TEXT,
    embedding vector(1536),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_exercises_muscle_group ON exercises (muscle_group);
CREATE INDEX IF NOT EXISTS idx_exercises_difficulty ON exercises (difficulty);
CREATE INDEX IF NOT EXISTS idx_exercises_is_deleted ON exercises (is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_exercises_name_ru_trgm ON exercises USING gin (name_ru gin_trgm_ops);

-- IVFFlat requires data; create after seed. HNSW is safer for incremental inserts on Supabase.
CREATE INDEX IF NOT EXISTS idx_exercises_embedding_hnsw
    ON exercises
    USING hnsw (embedding vector_cosine_ops);
