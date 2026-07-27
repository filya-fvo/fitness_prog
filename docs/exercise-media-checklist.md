# Чеклист медиа упражнений

- Всего: **99**
- Нужен GIF/картинка: **64**
- GIF есть, нет video: **20**
- Полностью готово: **15**

Файлы:
- CSV: `docs/exercise-media-checklist.csv`
- TXT: `frontend/public/exercise-gifs/DOWNLOAD_CHECKLIST.txt`

## Как качать GIF
1. Возьмите имя из колонки `file`
2. Положите в `frontend/public/exercise-gifs/`
3. Можно `.gif` (лучше), также `.webp/.png/.jpg`
4. `cd backend` → `python scripts/apply_local_exercise_gifs.py`

## Как добавлять видео
- Поле `video_url` в админке `/admin` или в `backend/scripts/seed_content/exercises.json`
- Формат: `https://www.youtube.com/watch?v=...` или `https://youtu.be/...`

## 1) Нужно скачать GIF/картинку

| # | file | name_ru | muscle | video |
|---|------|---------|--------|-------|
| 1 | `bear-crawl.gif` | Медвежья походка | full_body | нет |
| 2 | `ankle-mobility.gif` | Мобилизация голеностопа | мобильность | нет |
| 3 | `band-shoulder-mobility.gif` | Мобилизация плеч с резинкой | мобильность | нет |
| 4 | `hammer-curls.gif` | Молотковые сгибания | бицепс | есть |
| 5 | `toe-touch-stretch.gif` | Наклоны к носкам | мобильность | нет |
| 6 | `reverse-lunge-with-twist.gif` | Обратные выпады с поворотом | full_body | нет |
| 7 | `reverse-pec-deck.gif` | Обратные разведения в тренажёре | плечи | нет |
| 8 | `dips.gif` | Отжимания на брусьях | грудь | есть |
| 9 | `push-ups.gif` | Отжимания от пола | грудь | есть |
| 10 | `incline-push-ups.gif` | Отжимания с возвышения | грудь | нет |
| 11 | `knee-push-ups.gif` | Отжимания с колен | грудь | нет |
| 12 | `close-grip-push-ups.gif` | Отжимания узким хватом | трицепс | нет |
| 13 | `plank.gif` | Планка | кор | есть |
| 14 | `plank-shoulder-taps.gif` | Планка с касанием плеч | full_body | нет |
| 15 | `pull-ups.gif` | Подтягивания | спина | есть |
| 16 | `front-dumbbell-raise.gif` | Подъёмы гантелей перед собой | плечи | нет |
| 17 | `seated-calf-raise.gif` | Подъёмы на носки сидя | ноги | нет |
| 18 | `standing-calf-raise.gif` | Подъёмы на носки стоя | ноги | нет |
| 19 | `lying-leg-raises.gif` | Подъёмы ног лёжа | кор | нет |
| 20 | `pigeon-pose.gif` | Поза голубя | мобильность | нет |
| 21 | `squat-dumbbell-press.gif` | Присед + жим гантелей | full_body | нет |
| 22 | `squat-to-press-2.gif` | Присед с жимом над головой | full_body | нет |
| 23 | `goblet-squat.gif` | Приседания с гантелью у груди | ноги | нет |
| 24 | `bodyweight-squat.gif` | Приседания со своим весом | ноги | есть |
| 25 | `barbell-back-squat.gif` | Приседания со штангой | ноги | нет |
| 26 | `jump-rope.gif` | Прыжки на скакалке | кардио | нет |
| 27 | `dumbbell-pullover.gif` | Пуловер с гантелью | спина | нет |
| 28 | `dumbbell-fly.gif` | Разведение гантелей лёжа | грудь | нет |
| 29 | `bent-over-lateral-raise.gif` | Разводка в наклоне | плечи | нет |
| 30 | `lateral-raise.gif` | Разводка гантелей в стороны | плечи | есть |
| 31 | `overhead-triceps-extension.gif` | Разгибания гантели из-за головы | трицепс | нет |
| 32 | `cable-triceps-pushdown.gif` | Разгибания на блоке | трицепс | есть |
| 33 | `leg-extension.gif` | Разгибания ног | ноги | нет |
| 34 | `wall-chest-opener.gif` | Раскрытие грудного отдела у стены | мобильность | нет |
| 35 | `doorway-chest-stretch.gif` | Растяжка грудных у дверного проёма | мобильность | нет |
| 36 | `piriformis-stretch.gif` | Растяжка грушевидной | мобильность | нет |
| 37 | `hip-flexor-stretch.gif` | Растяжка сгибателей бедра | мобильность | нет |
| 38 | `romanian-deadlift.gif` | Румынская тяга | ноги | есть |
| 39 | `dumbbell-romanian-deadlift.gif` | Румынская тяга с гантелями | ноги | нет |
| 40 | `russian-twists.gif` | Русские скручивания | кор | нет |
| 41 | `cable-crossover.gif` | Сведение рук в кроссовере | грудь | нет |
| 42 | `dumbbell-bicep-curl.gif` | Сгибания гантелей на бицепс | бицепс | есть |
| 43 | `cable-bicep-curl.gif` | Сгибания на нижнем блоке | бицепс | нет |
| 44 | `preacher-curl.gif` | Сгибания на скамье Скотта | бицепс | нет |
| 45 | `lying-leg-curl.gif` | Сгибания ног лёжа | ноги | нет |
| 46 | `barbell-bicep-curl.gif` | Сгибания со штангой | бицепс | нет |
| 47 | `skater-jumps.gif` | Скейтер-прыжки | кардио | нет |
| 48 | `crunches.gif` | Скручивания | кор | нет |
| 49 | `conventional-deadlift.gif` | Становая тяга классическая | ноги | есть |
| 50 | `sumo-squat.gif` | Сумо-приседания | ноги | нет |
| 51 | `lat-pulldown.gif` | Тяга верхнего блока | спина | есть |
| 52 | `single-arm-dumbbell-row.gif` | Тяга гантели в наклоне | спина | есть |
| 53 | `seated-cable-row.gif` | Тяга горизонтального блока | спина | нет |
| 54 | `upright-row.gif` | Тяга к подбородку | плечи | нет |
| 55 | `band-row.gif` | Тяга резинки к поясу | спина | нет |
| 56 | `t-bar-row.gif` | Тяга Т-грифа | спина | нет |
| 57 | `barbell-bent-over-row.gif` | Тяга штанги в наклоне | спина | нет |
| 58 | `farmers-walk.gif` | Фермерская прогулка | full_body | есть |
| 59 | `dumbbell-skull-crusher.gif` | Французский жим гантели | трицепс | есть |
| 60 | `front-squat.gif` | Фронтальные приседания | ноги | нет |
| 61 | `dumbbell-shrugs.gif` | Шраги с гантелями | спина | нет |
| 62 | `elliptical.gif` | Эллипс | кардио | нет |
| 63 | `glute-bridge.gif` | Ягодичный мост | ноги | есть |
| 64 | `barbell-hip-thrust.gif` | Ягодичный мост со штангой | ноги | есть |

## 2) GIF есть — добавить video_url

| # | name_ru | file | muscle |
|---|---------|------|--------|
| 1 | Австралийские подтягивания | `australian-pull-ups.gif` | спина |
| 2 | Бег на месте | `running-in-place.gif` | кардио |
| 3 | Боковая планка | `side-plank.gif` | кор |
| 4 | Боковые выпады | `lateral-lunges.gif` | ноги |
| 5 | Велосипед | `bicycle-crunches.gif` | кор |
| 6 | Велотренажёр | `stationary-bike.gif` | кардио |
| 7 | Вращения таза | `hip-circles.gif` | мобильность |
| 8 | Выпад + сгибание на бицепс | `lunge-bicep-curl.gif` | full_body |
| 9 | Выпады назад с гантелями | `reverse-lunges-dumbbell.gif` | ноги |
| 10 | Высокие колени | `high-knees.gif` | кардио |
| 11 | Гребля в тренажёре | `rowing-machine.gif` | кардио |
| 12 | Жим Арнольда | `arnold-press.gif` | плечи |
| 13 | Жим в тренажёре | `chest-press-machine.gif` | грудь |
| 14 | Жим гантелей лёжа | `dumbbell-bench-press.gif` | грудь |
| 15 | Жим гантелей на наклонной | `incline-dumbbell-press.gif` | грудь |
| 16 | Жим лёжа узким хватом | `close-grip-bench-press.gif` | трицепс |
| 17 | Жим штанги стоя | `overhead-press.gif` | плечи |
| 18 | Зашагивания на тумбу | `box-step-ups.gif` | ноги |
| 19 | Комплекс присед + жим | `squat-to-press.gif` | full_body |
| 20 | Удержание «лодочки» | `hollow-hold.gif` | кор |

## 3) Готово (GIF + video)

| # | name_ru | file | video_url |
|---|---------|------|-----------|
| 1 | Альпинисты | `mountain-climbers.gif` | https://www.youtube.com/watch?v=nmwgirgXLYM |
| 2 | Болгарские выпады | `bulgarian-split-squat.gif` | https://www.youtube.com/watch?v=2C-uNgKwPLE |
| 3 | Бёрпи | `burpees.gif` | https://www.youtube.com/watch?v=TU8QYVW0gDU |
| 4 | Выпады вперёд | `forward-lunges.gif` | https://www.youtube.com/watch?v=QOVaHwm-Q6U |
| 5 | Гиперэкстензия | `hyperextension.gif` | https://www.youtube.com/watch?v=ph3pddpKzzw |
| 6 | Жим гантелей сидя | `seated-dumbbell-shoulder-press.gif` | https://www.youtube.com/watch?v=qEwKCR5JCog |
| 7 | Жим ногами | `leg-press.gif` | https://www.youtube.com/watch?v=IZxyjW7MPJQ |
| 8 | Жим штанги лёжа | `bench-press.gif` | https://www.youtube.com/watch?v=rT7DgCr-3pg |
| 9 | Кошка-корова | `cat-cow.gif` | https://www.youtube.com/watch?v=kqnua4rHVVA |
| 10 | Махи гирей | `kettlebell-swings.gif` | https://www.youtube.com/watch?v=YSxHifyI6s8 |
| 11 | Мировая растяжка | `worlds-greatest-stretch.gif` | https://www.youtube.com/watch?v=oNzynUF41kA |
| 12 | Мёртвый жук | `dead-bug.gif` | https://www.youtube.com/watch?v=4XLEnwUr1d8 |
| 13 | Прыжки «звездой» | `jumping-jacks.gif` | https://www.youtube.com/watch?v=iSSAk4XCsRA |
| 14 | Птица-собака | `bird-dog.gif` | https://www.youtube.com/watch?v=wiFNA3sqjCA |
| 15 | Тяга к лицу | `face-pull.gif` | https://www.youtube.com/watch?v=rep-qVOkqgk |
