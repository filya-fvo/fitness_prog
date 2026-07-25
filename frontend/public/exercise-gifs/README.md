# Exercise GIFs

1. Open **FILENAMES.txt** or **EXERCISE_GIFS.txt** — exact file names.
2. Put GIFs here, e.g. ench-press.gif, push-ups.gif.
3. Apply to DB:

`powershell
cd C:\fitness_prog\backend
.\venv\Scripts\python.exe scripts\apply_local_exercise_gifs.py
`

Supported media files for animation_url:
- preferred: .gif (animated technique loop)
- also ok as static poster/fallback: .webp, .png, .jpg/.jpeg
- video stays in video_url (YouTube / mp4), not in this folder

See docs/exercise-gifs.md and docs/exercise-gif-filenames.md.
