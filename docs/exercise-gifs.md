# GIF техники упражнений — локальные файлы

## Как приложение показывает GIF

В карточке упражнения поле **nimation_url**:

1. Сначала **GIF** (nimation_url) + текст техники.
2. По кнопке **«Видео инструкция»** — ideo_url (YouTube/mp4).

Код: rontend/src/features/workout/components/ExerciseMediaPlayer.tsx.

**Внешний GIF API (Giphy и т.п.) отключён** — только ваши файлы или явный HTTPS URL.

---

## Куда класть файлы

`
frontend/public/exercise-gifs/
  bench-press.gif
  push-ups.gif
  plank.gif
  ...
`

В БД:

`	ext
animation_url = "/exercise-gifs/bench-press.gif"
`

Vite отдаёт public/ с корня →  
https://<domain>/exercise-gifs/bench-press.gif.

**Имена:** латиница, kebab-case, без пробелов.

### Какие расширения можно класть

| Расширение | Назначение |
|------------|------------|
| `.gif` | **основной** вариант для техники (анимация) |
| `.webp` | анимация или статичный постер |
| `.png` / `.jpg` / `.jpeg` | статичная картинка (не анимация) |
| `.mp4` / YouTube | **не** сюда — в поле `video_url` |

Скрипт `apply_local_exercise_gifs.py` сейчас ищет именно `*.gif` по манифесту.
Если кладёте jpeg/png — либо переименуйте в ожидаемое `.gif`-имя после конвертации,
либо пропишите `animation_url` вручную (админка / SQL).

---

## Список имён файлов (100 упражнений)

| Файл | Назначение |
|------|------------|
| rontend/public/exercise-gifs/FILENAMES.txt | только имена (ench-press.gif, …) |
| rontend/public/exercise-gifs/EXERCISE_GIFS.txt | file + name_ru + мышца |
| docs/exercise-gif-filenames.md | таблица Markdown |
| rontend/public/exercise-gifs/exercise-gifs-manifest.json | id ↔ file для скрипта |

Пересоздать список из БД:

`powershell
cd C:\fitness_prog\backend
.\venv\Scripts\python.exe scripts\gen_exercise_gif_list.py
`

(или .\.venv\Scripts\python.exe если venv в backend)

---

## После того как файлы скачаны

`powershell
cd C:\fitness_prog\backend
.\venv\Scripts\python.exe scripts\apply_local_exercise_gifs.py
`

Скрипт проставит nimation_url **только** для файлов, которые реально лежат в папке.

Проставить пути заранее (ещё без файлов):

`powershell
.\venv\Scripts\python.exe scripts\apply_local_exercise_gifs.py --force-paths
`

---

## Откуда брать GIF (вручную)

| Источник | Заметки |
|----------|---------|
| Свои съёмки → ezgif / CapCut | лучший контроль |
| YouTube → ezgif.com | обрезка + сжатие |
| Стоки (Pexels и т.п.) | смотреть лицензию |
| ExerciseDB / платные базы | скачать и положить локально |

Не используем runtime Giphy/Tenor.

---

## Правила качества

- 3–6 секунд, loop.
- Желательно **< 1.5 MB** (Telegram WebView).
- Нейтральный фон, движение по центру.

---

## Админка

/admin → упражнение → nimation_url:

- /exercise-gifs/bench-press.gif
- или https://cdn.example.com/ex/squat.gif

---

## Чеклист

- [ ] Файлы в rontend/public/exercise-gifs/ по FILENAMES.txt
- [ ] python scripts/apply_local_exercise_gifs.py
- [ ] Проверка карточки упражнения в приложении
