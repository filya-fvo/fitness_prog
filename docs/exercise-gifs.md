# Exercise GIFs

## Source

Media comes from **[hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset)**  
© [Gym visual](https://gymvisual.com/) — keep attribution.

- Metadata clone: `backups/exercises-dataset-src/`
- Active GIFs: `frontend/public/exercise-gifs/`
- Old local semantic GIFs archived under `backups/exercise-gifs-archive-*`

## How the app shows media

Field `animation_url` on exercise (e.g. `/exercise-gifs/0025-EIeI8Vf.gif`).  
Player: `frontend/src/features/workout/components/ExerciseMediaPlayer.tsx`.

## Rebuild catalog + GIFs + programs

Предпочтительно из корня (GIF + extras + video checklist):

```powershell
cd C:\fitness_prog
.\scripts\rebuild-content.cmd
# с перекачкой GIF:
.\scripts\rebuild-content.cmd --full-download
```

Вручную:

```powershell
cd C:\fitness_prog\backend
.\.venv\Scripts\python.exe scripts\rebuild_catalog_from_dataset.py
# if GIFs already downloaded:
.\.venv\Scripts\python.exe scripts\rebuild_catalog_from_dataset.py --skip-archive --skip-download
.\.venv\Scripts\python.exe scripts\add_extra_programs.py
.\.venv\Scripts\python.exe scripts\apply_video_urls.py --from-checklist
```

Pipeline:

1. Archive previous `exercise-gifs/*`
2. Map curated RU names to dataset EN exercises
3. Download only needed GIFs from GitHub raw
4. Write `scripts/seed_content/exercises.json` and regenerate `programs.json` (**сохраняет `video_url`** из seed/checklist)
5. Upsert DB (soft-delete retired exercises/templates)
6. Apply YouTube URLs from `docs/exercise-media-checklist.csv`

## Deprecated scripts

Do not run:

- `gen_exercise_gif_list.py`
- `apply_local_exercise_gifs.py`
- `fix_exercise_gif_mapping.py`

## Quality checks

```powershell
.\venv\Scripts\python.exe -m pytest tests\test_catalog_seed.py -q
.\venv\Scripts\python.exe scripts\_verify_catalog_quality.py
```
