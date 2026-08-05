# Видео упражнений (YouTube)

GIF больше **не** ведутся через этот файл — они из датасета Gym visual  
(`scripts/rebuild_catalog_from_dataset.py`).

## Файл

`docs/exercise-media-checklist.csv`

Колонки (`;`):

| Колонка | Назначение |
|---------|------------|
| `name_ru` | Точное имя упражнения из каталога |
| `muscle_group` | Справочно (можно не трогать) |
| `video_url` | Ссылка YouTube / HTTPS |

Сейчас в каталоге: **97** упражнений, с видео: **32**.

## Как заполнить

1. Откройте CSV в Excel / LibreOffice (разделитель `;`, UTF-8).
2. Впишите `video_url`, например `https://www.youtube.com/watch?v=...`
3. `name_ru` не переименовывайте — иначе не привяжется.

## Применить в БД

Из корня репозитория (предпочтительно):

```powershell
cd C:\fitness_prog
.\scripts\apply-videos.cmd
# dry-run:
.\scripts\apply-videos.cmd --dry-run
```

Или напрямую:

```powershell
cd C:\fitness_prog\backend
.\.venv\Scripts\python.exe scripts\apply_video_urls.py --from-checklist
# проверка без записи:
.\.venv\Scripts\python.exe scripts\apply_video_urls.py --from-checklist --dry-run
```

Скрипт ставит только `video_url` + `media_source`, GIF не трогает.

## Полный content-пайплайн (GIF + программы + видео)

```powershell
cd C:\fitness_prog
.\scripts\rebuild-content.cmd
# с перекачкой GIF:
.\scripts\rebuild-content.cmd --full-download
```

`rebuild_catalog_from_dataset.py` **сохраняет** `video_url` из предыдущего seed и из этого CSV (CSV важнее).  
После rebuild пайплайн всё равно вызывает `apply_video_urls.py --from-checklist`, чтобы БД совпала с checklist.
