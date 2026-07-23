-- Stage 0: shared enums from fitness-tz.md §4

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
        CREATE TYPE subscription_status AS ENUM ('free', 'pro_stars');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'workout_status') THEN
        CREATE TYPE workout_status AS ENUM ('planned', 'completed', 'skipped');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'meal_type') THEN
        CREATE TYPE meal_type AS ENUM ('breakfast', 'lunch', 'dinner', 'snack');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ai_message_role') THEN
        CREATE TYPE ai_message_role AS ENUM ('user', 'assistant');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'nutrition_source') THEN
        CREATE TYPE nutrition_source AS ENUM ('openfoodfacts', 'manual');
    END IF;
END
$$;
