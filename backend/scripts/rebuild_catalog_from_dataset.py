# -*- coding: utf-8 -*-
"""
Rebuild exercise catalog + GIFs from hasaneyldrm/exercises-dataset (Gym visual).

Steps:
1. Archive current frontend/public/exercise-gifs/* → backups/exercise-gifs-archive-<ts>/
2. Build curated RU catalog mapped to dataset EN names
3. Download only needed GIFs from GitHub raw into exercise-gifs/
4. Write seed_content/exercises.json (+ renames)
5. Rebuild programs.json from build_programs_v2 blocks (names must match)
6. Soft-delete DB exercises not in new catalog; upsert exercises + programs
7. Write quality report

Usage (from backend/ with venv):
  python scripts/rebuild_catalog_from_dataset.py
  python scripts/rebuild_catalog_from_dataset.py --skip-download   # if GIFs already local
  python scripts/rebuild_catalog_from_dataset.py --dry-run
"""
from __future__ import annotations

import argparse
import asyncio
import json
import re
import shutil
import sys
import urllib.error
import urllib.request
import uuid
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import select  # noqa: E402

from app.core.database import AsyncSessionLocal  # noqa: E402
from app.models.exercise import Exercise  # noqa: E402
from app.models.program import Program  # noqa: E402

DS_PATH = REPO / "backups" / "exercises-dataset-src" / "data" / "exercises.json"
GIFS_DIR = REPO / "frontend" / "public" / "exercise-gifs"
SEED_EX = ROOT / "scripts" / "seed_content" / "exercises.json"
SEED_PR = ROOT / "scripts" / "seed_content" / "programs.json"
REPORT = REPO / "backups" / "catalog_rebuild_report.json"
RAW_BASE = "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/"

# Russian display name → preferred dataset English names (first hit wins)
CATALOG: list[tuple[str, list[str], str, int]] = [
    # (name_ru, [ds_name candidates], muscle_group_fallback, difficulty 1-5)
    # Legs / glutes
    ("Приседания со штангой", ["barbell full squat", "barbell high bar squat"], "ноги", 3),
    ("Фронтальные приседания", ["barbell front squat"], "ноги", 4),
    ("Сумо-приседания", ["barbell wide squat", "smith sumo squat"], "ноги", 3),
    ("Приседания со своим весом", ["jump squat", "bodyweight drop jump squat"], "ноги", 1),
    ("Приседания с гантелью у груди", ["dumbbell goblet squat"], "ноги", 2),
    ("Приседания в машине Смита", ["smith full squat", "smith squat"], "ноги", 3),
    ("Гакк-приседания", ["sled hack squat", "sled closer hack squat"], "ноги", 2),
    ("Болгарские приседания в машине Смита", ["smith single leg split squat"], "ноги", 3),
    ("Жим ногами", ["sled 45° leg press", "sled 45 leg press", "lever leg press"], "ноги", 2),
    ("Разгибания ног", ["lever leg extension"], "ноги", 2),
    ("Сгибания ног лёжа", ["lever lying leg curl"], "ноги", 2),
    ("Румынская тяга", ["barbell romanian deadlift"], "ноги", 3),
    ("Румынская тяга с гантелями", ["dumbbell romanian deadlift"], "ноги", 3),
    ("Становая тяга классическая", ["barbell deadlift"], "ноги", 4),
    ("Болгарские выпады", ["dumbbell single leg split squat", "split squats"], "ноги", 3),
    ("Выпады вперёд", ["dumbbell lunge", "forward lunge (male)", "barbell lunge"], "ноги", 2),
    ("Выпады назад с гантелями", ["dumbbell rear lunge", "barbell rear lunge"], "ноги", 2),
    ("Боковые выпады", ["barbell lateral lunge"], "ноги", 2),
    ("Зашагивания на тумбу", ["dumbbell step-up"], "ноги", 2),
    ("Ягодичный мост", ["low glute bridge on floor"], "ноги", 1),
    ("Ягодичный мост со штангой", ["barbell glute bridge"], "ноги", 3),
    ("Ягодичный мост в машине Смита", ["smith hip raise"], "ноги", 3),
    ("Сгибания ног сидя", ["lever seated leg curl"], "ноги", 2),
    ("Подъёмы на носки стоя в тренажёре", ["lever standing calf raise"], "ноги", 2),
    ("Подъёмы на носки стоя", ["barbell standing calf raise", "dumbbell standing calf raise", "bodyweight standing calf raise"], "ноги", 1),
    ("Подъёмы на носки сидя", ["lever seated calf raise", "barbell seated calf raise"], "ноги", 1),
    # Chest
    ("Жим штанги лёжа", ["barbell bench press"], "грудь", 3),
    ("Жим гантелей лёжа", ["dumbbell bench press"], "грудь", 2),
    ("Жим гантелей на наклонной", ["dumbbell incline bench press"], "грудь", 3),
    ("Жим лёжа узким хватом", ["barbell close-grip bench press"], "грудь", 3),
    ("Жим в тренажёре", ["lever chest press", "cable seated chest press"], "грудь", 2),
    ("Жим лёжа в машине Смита", ["smith bench press"], "грудь", 3),
    ("Жим на наклонной в тренажёре", ["lever incline chest press"], "грудь", 2),
    ("Сведение рук в тренажёре «бабочка»", ["lever seated fly"], "грудь", 2),
    ("Разведение гантелей лёжа", ["dumbbell fly"], "грудь", 2),
    ("Сведение рук в кроссовере", ["cable middle fly", "cable standing fly"], "грудь", 2),
    ("Кроссовер на верхних блоках", ["cable decline fly"], "грудь", 2),
    ("Отжимания от пола", ["push-up"], "грудь", 2),
    ("Отжимания с колен", ["kneeling push-up (male)"], "грудь", 1),
    ("Отжимания с возвышения", ["incline push-up"], "грудь", 1),
    ("Отжимания узким хватом", ["diamond push-up"], "грудь", 2),
    ("Отжимания на брусьях", ["chest dip", "triceps dip"], "грудь", 3),
    # Back
    ("Подтягивания", ["pull-up", "weighted pull-up"], "спина", 4),
    ("Австралийские подтягивания", ["inverted row"], "спина", 2),
    ("Тяга штанги в наклоне", ["barbell bent over row"], "спина", 3),
    ("Тяга гантели в наклоне", ["dumbbell one arm bent-over row"], "спина", 2),
    ("Тяга верхнего блока", ["cable bar lateral pulldown", "cable pulldown (pro lat bar)"], "спина", 2),
    ("Тяга верхнего блока обратным хватом", ["cable underhand pulldown"], "спина", 2),
    ("Тяга горизонтального блока", ["cable seated row"], "спина", 2),
    ("Тяга с упором грудью в тренажёре", ["lever seated row", "lever high row"], "спина", 2),
    ("Тяга верхнего блока нейтральным хватом", ["twin handle parallel grip lat pulldown", "cable lateral pulldown with v-bar"], "спина", 2),
    ("Тяга Т-грифа", ["lever reverse t-bar row", "lever t-bar row"], "спина", 3),
    ("Тяга резинки к поясу", ["resistance band seated straight back row", "band one arm standing low row"], "спина", 1),
    ("Пуловер с гантелью", ["dumbbell pullover"], "спина", 2),
    ("Пуловер с гантелью лёжа поперёк скамьи", ["dumbbell pullover"], "спина", 2),
    ("Пуловер в блоке на спину", ["cable straight arm pulldown"], "спина", 2),
    ("Подтягивания обратным хватом", ["reverse grip pull-up"], "спина", 3),
    ("Гиперэкстензия", ["hyperextension", "back extension 45 degrees"], "спина", 2),
    ("Тяга к лицу", ["cable rear delt row (with rope)", "cable standing rear delt row (with rope)"], "спина", 2),
    # Shoulders
    ("Жим штанги стоя", ["barbell standing wide military press", "barbell standing close grip military press"], "плечи", 3),
    ("Жим гантелей сидя", ["dumbbell seated shoulder press"], "плечи", 2),
    ("Жим вверх в тренажёре сидя", ["lever shoulder press"], "плечи", 2),
    ("Жим Арнольда", ["dumbbell arnold press"], "плечи", 3),
    ("Разводка гантелей в стороны", ["dumbbell lateral raise"], "плечи", 2),
    ("Махи гантелями в стороны", ["dumbbell lateral raise"], "плечи", 2),
    ("Отведение руки в сторону на блоке", ["cable lateral raise"], "плечи", 2),
    ("Разводка в наклоне", ["dumbbell rear delt raise", "dumbbell bent over reverse fly"], "плечи", 2),
    ("Подъёмы гантелей перед собой", ["dumbbell front raise"], "плечи", 2),
    ("Обратные разведения в тренажёре", ["lever seated reverse fly"], "плечи", 2),
    ("Тяга к подбородку", ["barbell upright row"], "плечи", 2),
    ("Шраги с гантелями", ["dumbbell shrug"], "плечи", 2),
    # Arms
    ("Сгибания гантелей на бицепс", ["dumbbell biceps curl"], "бицепс", 2),
    ("Сгибания гантелей на бицепс на наклонной скамье", ["dumbbell incline biceps curl"], "бицепс", 2),
    ("Сгибания со штангой", ["barbell curl"], "бицепс", 2),
    ("Молотковые сгибания", ["dumbbell hammer curl"], "бицепс", 2),
    ("Сгибания на скамье Скотта", ["barbell preacher curl"], "бицепс", 2),
    ("Сгибания на нижнем блоке", ["cable curl"], "бицепс", 2),
    ("Разгибания на блоке", ["cable pushdown", "cable triceps pushdown (v-bar)"], "трицепс", 2),
    ("Разгибания гантели из-за головы", ["dumbbell seated triceps extension", "dumbbell standing triceps extension"], "трицепс", 2),
    ("Французский жим гантели", ["dumbbell lying triceps extension"], "трицепс", 2),
    ("Французский жим со штангой", ["barbell lying triceps extension"], "трицепс", 3),
    ("Французский жим EZ-грифом", ["ez bar lying close grip triceps extension behind head"], "трицепс", 2),
    ("Французский жим стоя со штангой", ["barbell standing overhead triceps extension"], "трицепс", 3),
    ("Разгибания из-за головы на блоке", ["cable overhead triceps extension (rope attachment)"], "трицепс", 2),
    ("Жим вниз на блоке канатом", ["cable pushdown (with rope attachment)"], "трицепс", 2),
    # Core
    ("Планка", ["weighted front plank", "power point plank"], "кор", 2),
    ("Боковая планка", ["bodyweight incline side plank", "side plank hip adduction"], "кор", 2),
    ("Планка с касанием плеч", ["shoulder tap", "kneeling plank tap shoulder (male)"], "кор", 2),
    ("Скручивания", ["crunch floor"], "кор", 1),
    ("Скручивания на верхнем блоке", ["cable kneeling crunch"], "кор", 2),
    ("Велосипед", ["air bike", "band bicycle crunch"], "кор", 2),
    ("Русские скручивания", ["russian twist"], "кор", 2),
    ("Жим Паллофа с резинкой", ["band horizontal pallof press"], "кор", 2),
    ("Подъёмы ног лёжа", ["lying leg raise flat bench", "hanging leg raise"], "кор", 2),
    ("Мёртвый жук", ["dead bug"], "кор", 1),
    # dataset has no exact bird-dog / hollow-hold — closest core-stability GIFs
    ("Птица-собака", ["front plank with twist", "power point plank"], "кор", 1),
    ("Удержание «лодочки»", ["band v-up", "weighted front plank"], "кор", 2),
    ("Альпинисты", ["mountain climber"], "кор", 2),
    # Cardio / conditioning
    ("Бёрпи", ["burpee"], "кардио", 3),
    ("Беговая дорожка", ["walking on incline treadmill"], "кардио", 1),
    ("Высокие колени", ["high knee against wall", "walking high knees lunge"], "кардио", 1),
    ("Прыжки на скакалке", ["jump rope"], "кардио", 2),
    ("Прыжки «звездой»", ["star jump (male)", "jack jump (male)"], "кардио", 1),
    ("Скейтер-прыжки", ["skater hops"], "кардио", 2),
    ("Эллипс", ["walk elliptical cross trainer", "cycle cross trainer"], "кардио", 1),
    ("Велотренажёр", ["stationary bike walk", "stationary bike run v. 3"], "кардио", 1),
    ("Махи гирей", ["kettlebell swing"], "кардио", 3),
    ("Фермерская прогулка", ["farmers walk"], "full_body", 3),
    ("Медвежья походка", ["bear crawl"], "full_body", 2),
    # Complex / full body
    ("Присед + жим гантелей", ["kettlebell thruster", "barbell thruster"], "full_body", 3),
    ("Присед с жимом над головой", ["barbell thruster"], "full_body", 3),
    ("Комплекс присед + жим", ["barbell thruster"], "full_body", 3),
    ("Выпад + сгибание на бицепс", ["dumbbell lunge with bicep curl", "dumbbell lunge"], "full_body", 2),
    ("Обратные выпады с поворотом", ["lunge with twist", "dumbbell rear lunge"], "full_body", 2),
    # Mobility / stretch (best available GIFs)
    ("Кошка-корова", ["spine stretch"], "мобильность", 1),
    ("Мобилизация голеностопа", ["ankle circles"], "мобильность", 1),
    ("Мобилизация плеч с резинкой", ["band standing rear delt row", "band front raise"], "мобильность", 1),
    ("Поза голубя", ["seated piriformis stretch"], "мобильность", 1),
    ("Растяжка грушевидной", ["seated piriformis stretch"], "мобильность", 1),
    ("Растяжка сгибателей бедра", ["intermediate hip flexor and quad stretch"], "мобильность", 1),
    ("Раскрытие грудного отдела у стены", ["dynamic chest stretch (male)"], "мобильность", 1),
    ("Растяжка грудных у дверного проёма", ["dynamic chest stretch (male)"], "мобильность", 1),
    ("Наклоны к носкам", ["basic toe touch (male)", "hamstring stretch"], "мобильность", 1),
    ("Мировая растяжка", ["world greatest stretch"], "мобильность", 1),
]

# The source dataset has no sufficiently accurate animation for these movements.
# Showing no GIF is safer than teaching a different exercise or equipment variant.
NO_EXACT_GIF = {
    "Приседания со своим весом",
    "Планка",
    "Боковая планка",
    "Птица-собака",
    "Удержание «лодочки»",
    "Высокие колени",
    "Присед + жим гантелей",
    "Кошка-корова",
    "Мобилизация плеч с резинкой",
    "Поза голубя",
    "Раскрытие грудного отдела у стены",
    "Растяжка грудных у дверного проёма",
}

MUSCLE_MAP = {
    "chest": "грудь",
    "pectorals": "грудь",
    "back": "спина",
    "lats": "спина",
    "upper back": "спина",
    "spine": "спина",
    "traps": "спина",
    "shoulders": "плечи",
    "delts": "плечи",
    "upper arms": "руки",
    "biceps": "бицепс",
    "triceps": "трицепс",
    "lower arms": "предплечья",
    "forearms": "предплечья",
    "upper legs": "ноги",
    "quads": "ноги",
    "quadriceps": "ноги",
    "hamstrings": "ноги",
    "glutes": "ноги",
    "abductors": "ноги",
    "adductors": "ноги",
    "lower legs": "ноги",
    "calves": "ноги",
    "waist": "кор",
    "abs": "кор",
    "cardio": "кардио",
    "neck": "мобильность",
}

EQUIP_RU = {
    "barbell": "штанга",
    "dumbbell": "гантели",
    "body weight": "свой вес",
    "cable": "блок/кроссовер",
    "band": "резинка",
    "kettlebell": "гиря",
    "leverage machine": "тренажёр",
    "smith machine": "машина смита",
    "ez barbell": "EZ-гриф",
    "stability ball": "фитбол",
    "weighted": "с отягощением",
    "assisted": "с поддержкой",
    "rope": "канат",
    "stationary bike": "велотренажёр",
    "elliptical machine": "эллипс",
    "sled machine": "тренажёр",
}


def norm(s: str) -> str:
    s = (s or "").strip().lower().replace("ё", "е")
    s = re.sub(r"[«»\"'`]", " ", s)
    s = re.sub(r"[^a-z0-9а-я\s\-\+°]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def load_dataset() -> list[dict]:
    if not DS_PATH.is_file():
        raise SystemExit(f"Missing dataset JSON: {DS_PATH}. Clone hasaneyldrm/exercises-dataset first.")
    return json.loads(DS_PATH.read_text(encoding="utf-8"))


def index_dataset(data: list[dict]) -> tuple[dict[str, dict], dict[str, dict]]:
    by_exact = {(d.get("name") or "").lower(): d for d in data}
    by_norm = {norm(d.get("name") or ""): d for d in data}
    return by_exact, by_norm


def resolve_ds(candidates: list[str], by_exact: dict, by_norm: dict) -> dict | None:
    for h in candidates:
        ds = by_exact.get(h.lower())
        if ds:
            return ds
        ds = by_norm.get(norm(h))
        if ds:
            return ds
        hn = norm(h)
        cands = []
        for nrm, item in by_norm.items():
            if nrm == hn or nrm.startswith(hn + " ") or (" " + hn + " ") in (" " + nrm + " "):
                if any(b in nrm for b in ("female", "bowling", "tennis ball", "on knees")):
                    continue
                cands.append(item)
        if len(cands) == 1:
            return cands[0]
        if cands:
            cands.sort(key=lambda d: len(d.get("name") or ""))
            return cands[0]
    return None


def muscle_from_ds(ds: dict, fallback: str) -> str:
    for key in (ds.get("target"), ds.get("body_part"), ds.get("category"), ds.get("muscle_group")):
        m = MUSCLE_MAP.get(norm(key or ""), None)
        if m:
            return m
    return fallback or "full_body"


def equipment_ru(ds: dict) -> str | None:
    e = norm(ds.get("equipment") or "")
    return EQUIP_RU.get(e, ds.get("equipment") or None)


def technique_from_ds(ds: dict) -> str:
    steps = (ds.get("instruction_steps") or {}).get("ru")
    if isinstance(steps, list) and steps:
        return "\n".join(f"{i+1}. {str(s).strip()}" for i, s in enumerate(steps) if str(s).strip())
    text = (ds.get("instructions") or {}).get("ru") or (ds.get("instructions") or {}).get("en") or ""
    return str(text).strip()


def description_from_ds(ds: dict, name_ru: str) -> str:
    target = ds.get("target") or ""
    body = ds.get("body_part") or ds.get("category") or ""
    equip = ds.get("equipment") or ""
    return (
        f"{name_ru}. Цель: {target or body}. Оборудование: {equip}. "
        f"© Gym visual — https://gymvisual.com/"
    )


def gif_filename(ds: dict) -> str:
    gif_url = ds.get("gif_url") or ""
    if gif_url:
        return Path(gif_url).name
    return f"{ds.get('id')}.gif"


def download_gif(gif_url: str, dest: Path) -> bool:
    if dest.exists() and dest.stat().st_size > 1000:
        return True
    url = RAW_BASE + gif_url.lstrip("/")
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "fitness_prog/1.0"})
        with urllib.request.urlopen(req, timeout=90) as resp:
            data = resp.read()
        if len(data) < 500:
            return False
        dest.write_bytes(data)
        return True
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        print("download_fail", gif_url, exc)
        return False


def archive_old_gifs() -> Path | None:
    GIFS_DIR.mkdir(parents=True, exist_ok=True)
    files = [
        p
        for p in GIFS_DIR.iterdir()
        if p.is_file() and p.suffix.lower() in {".gif", ".webp", ".png", ".jpg", ".jpeg"}
    ]
    if not files:
        print("archive: no media files to move")
        return None
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = REPO / "backups" / f"exercise-gifs-archive-{ts}"
    dest.mkdir(parents=True, exist_ok=True)
    for p in files:
        shutil.move(str(p), str(dest / p.name))
    # also move old helper lists if present
    for name in ("EXERCISE_GIFS.txt", "FILENAMES.txt", "DOWNLOAD_CHECKLIST.txt", "exercise-gifs-manifest.json"):
        src = GIFS_DIR / name
        if src.is_file():
            shutil.move(str(src), str(dest / name))
    print(f"archive: moved {len(files)} media files → {dest}")
    return dest


def _load_prev_video_maps() -> tuple[dict[str, str], dict[str, str]]:
    """name_ru -> video_url from previous seed and checklist (checklist wins)."""
    from_seed: dict[str, str] = {}
    from_csv: dict[str, str] = {}
    if SEED_EX.is_file():
        try:
            prev_seed = json.loads(SEED_EX.read_text(encoding="utf-8"))
            for x in prev_seed:
                name = str(x.get("name_ru") or "").strip()
                url = (x.get("video_url") or "").strip() if isinstance(x.get("video_url"), str) else ""
                if name and url:
                    from_seed[name] = url
        except Exception as exc:
            print("warn: prev seed video map:", exc)
    checklist = REPO / "docs" / "exercise-media-checklist.csv"
    if checklist.is_file():
        try:
            import csv as _csv

            with checklist.open(encoding="utf-8-sig", newline="") as f:
                for crow in _csv.DictReader(f, delimiter=";"):
                    name = (crow.get("name_ru") or "").strip()
                    url = (crow.get("video_url") or "").strip()
                    if name and url:
                        from_csv[name] = url
        except Exception as exc:
            print("warn: checklist video map:", exc)
    return from_seed, from_csv


def build_seed_rows(
    by_exact: dict,
    by_norm: dict,
    *,
    skip_download: bool,
) -> tuple[list[dict], list[dict]]:
    rows: list[dict] = []
    report: list[dict] = []
    seen_ru: set[str] = set()
    prev_videos_seed, prev_videos_csv = _load_prev_video_maps()

    for name_ru, candidates, muscle_fb, difficulty in CATALOG:
        if name_ru in seen_ru:
            continue
        seen_ru.add(name_ru)
        ds = resolve_ds(candidates, by_exact, by_norm)
        entry: dict = {
            "name_ru": name_ru,
            "candidates": candidates,
            "matched": None,
            "gif_ok": False,
        }
        if not ds:
            entry["error"] = "no_dataset_match"
            report.append(entry)
            print("MISS", name_ru, candidates)
            continue

        gif_url = ds.get("gif_url") or ""
        fname = gif_filename(ds)
        dest = GIFS_DIR / fname
        gif_ok = False
        if gif_url:
            if skip_download and dest.is_file():
                gif_ok = dest.stat().st_size > 1000
            else:
                gif_ok = download_gif(gif_url, dest)
        entry["matched"] = {
            "ds_id": ds.get("id"),
            "ds_name": ds.get("name"),
            "gif_url": gif_url,
            "file": fname,
        }
        entry["gif_ok"] = gif_ok
        report.append(entry)
        suppress_gif = name_ru in NO_EXACT_GIF
        if not gif_ok and not suppress_gif:
            print("NOGIF", name_ru, "<-", ds.get("name"), gif_url)

        muscle = muscle_from_ds(ds, muscle_fb)
        # mobility override for stretch names
        if muscle_fb == "мобильность":
            muscle = "мобильность"
        if muscle_fb == "кардио":
            muscle = "кардио"

        tags = ["gymvisual", f"ds:{ds.get('id')}", "© Gym visual", "curated"]
        low = name_ru.lower()
        if muscle_fb == "мобильность" or any(
            x in low for x in ("планка", "лодочк", "птица-собака", "мёртвый жук", "мертвый жук")
        ):
            if "load:timed" not in tags:
                tags.append("load:timed")
        if suppress_gif:
            tags.append("media:no-exact-gif")
        if muscle_fb == "кардио":
            if "эллипс" in low or "велотренаж" in low:
                tags.append("load:cardio_machine")
            elif "load:timed" not in tags:
                tags.append("load:timed")
        if any(x in low for x in ("подтягиван", "отжиман")) and "гантел" not in low and "штан" not in low:
            tags.append("load:reps_only")

        # Preserve video_url: checklist overrides previous seed.
        prev_video = prev_videos_csv.get(name_ru) or prev_videos_seed.get(name_ru) or None
        prev_media = "none"
        if prev_video:
            prev_media = "youtube" if "youtu" in prev_video.lower() else "external"

        row = {
            "name_ru": name_ru,
            "muscle_group": muscle,
            "equipment": equipment_ru(ds),
            "description": description_from_ds(ds, name_ru),
            "technique": technique_from_ds(ds) or None,
            "common_mistakes": None,
            "difficulty": difficulty,
            "video_url": prev_video,
            "animation_url": f"/exercise-gifs/{fname}" if gif_ok and not suppress_gif else None,
            "thumbnail_url": None,
            "media_duration_sec": None,
            "media_source": prev_media,
            "tags": tags,
        }
        rows.append(row)
        print(f"OK {name_ru} <- {ds.get('name')} gif={gif_ok}")

    return rows, report


def ensure_programs_from_builder(valid_names: set[str]) -> list[dict]:
    """Regenerate programs via build_programs_v2 and validate exercise names."""
    builder = ROOT / "scripts" / "build_programs_v2.py"
    ns: dict = {"__file__": str(builder), "__name__": "build_programs_v2"}
    code = builder.read_text(encoding="utf-8-sig")
    exec(compile(code, str(builder), "exec"), ns, ns)
    if "build_all" not in ns:
        raise SystemExit("build_programs_v2.build_all not found")
    programs = ns["build_all"]()

    aliases = {
        "Удержание лодочки": "Удержание «лодочки»",
        "Гребля в тренажёре": "Эллипс",
        "Гребля в тренажере": "Эллипс",
        "Вращения таза": "Мобилизация голеностопа",
    }
    missing: set[str] = set()
    out: list[dict] = []
    for p in programs:
        st = dict(p.get("structure") or {})
        schedule = []
        for day in st.get("schedule") or []:
            d = dict(day)
            exs = []
            for e in d.get("exercises") or []:
                name = str(e.get("exercise_name") or "")
                if name not in valid_names:
                    name2 = aliases.get(name)
                    if name2 and name2 in valid_names:
                        name = name2
                    else:
                        missing.add(name)
                        continue
                exs.append(
                    {
                        "exercise_name": name,
                        "sets": int(e.get("sets") or 3),
                        "reps": str(e.get("reps") or "8-12"),
                        "rest_sec": int(e.get("rest_sec") or 75),
                    }
                )
            if exs:
                d["exercises"] = exs
                schedule.append(d)
        if not schedule:
            continue
        st["schedule"] = schedule
        out.append({**p, "structure": st, "is_template": True})

    if missing:
        raise SystemExit("Unknown exercises in programs:\n- " + "\n- ".join(sorted(missing)))

    SEED_PR.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote programs.json count={len(out)}")
    return out


async def apply_db(seed_rows: list[dict], programs: list[dict], *, dry_run: bool) -> dict:
    keep_names = {r["name_ru"] for r in seed_rows}
    stats = {
        "ex_created": 0,
        "ex_updated": 0,
        "ex_retired": 0,
        "pr_created": 0,
        "pr_updated": 0,
        "pr_retired": 0,
    }
    if dry_run:
        return stats

    async with AsyncSessionLocal() as session:
        existing = {
            e.name_ru: e
            for e in (
                await session.scalars(select(Exercise).where(Exercise.is_deleted.is_(False)))
            ).all()
        }
        for row in seed_rows:
            cur = existing.get(row["name_ru"])
            if cur is None:
                session.add(Exercise(**row))
                stats["ex_created"] += 1
            else:
                for k, v in row.items():
                    setattr(cur, k, v)
                stats["ex_updated"] += 1

        for name, item in list(existing.items()):
            if name not in keep_names:
                item.is_deleted = True
                stats["ex_retired"] += 1

        keep_prog = {p["name"] for p in programs}
        existing_p = {
            p.name: p
            for p in (
                await session.scalars(select(Program).where(Program.is_deleted.is_(False)))
            ).all()
        }
        for row in programs:
            cur = existing_p.get(row["name"])
            if cur is None:
                session.add(Program(**row))
                stats["pr_created"] += 1
            else:
                for k, v in row.items():
                    setattr(cur, k, v)
                stats["pr_updated"] += 1
        for name, item in existing_p.items():
            if name not in keep_prog and item.is_template:
                item.is_deleted = True
                stats["pr_retired"] += 1

        await session.commit()
    return stats


def write_manifest(seed_rows: list[dict]) -> None:
    items = []
    for r in seed_rows:
        au = r.get("animation_url") or ""
        fname = Path(au).name if au else ""
        items.append(
            {
                "name_ru": r["name_ru"],
                "file": fname,
                "animation_url": au,
                "muscle_group": r.get("muscle_group"),
            }
        )
    path = GIFS_DIR / "exercise-gifs-manifest.json"
    path.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    readme = GIFS_DIR / "README.md"
    readme.write_text(
        "# Exercise GIFs\n\n"
        "Media © Gym visual — https://gymvisual.com/\n"
        "Source dataset: https://github.com/hasaneyldrm/exercises-dataset\n"
        "Rebuilt by `backend/scripts/rebuild_catalog_from_dataset.py`.\n",
        encoding="utf-8",
    )


def quality_checks(seed_rows: list[dict], programs: list[dict], report: list[dict]) -> list[str]:
    errors: list[str] = []
    names = {r["name_ru"] for r in seed_rows}
    if len(seed_rows) < 70:
        errors.append(f"too_few_exercises:{len(seed_rows)}")
    no_gif = [
        r["name_ru"]
        for r in seed_rows
        if not r.get("animation_url") and r["name_ru"] not in NO_EXACT_GIF
    ]
    if no_gif:
        errors.append(f"unexpected_no_gif:{len(no_gif)}:{','.join(no_gif[:10])}")
    miss_match = [x["name_ru"] for x in report if not x.get("matched")]
    if miss_match:
        errors.append(f"unmatched:{miss_match}")
    # files exist
    missing_files = []
    for r in seed_rows:
        au = r.get("animation_url") or ""
        if not au:
            continue
        p = GIFS_DIR / Path(au).name
        if not p.is_file() or p.stat().st_size < 500:
            missing_files.append(r["name_ru"])
    if missing_files:
        errors.append(f"missing_files:{missing_files[:15]}")
    # programs reference only known names
    bad = set()
    for p in programs:
        for day in (p.get("structure") or {}).get("schedule") or []:
            for e in day.get("exercises") or []:
                if e.get("exercise_name") not in names:
                    bad.add(e.get("exercise_name"))
    if bad:
        errors.append(f"program_unknown_ex:{sorted(bad)}")
    if len(programs) < 20:
        errors.append(f"too_few_programs:{len(programs)}")
    # duplicate names
    if len(names) != len(seed_rows):
        errors.append("duplicate_exercise_names")
    return errors


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-download", action="store_true")
    parser.add_argument("--skip-archive", action="store_true")
    args = parser.parse_args()

    print("=== rebuild_catalog_from_dataset ===")
    data = load_dataset()
    print("dataset", len(data))
    by_exact, by_norm = index_dataset(data)

    if not args.skip_archive and not args.dry_run:
        archive_old_gifs()
    elif args.dry_run:
        print("dry-run: skip archive")

    GIFS_DIR.mkdir(parents=True, exist_ok=True)
    seed_rows, report = build_seed_rows(by_exact, by_norm, skip_download=args.skip_download)
    print("seed_rows", len(seed_rows))

    if not args.dry_run:
        SEED_EX.write_text(json.dumps(seed_rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        write_manifest(seed_rows)
        print("wrote", SEED_EX)

    valid = {r["name_ru"] for r in seed_rows}
    programs = ensure_programs_from_builder(valid)

    stats = await apply_db(seed_rows, programs, dry_run=args.dry_run)
    print("db_stats", stats)

    errs = quality_checks(seed_rows, programs, report)
    out = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "seed_count": len(seed_rows),
        "program_count": len(programs),
        "stats": stats,
        "errors": errs,
        "report": report,
    }
    REPORT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print("report", REPORT)
    if errs:
        print("QUALITY_ERRORS:")
        for e in errs:
            print(" ", e)
        return 2
    print("QUALITY_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
