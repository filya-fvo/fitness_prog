"""Exercise input kind; contract fixtures are shared with the existing web classifier."""
import re
from typing import Literal

LoadType = Literal["weight_reps", "reps_only", "timed", "cardio_machine"]
_MACHINE = re.compile(r"беговая|дорожк|эллипс|велотренаж|гребл|row|elliptical|treadmill|bike", re.I)
_TIMED = re.compile(r"планка|удержание|лодочк|hollow|dead bug|мертвый жук|bird dog|птица-собака|растяж|мобил|поза |наклоны к|кошка-?корова|вращения таза|раскрытие груд|голеностоп", re.I)
_BODY_CARDIO = re.compile(r"бёрпи|берпи|альпинист|скакал|звезд|скейтер|высокие колени|jumping jack|burpee|mountain climber", re.I)
_REPS = re.compile(r"подтягиван|отжиман|брусь|австралийск|diamond push|pull-up|push-up", re.I)
_WEIGHTED = re.compile(r"гантел|штан|блок|тренаж|cable|barbell|dumbbell", re.I)


def infer_load_type(exercise) -> LoadType:
    name = (exercise.name_ru or "").lower()
    equipment = (exercise.equipment or "").lower()
    tags = {tag.lower() for tag in (exercise.tags or [])}
    if _MACHINE.search(name) or _MACHINE.search(equipment) or tags & {"cardio_machine", "load:cardio_machine"}:
        return "cardio_machine"
    if tags & {"timed", "load:timed"}:
        return "timed"
    if tags & {"reps_only", "load:reps_only"}:
        return "reps_only"
    if tags & {"weight_reps", "load:weight_reps"}:
        return "weight_reps"
    if _TIMED.search(name) or _BODY_CARDIO.search(name):
        return "timed"
    if _REPS.search(name) and not _WEIGHTED.search(name + equipment):
        return "reps_only"
    return "weight_reps"
