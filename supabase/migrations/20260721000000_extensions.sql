-- Stage 0: required PostgreSQL extensions (Supabase)
-- TZ §4 + instruction Stage 0: pgvector for exercise embeddings, pg_trgm for product search

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
