from datetime import date

from app.services.workout_service import phase_meta_from_name, resolve_week_phase_meta


def test_phase_targets_keep_repetitions_in_reserve() -> None:
    light = phase_meta_from_name("light")
    medium = phase_meta_from_name("medium")
    heavy = phase_meta_from_name("heavy")

    assert (light["target_reps"], light["week_rir"]) == ("12-15", "4–5 повторов в запасе")
    assert (medium["target_reps"], medium["week_rir"]) == ("8-10", "3 повтора в запасе")
    assert (heavy["target_reps"], heavy["week_rir"]) == ("5-8", "1–2 повтора в запасе")
    assert resolve_week_phase_meta(date(2026, 9, 7), date(2026, 9, 21)) == {
        **heavy,
        "cycle_index": 0,
    }
