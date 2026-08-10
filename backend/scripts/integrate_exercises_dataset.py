# -*- coding: utf-8 -*-
"""Match our exercises to hasaneyldrm/exercises-dataset, download GIFs, update seed+DB. Preserves UUIDs."""
from __future__ import annotations

import asyncio
import json
import re
import sys
import urllib.request
from pathlib import Path

from sqlalchemy import select

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.database import AsyncSessionLocal
from app.models.exercise import Exercise

DS = REPO / "backups" / "exercises-dataset-src" / "data" / "exercises.json"
SEED = ROOT / "scripts" / "seed_content" / "exercises.json"
GIFS_DIR = REPO / "frontend" / "public" / "exercise-gifs"
MAP_OUT = REPO / "backups" / "exercises_dataset_match_report.json"
RAW_BASE = "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/"

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

# preferred exact dataset names (order = priority). Empty => skip auto-replace.
MANUAL: dict[str, list[str]] = {
    "приседания со штангой": ["barbell full squat", "barbell high bar squat", "barbell low bar squat"],
    "приседания со своим весом": ["jump squat", "bodyweight drop jump squat"],
    "приседания с гантелью у груди": ["dumbbell goblet squat"],
    "фронтальные приседания": ["barbell front squat"],
    "сумо-приседания": ["barbell wide squat", "smith sumo squat"],
    "болгарские выпады": ["dumbbell single leg split squat", "split squats", "barbell single leg split squat"],
    "выпады вперед": ["dumbbell lunge", "forward lunge (male)", "walking lunge", "barbell lunge"],
    "выпады назад с гантелями": ["dumbbell rear lunge", "barbell rear lunge"],
    "боковые выпады": ["barbell lateral lunge"],
    "румынская тяга": ["barbell romanian deadlift"],
    "румынская тяга с гантелями": ["dumbbell romanian deadlift"],
    "становая тяга классическая": ["barbell deadlift"],
    "жим штанги лежа": ["barbell bench press"],
    "жим гантелей лежа": ["dumbbell bench press"],
    "жим гантелей на наклонной": ["dumbbell incline bench press"],
    "жим в тренажере": ["cable seated chest press", "lever chest press"],
    "жим лежа узким хватом": ["barbell close-grip bench press"],
    "отжимания от пола": ["push-up"],
    "отжимания с колен": ["kneeling push-up (male)"],
    "отжимания с возвышения": ["incline push-up"],
    "отжимания на брусьях": ["chest dip", "triceps dip"],
    "отжимания узким хватом": ["diamond push-up"],
    "разведение гантелей лежа": ["dumbbell fly"],
    "сведение рук в кроссовере": ["cable middle fly"],
    "подтягивания": ["pull-up"],
    "австралийские подтягивания": ["inverted row"],
    "тяга штанги в наклоне": ["barbell bent over row"],
    "тяга гантели в наклоне": ["dumbbell one arm bent-over row"],
    "тяга верхнего блока": ["cable lat pulldown full range of motion", "cable bar lateral pulldown"],
    "тяга горизонтального блока": ["cable seated row"],
    "тяга т-грифа": ["lever reverse t-bar row", "lever t-bar row"],
    "тяга резинки к поясу": ["resistance band seated straight back row", "band one arm standing low row"],
    "пуловер с гантелью": ["dumbbell pullover"],
    "жим штанги стоя": [
        "barbell standing wide military press",
        "barbell standing close grip military press",
        "dumbbell standing overhead press",
    ],
    "жим арнольда": ["dumbbell arnold press"],
    "разводка гантелей в стороны": ["dumbbell lateral raise"],
    "разводка в наклоне": ["dumbbell rear delt raise"],
    "подъемы гантелей перед собой": ["dumbbell front raise"],
    "обратные разведения в тренажере": ["lever seated reverse fly"],
    "тяга к подбородку": ["barbell upright row"],
    "сгибания гантелей на бицепс": ["dumbbell biceps curl"],
    "сгибания со штангой": ["barbell curl"],
    "молотковые сгибания": ["dumbbell hammer curl"],
    "сгибания на скамье скотта": ["barbell preacher curl"],
    "сгибания на нижнем блоке": ["cable curl"],
    "разгибания на блоке": ["cable pushdown", "cable triceps pushdown (v-bar)"],
    "разгибания гантели из-за головы": ["dumbbell seated triceps extension", "dumbbell standing triceps extension"],
    "французский жим гантели": ["dumbbell lying triceps extension"],
    "подъемы на носки стоя": ["barbell standing calf raise", "bodyweight standing calf raise", "dumbbell standing calf raise"],
    "подъемы на носки сидя": ["lever seated calf raise", "barbell seated calf raise", "dumbbell seated calf raise"],
    "разгибания ног": ["lever leg extension"],
    "сгибания ног лежа": ["lever lying leg curl"],
    "ягодичный мост": ["barbell glute bridge", "low glute bridge on floor", "glute bridge march"],
    # no clean barbell hip thrust in dataset; smith hip raise is closest hip-drive pattern
    "ягодичный мост со штангой": ["smith hip raise", "barbell glute bridge"],
    "зашагивания на тумбу": ["dumbbell step-up"],
    "планка": ["weighted front plank", "power point plank"],
    "боковая планка": ["side plank hip adduction", "bodyweight incline side plank"],
    "скручивания": ["crunch floor"],
    "велосипед": ["air bike", "band bicycle crunch"],
    "русские скручивания": ["russian twist"],
    "подъемы ног лежа": ["lying leg raise flat bench", "captains chair straight leg raise", "hanging leg raise"],
    "альпинисты": ["mountain climber"],
    "берпи": ["burpee"],
    "беговая дорожка": ["run", "treadmill"],
    "бег на месте": ["run", "treadmill"],
    "высокие колени": ["high knee against wall", "walking high knees lunge"],
    "прыжки на скакалке": ["jump rope"],
    "скейтер-прыжки": ["skater hops"],
    "эллипс": ["walk elliptical cross trainer", "cycle cross trainer"],
    "велотренажер": ["stationary bike walk", "stationary bike run v. 3"],
    # no dedicated rower gif; leave empty to keep current media
    "гребля в тренажере": [],
    "фермерская прогулка": ["farmers walk"],
    "шраги с гантелями": ["dumbbell shrug"],
    "удержание лодочки": [],
    "планка с касанием плеч": ["kneeling plank tap shoulder (male)", "shoulder tap"],
    "медвежья походка": ["bear crawl"],
    "присед + жим гантелей": ["kettlebell thruster", "barbell thruster"],
    "присед с жимом над головой": ["barbell thruster"],
    "комплекс присед + жим": ["barbell thruster"],
    "выпад + сгибание на бицепс": ["dumbbell lunge with bicep curl", "dumbbell lunge"],
    "обратные выпады с поворотом": ["lunge with twist", "dumbbell rear lunge"],
    "мобилизация голеностопа": ["ankle circles"],
    "мобилизация плеч с резинкой": ["band standing rear delt row", "band front raise"],
    "вращения таза": [],
    "поза голубя": ["seated piriformis stretch"],
    "растяжка сгибателей бедра": ["intermediate hip flexor and quad stretch"],
    "растяжка грушевидной": ["seated piriformis stretch"],
    "раскрытие грудного отдела у стены": ["dynamic chest stretch (male)"],
    "растяжка грудных у дверного проема": ["dynamic chest stretch (male)"],
    "наклоны к носкам": ["basic toe touch (male)", "hamstring stretch"],
    "жим ногами": ["sled 45° leg press", "sled 45 leg press", "lever leg press"],
    "гиперэкстензия": ["hyperextension", "back extension 45 degrees"],
    "тяга к лицу": ["cable rear delt row (with rope)", "cable standing rear delt row (with rope)"],
    "жим гантелей сидя": ["dumbbell seated shoulder press"],
    "кошка-корова": ["spine stretch"],
    "махи гирей": ["kettlebell swing"],
    "мировая растяжка": ["world greatest stretch"],
    "мертвый жук": ["dead bug"],
    "прыжки звездой": ["star jump (male)", "jack jump (male)"],
    "птица-собака": [],
}


def norm(s: str) -> str:
    s = (s or "").strip().lower().replace("ё", "е")
    s = re.sub(r"[«»\"'`]", " ", s)
    s = re.sub(r"[^a-z0-9а-я\s\-\+°]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def pick_best(our_name_ru: str, by_exact: dict[str, dict], by_norm: dict[str, dict]) -> tuple[dict | None, float, list]:
    our_n = norm(our_name_ru)
    hints = MANUAL.get(our_n)
    if hints is None:
        return None, 0.0, []
    if not hints:
        return None, 0.0, []

    top: list[tuple[float, dict]] = []
    for i, h in enumerate(hints):
        # exact case-insensitive first
        ds = by_exact.get(h.lower())
        if ds is None:
            ds = by_norm.get(norm(h))
        if ds is None:
            # controlled substring: only if unique-ish and starts with hint tokens
            hn = norm(h)
            cands = []
            for nrm, item in by_norm.items():
                if nrm == hn or nrm.startswith(hn + " ") or (" " + hn + " ") in (" " + nrm + " "):
                    # reject obvious junk
                    if any(b in nrm for b in ("female", "bowling", "tennis ball", "v. 2", "v. 3", "on knees")):
                        continue
                    cands.append(item)
            if len(cands) == 1:
                ds = cands[0]
            elif cands:
                # shortest name wins
                cands.sort(key=lambda d: len(d.get("name") or ""))
                ds = cands[0]
        if ds is None:
            continue
        score = 1000 - i * 10
        top.append((score, ds))

    if not top:
        return None, 0.0, []
    # unique by id, keep best score
    best_by_id: dict[str, tuple[float, dict]] = {}
    for sc, ds in top:
        did = ds["id"]
        if did not in best_by_id or sc > best_by_id[did][0]:
            best_by_id[did] = (sc, ds)
    ordered = sorted(best_by_id.values(), key=lambda x: x[0], reverse=True)
    best_sc, best = ordered[0]
    preview = [(sc, d["name"], d["id"], d.get("gif_url")) for sc, d in ordered[:5]]
    return best, float(best_sc), preview


def muscle_from_ds(ds: dict, fallback: str) -> str:
    for key in (ds.get("target"), ds.get("body_part"), ds.get("category"), ds.get("muscle_group")):
        m = MUSCLE_MAP.get(norm(key or ""), None)
        if m:
            return m
    return fallback or "full_body"


def equipment_ru(ds: dict, fallback: str | None) -> str | None:
    e = norm(ds.get("equipment") or "")
    mapping = {
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
    return mapping.get(e, fallback)


def technique_from_ds(ds: dict) -> str:
    steps = (ds.get("instruction_steps") or {}).get("ru")
    if isinstance(steps, list) and steps:
        return "\n".join(f"{i+1}. {s.strip()}" for i, s in enumerate(steps) if str(s).strip())
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


def slug_file(ds_id: str, gif_url: str) -> str:
    return Path(gif_url).name if gif_url else f"{ds_id}.gif"


def download_gif(gif_url: str, dest: Path) -> bool:
    if dest.exists() and dest.stat().st_size > 1000:
        return True
    url = RAW_BASE + gif_url.lstrip("/")
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "fitness_prog/1.0"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read()
        if len(data) < 500:
            return False
        dest.write_bytes(data)
        return True
    except Exception as exc:
        print("download_fail", gif_url, exc)
        return False


async def main(apply_db: bool = True) -> None:
    dataset = json.loads(DS.read_text(encoding="utf-8"))
    print("dataset", len(dataset))

    by_exact = {(d.get("name") or "").lower(): d for d in dataset}
    by_norm = {norm(d.get("name") or ""): d for d in dataset}

    async with AsyncSessionLocal() as session:
        ours = list(
            (
                await session.scalars(
                    select(Exercise).where(Exercise.is_deleted.is_(False)).order_by(Exercise.name_ru)
                )
            ).all()
        )
        print("ours", len(ours))

        report = []
        matched = 0
        downloaded = 0
        updated = 0
        skipped = 0
        no_manual = []

        for ex in ours:
            our_n = norm(ex.name_ru)
            if our_n not in MANUAL:
                no_manual.append(ex.name_ru)

            best, sc, top = pick_best(ex.name_ru, by_exact, by_norm)
            entry = {
                "our_id": str(ex.id),
                "our_name": ex.name_ru,
                "our_norm": our_n,
                "score": sc,
                "match": None,
                "top": top,
            }
            if not best:
                skipped += 1
                report.append(entry)
                print("SKIP", ex.name_ru, "hints=", MANUAL.get(our_n))
                continue

            matched += 1
            gif_url = best.get("gif_url") or ""
            fname = slug_file(best["id"], gif_url)
            dest = GIFS_DIR / fname
            ok = False
            if gif_url:
                ok = download_gif(gif_url, dest)
                if ok:
                    downloaded += 1

            tech = technique_from_ds(best)
            desc = description_from_ds(best, ex.name_ru)
            anim = f"/exercise-gifs/{fname}" if ok else ex.animation_url
            muscle = muscle_from_ds(best, ex.muscle_group or "")
            equip = equipment_ru(best, ex.equipment)

            entry["match"] = {
                "ds_id": best["id"],
                "ds_name": best["name"],
                "gif_url": gif_url,
                "local_gif": fname if ok else None,
                "animation_url": anim,
                "equipment": equip,
                "muscle_group": muscle,
            }
            report.append(entry)

            if apply_db:
                if tech:
                    ex.technique = tech
                if desc:
                    ex.description = desc
                if anim:
                    ex.animation_url = anim
                if muscle:
                    ex.muscle_group = muscle
                if equip:
                    ex.equipment = equip
                tags = list(ex.tags or [])
                if "gymvisual" not in tags:
                    tags.append("gymvisual")
                ds_tag = f"ds:{best['id']}"
                if ds_tag not in tags:
                    tags.append(ds_tag)
                if "© Gym visual" not in tags:
                    tags.append("© Gym visual")
                ex.tags = tags
                updated += 1
            print(f"OK {ex.name_ru} <- {best['name']} ({sc:.0f}) gif={ok}")

        if apply_db:
            await session.commit()

        MAP_OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(
            "matched", matched, "/", len(ours),
            "skipped", skipped,
            "downloaded", downloaded,
            "updated", updated,
        )
        if no_manual:
            print("NO_MANUAL_KEYS", len(no_manual), no_manual)
        print("report", MAP_OUT)

        if SEED.exists() and apply_db:
            seed = json.loads(SEED.read_text(encoding="utf-8"))
            ours2 = list(
                (
                    await session.scalars(
                        select(Exercise).where(Exercise.is_deleted.is_(False))
                    )
                ).all()
            )
            by_id = {str(ex.id): ex for ex in ours2}
            for item in seed:
                ex = None
                if item.get("id") and str(item["id"]) in by_id:
                    ex = by_id[str(item["id"])]
                else:
                    for candidate in ours2:
                        if candidate.name_ru == item.get("name_ru"):
                            ex = candidate
                            break
                if not ex:
                    continue
                item["technique"] = ex.technique
                item["description"] = ex.description
                item["animation_url"] = ex.animation_url
                item["muscle_group"] = ex.muscle_group
                item["equipment"] = ex.equipment
                item["tags"] = list(ex.tags or [])
            SEED.write_text(json.dumps(seed, ensure_ascii=False, indent=2), encoding="utf-8")
            print("seed updated", SEED)


if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    asyncio.run(main(apply_db=not dry))
