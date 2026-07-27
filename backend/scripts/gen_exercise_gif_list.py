# -*- coding: utf-8 -*-
"""Generate exercise GIF filename list + clear bad external meme GIFs."""
from __future__ import annotations

import asyncio
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.exercise import Exercise

# Exact name_ru (lower, ё→е) → english file slug (without .gif)
MANUAL: dict[str, str] = {
    "bird dog": "bird-dog",
    "dead bug": "dead-bug",
    "face pull": "face-pull",
    "hollow hold": "hollow-hold",
    "kettlebell swing": "kettlebell-swing",
    "mountain climbers": "mountain-climbers",
    "world greatest stretch": "worlds-greatest-stretch",
    # RU names currently in DB
    "птица-собака": "bird-dog",
    "мертвый жук": "dead-bug",
    "тяга к лицу": "face-pull",
    "удержание «лодочки»": "hollow-hold",
    "удержание \"лодочки\"": "hollow-hold",
    "удержание лодочки": "hollow-hold",
    "альпинисты": "mountain-climbers",
    "мировая растяжка": "worlds-greatest-stretch",
    "жим арнольда": "arnold-press",
    "комплекс присед + жим": "squat-to-press",
    "присед с жимом над головой": "squat-to-press",
    "приседания с гантелью у груди": "goblet-squat",
    "прыжки «звездой»": "jumping-jacks",
    "прыжки \"звездой\"": "jumping-jacks",
    "прыжки звездой": "jumping-jacks",
    "ягодичный мост со штангой": "barbell-hip-thrust",
    "австралийские подтягивания": "australian-pull-ups",
    "арнольд-жим": "arnold-press",
    "бег на месте": "running-in-place",
    "бёрпи": "burpees",
    "берпи": "burpees",
    "боковая планка": "side-plank",
    "боковые выпады": "lateral-lunges",
    "болгарские выпады": "bulgarian-split-squat",
    "велосипед": "bicycle-crunches",
    "велотренажёр": "stationary-bike",
    "велотренажер": "stationary-bike",
    "вращения таза": "hip-circles",
    "выпад + сгибание на бицепс": "lunge-bicep-curl",
    "выпады вперёд": "forward-lunges",
    "выпады вперед": "forward-lunges",
    "выпады назад с гантелями": "reverse-lunges-dumbbell",
    "высокие колени": "high-knees",
    "гиперэкстензия": "hyperextension",
    "гребля в тренажёре": "rowing-machine",
    "гребля в тренажере": "rowing-machine",
    "джампинг-джеки": "jumping-jacks",
    "жим в тренажёре": "chest-press-machine",
    "жим в тренажере": "chest-press-machine",
    "жим гантелей лёжа": "dumbbell-bench-press",
    "жим гантелей лежа": "dumbbell-bench-press",
    "жим гантелей на наклонной": "incline-dumbbell-press",
    "жим гантелей сидя": "seated-dumbbell-shoulder-press",
    "жим лёжа узким хватом": "close-grip-bench-press",
    "жим лежа узким хватом": "close-grip-bench-press",
    "жим ногами": "leg-press",
    "жим штанги лёжа": "bench-press",
    "жим штанги лежа": "bench-press",
    "жим штанги стоя": "overhead-press",
    "зашагивания на тумбу": "box-step-ups",
    "комплекс squat-to-press": "squat-to-press",
    "кошка-корова": "cat-cow",
    "махи гирей": "kettlebell-swings",
    "медвежья походка": "bear-crawl",
    "мобилизация голеностопа": "ankle-mobility",
    "мобилизация плеч с резинкой": "band-shoulder-mobility",
    "молотковые сгибания": "hammer-curls",
    "наклоны к носкам": "toe-touch-stretch",
    "обратные выпады с поворотом": "reverse-lunge-with-twist",
    "обратные разведения в тренажёре": "reverse-pec-deck",
    "обратные разведения в тренажере": "reverse-pec-deck",
    "отжимания на брусьях": "dips",
    "отжимания от пола": "push-ups",
    "отжимания с возвышения": "incline-push-ups",
    "отжимания с колен": "knee-push-ups",
    "отжимания узким хватом": "close-grip-push-ups",
    "планка": "plank",
    "планка с касанием плеч": "plank-shoulder-taps",
    "подтягивания": "pull-ups",
    "подъёмы гантелей перед собой": "front-dumbbell-raise",
    "подъемы гантелей перед собой": "front-dumbbell-raise",
    "подъёмы на носки сидя": "seated-calf-raise",
    "подъемы на носки сидя": "seated-calf-raise",
    "подъёмы на носки стоя": "standing-calf-raise",
    "подъемы на носки стоя": "standing-calf-raise",
    "подъёмы ног лёжа": "lying-leg-raises",
    "подъемы ног лежа": "lying-leg-raises",
    "поза голубя": "pigeon-pose",
    "присед + жим гантелей": "squat-dumbbell-press",
    "приседания гоблет": "goblet-squat",
    "приседания со своим весом": "bodyweight-squat",
    "приседания со штангой": "barbell-back-squat",
    "прыжки на скакалке": "jump-rope",
    "пуловер с гантелью": "dumbbell-pullover",
    "разведение гантелей лёжа": "dumbbell-fly",
    "разведение гантелей лежа": "dumbbell-fly",
    "разводка в наклоне": "bent-over-lateral-raise",
    "разводка гантелей в стороны": "lateral-raise",
    "разгибания гантели из-за головы": "overhead-triceps-extension",
    "разгибания на блоке": "cable-triceps-pushdown",
    "разгибания ног": "leg-extension",
    "раскрытие грудного отдела у стены": "wall-chest-opener",
    "растяжка грудных у дверного проёма": "doorway-chest-stretch",
    "растяжка грудных у дверного проема": "doorway-chest-stretch",
    "растяжка грушевидной": "piriformis-stretch",
    "растяжка сгибателей бедра": "hip-flexor-stretch",
    "румынская тяга": "romanian-deadlift",
    "румынская тяга с гантелями": "dumbbell-romanian-deadlift",
    "русские скручивания": "russian-twists",
    "сведение рук в кроссовере": "cable-crossover",
    "сгибания гантелей на бицепс": "dumbbell-bicep-curl",
    "сгибания на нижнем блоке": "cable-bicep-curl",
    "сгибания на скамье скотта": "preacher-curl",
    "сгибания ног лёжа": "lying-leg-curl",
    "сгибания ног лежа": "lying-leg-curl",
    "сгибания со штангой": "barbell-bicep-curl",
    "скейтер-прыжки": "skater-jumps",
    "скручивания": "crunches",
    "становая тяга классическая": "conventional-deadlift",
    "сумо-приседания": "sumo-squat",
    "трастеры с гантелями": "dumbbell-thrusters",
    "тяга верхнего блока": "lat-pulldown",
    "тяга гантели в наклоне": "single-arm-dumbbell-row",
    "тяга горизонтального блока": "seated-cable-row",
    "тяга к подбородку": "upright-row",
    "тяга резинки к поясу": "band-row",
    "тяга т-грифа": "t-bar-row",
    "тяга штанги в наклоне": "barbell-bent-over-row",
    "фермерская прогулка": "farmers-walk",
    "французский жим гантели": "dumbbell-skull-crusher",
    "фронтальные приседания": "front-squat",
    "хип-траст со штангой": "barbell-hip-thrust",
    "шраги с гантелями": "dumbbell-shrugs",
    "эллипс": "elliptical",
    "ягодичный мост": "glute-bridge",
}

TR = str.maketrans(
    {
        "а": "a",
        "б": "b",
        "в": "v",
        "г": "g",
        "д": "d",
        "е": "e",
        "ё": "e",
        "ж": "zh",
        "з": "z",
        "и": "i",
        "й": "y",
        "к": "k",
        "л": "l",
        "м": "m",
        "н": "n",
        "о": "o",
        "п": "p",
        "р": "r",
        "с": "s",
        "т": "t",
        "у": "u",
        "ф": "f",
        "х": "h",
        "ц": "ts",
        "ч": "ch",
        "ш": "sh",
        "щ": "sch",
        "ъ": "",
        "ы": "y",
        "ь": "",
        "э": "e",
        "ю": "yu",
        "я": "ya",
    }
)


def norm_key(name: str) -> str:
    return " ".join(name.strip().lower().replace("ё", "е").split())


def slugify(name: str) -> str:
    key = norm_key(name)
    if key in MANUAL:
        return MANUAL[key]
    # also try original lower with spaces collapsed
    raw = " ".join(name.strip().lower().split())
    if raw in MANUAL:
        return MANUAL[raw]
    s = name.translate(TR).lower()
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    s = re.sub(r"-{2,}", "-", s)
    return s or "exercise"


async def main() -> None:
    async with AsyncSessionLocal() as session:
        rows = list(
            await session.scalars(
                select(Exercise)
                .where(Exercise.is_deleted.is_(False))
                .order_by(Exercise.name_ru)
            )
        )
        items: list[dict] = []
        used: dict[str, int] = {}
        cleared = 0
        unmapped: list[str] = []

        for ex in rows:
            base = slugify(ex.name_ru)
            if norm_key(ex.name_ru) not in MANUAL and " ".join(ex.name_ru.strip().lower().split()) not in MANUAL:
                # transliteration path
                unmapped.append(ex.name_ru)
            n = used.get(base, 0)
            used[base] = n + 1
            slug = base if n == 0 else f"{base}-{n + 1}"
            fname = f"{slug}.gif"
            items.append(
                {
                    "id": str(ex.id),
                    "name_ru": ex.name_ru,
                    "muscle_group": ex.muscle_group,
                    "file": fname,
                    "animation_url": f"/exercise-gifs/{fname}",
                }
            )

            au = (ex.animation_url or "").strip()
            if au.startswith("http") and any(x in au for x in ("giphy.com", "tenor.com")):
                ex.animation_url = None
                if (ex.media_source or "") in {"giphy", "animation"}:
                    if ex.video_url and "youtu" in (ex.video_url or ""):
                        ex.media_source = "youtube"
                    elif ex.video_url:
                        ex.media_source = "external"
                    else:
                        ex.media_source = "none"
                cleared += 1

        await session.commit()

        repo = ROOT.parent
        gifs_dir = repo / "frontend" / "public" / "exercise-gifs"
        gifs_dir.mkdir(parents=True, exist_ok=True)

        lines = [
            "# Put GIF files with EXACT names into this folder",
            "# frontend/public/exercise-gifs/",
            "# After files are in place:",
            "#   cd backend",
            "#   python scripts/apply_local_exercise_gifs.py",
            "# columns: file | name_ru | muscle_group",
            "",
        ]
        for it in items:
            lines.append(
                f"{it['file']:42s}  |  {it['name_ru']}  |  {it.get('muscle_group') or '-'}"
            )
        (gifs_dir / "EXERCISE_GIFS.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
        (gifs_dir / "FILENAMES.txt").write_text(
            "\n".join(it["file"] for it in items) + "\n", encoding="utf-8"
        )
        (gifs_dir / "exercise-gifs-manifest.json").write_text(
            json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8"
        )

        md = [
            "# Список GIF-файлов для упражнений",
            "",
            f"Всего упражнений: **{len(items)}**.",
            "",
            "1. Скачайте или сделайте GIF техники.",
            "2. Переименуйте **точно** как в колонке `file` (например `bench-press.gif`).",
            "3. Положите файлы в `frontend/public/exercise-gifs/`.",
            "4. Выполните: `cd backend` → `python scripts/apply_local_exercise_gifs.py`",
            "",
            "Дубликаты slug получают суффикс `-2`, `-3`.",
            "",
            "Краткий список только имён: `frontend/public/exercise-gifs/FILENAMES.txt`",
            "",
            "| file | name_ru | muscle |",
            "|------|---------|--------|",
        ]
        for it in items:
            muscle = it.get("muscle_group") or "—"
            md.append(f"| `{it['file']}` | {it['name_ru']} | {muscle} |")
        (repo / "docs" / "exercise-gif-filenames.md").write_text(
            "\n".join(md) + "\n", encoding="utf-8"
        )

        print(f"exercises={len(items)} cleared_giphy={cleared} unmapped={len(unmapped)}")
        for name in unmapped:
            print(f"  unmapped: {name}")


if __name__ == "__main__":
    asyncio.run(main())
