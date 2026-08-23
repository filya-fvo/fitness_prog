-- Normalize the Windows development fallback after pg_dump/pg_restore.
-- Local PostgreSQL without pgvector stores exercises.embedding as double precision[].

CREATE EXTENSION IF NOT EXISTS "vector";

DO $$
DECLARE
    embedding_type TEXT;
BEGIN
    IF to_regclass('public.exercises') IS NULL THEN
        RETURN;
    END IF;

    SELECT format_type(attribute.atttypid, attribute.atttypmod)
    INTO embedding_type
    FROM pg_attribute AS attribute
    WHERE attribute.attrelid = 'public.exercises'::regclass
      AND attribute.attname = 'embedding'
      AND NOT attribute.attisdropped;

    IF embedding_type = 'double precision[]' THEN
        IF EXISTS (
            SELECT 1
            FROM exercises
            WHERE embedding IS NOT NULL
              AND cardinality(embedding) <> 1536
        ) THEN
            RAISE EXCEPTION
                'Cannot convert exercises.embedding: non-null arrays must have 1536 elements';
        END IF;

        ALTER TABLE exercises
            ALTER COLUMN embedding TYPE vector(1536)
            USING embedding::vector(1536);
        embedding_type := 'vector(1536)';
    END IF;

    IF embedding_type = 'vector(1536)'
       AND to_regclass('public.idx_exercises_embedding_hnsw') IS NULL THEN
        EXECUTE 'CREATE INDEX idx_exercises_embedding_hnsw '
            'ON exercises USING hnsw (embedding vector_cosine_ops)';
    END IF;
END $$;
