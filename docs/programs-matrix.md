# Матрица тренировочных программ (v2)

## Оси подбора

| Ось | Значения | Где хранится |
|-----|----------|--------------|
| Пол | `male` / `female` | `structure.sex[]` + `anthropometry.sex` |
| Место | `home` / `gym` / `outdoor` | `structure.location` + `goals.location` |
| Инвентарь | `bodyweight`, `bands`, `dumbbells`, `barbell`, `machines` | `structure.equipment[]` + `goals.equipment[]` |
| Уровень | `beginner` / `intermediate` / `advanced` | `level` / `target_level` + `goals.level` |
| Суставы | `no_knee`, `no_spine` | `structure.limitations[]` + `goals.limitations[]` |

## Правила контента

1. **Зал / улица:** в `schedule` только рабочие упражнения. Разминка 5–8 мин — вне списка.
2. **Дом:** можно чуть больше контроля корпуса, но без «мобилити-дня» как замены силовой.
3. Имена упражнений **строго** из `exercises.json` / БД (`name_ru`).
4. `no_knee`: без приседов, выпадов, прыжков, жима ногами с глубоким сгибом — упор на upper + hinge/glute machine + leg curl.
5. `no_spine`: без становой, тяг в наклоне, гиперэкстензии — машины, жимы, вертикальные/горизонтальные блоки сидя, glute bridge.

## Регенерация и сид

```powershell
cd C:\fitness_prog\backend
.\.venv\Scripts\python.exe scripts\build_programs_v2.py
.\.venv\Scripts\python.exe scripts\seed_prod_content.py
```

Старые шаблоны, которых нет в новом `programs.json`, помечаются `is_deleted=true`.

## Подбор на фронте

`frontend/src/utils/programRecommend.ts`:

- жёстко режет чужой пол;
- сильно бустит совпадение `location` и `limitations`;
- штрафует программы с инвентарём, которого нет у пользователя;
- учитывает цель / уровень / дни в неделю.

## Покрытие (ориентир после v2)

- Новички М/Ж: несколько зал + дом + улица
- Опытные М/Ж: зал + дом/улица
- Продвинутые М/Ж: зал (+ дом dense)
- `no_knee`: 1 М + 1 Ж (зал)
- `no_spine`: новичок М/Ж + опытный М/Ж (зал)


## Разминка в приложении (runtime)

Не хранится в `schedule` программы — собирается на клиенте при старте:

| Место | Состав | Длительность |
|-------|--------|--------------|
| `gym` | Кардио (тренажёр, по умолчанию беговая) + мобильность без отягощений | ~10 мин (кардио ~5) |
| `home` / `outdoor` | Только мобильность | 3–5 мин |

- Пропуск: вся разминка или отдельные шаги.
- Логируется предпочтение **кардио** (exercise id, duration, machine params) в `users.goals`.
- Неделя нагрузки light/medium/heavy: override при старте + авто-сдвиг после полного круга сплита.
