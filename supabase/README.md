# Supabase migrations

Apply in order on a fresh Supabase (PostgreSQL) project.

## Files

| File | Purpose |
|------|---------|
| `migrations/20260721000000_extensions.sql` | pgcrypto, uuid-ossp, vector, pg_trgm |
| `migrations/20260721000001_enums.sql` | subscription, workout, meal, AI role enums |
| `migrations/20260721000002_users.sql` | users |
| `migrations/20260721000003_exercises.sql` | exercises + `embedding vector(1536)` + HNSW |
| `migrations/20260721000004_programs.sql` | programs |
| `migrations/20260721000005_workouts.sql` | workouts, workout_sets |
| `migrations/20260721000006_nutrition.sql` | nutrition_products (`pg_trgm`), nutrition_logs |
| `migrations/20260721000007_ai_conversations.sql` | ai_conversations |
| `migrations/20260721000008_updated_at_triggers.sql` | `updated_at` triggers |

## Apply (SQL Editor)

Run each file top-to-bottom in the Supabase SQL Editor, or via CLI:

```bash
supabase db push
```

## Notes from TZ

- Every table has `created_at`, `updated_at`, `is_deleted`
- Soft delete is preferred over hard delete
- Product search uses `gin_trgm_ops` on `nutrition_products.name_ru`
