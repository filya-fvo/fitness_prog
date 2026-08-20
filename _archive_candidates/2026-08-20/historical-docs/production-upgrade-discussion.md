# Обсуждение: что усовершенствуем перед production

Этот файл — краткое “человеческое” резюме для согласования.  
Полное ТЗ: [`production-upgrade-tz.md`](./production-upgrade-tz.md)  
Инструкция агенту: [`production-upgrade-instruction.md`](./production-upgrade-instruction.md)

---

## Что уже хорошо

- Каркас Mini App и auth через Telegram
- Тренировки/прогресс/offline
- Питание и AI-заготовка
- Локальный запуск и smoke-проверки

## Что мешает назвать это “продуктом”

1. **Мало контента** — ~4 упражнения.
2. **Слабый сценарий тренировки** — не ощущается как полноценная сессия из нескольких упражнений.
3. **Нет типов тренировок/программ** — full body, split, upper/lower, PPL и т.д.
4. **Видео техники не интегрированы** в UX (поля есть, контента/плеера нет).
5. **Нет настоящего prod-контура** — постоянный домен, secrets, worker/redis, бэкапы, CI deploy.

---

## Что предлагаю добавить (по приоритету)

### A. Продукт (сразу заметно пользователю)

| # | Улучшение | Зачем |
|---|-----------|------|
| A1 | Очередь упражнений в активной тренировке (4–8+) | Нормальная сессия, не “одно движение” |
| A2 | Готовые программы по типам (full body / upper-lower / PPL / home…) | Быстрый старт без ручного сбора |
| A3 | Seed **100** упражнений с техникой | Каталог перестаёт быть пустышкой |
| A4 | Видео через **YouTube/external URL** + fallback | Обучение технике без своего video storage |
| A5 | Home: “сегодняшняя тренировка” | Понятный главный CTA |
| A6 | Онбординг → рекомендация программы | Персональный вход |

### B. Production (чтобы жить 24/7)

| # | Улучшение | Зачем |
|---|-----------|------|
| B1 | Деплой front/api/db/redis | Стабильный доступ без туннелей |
| B2 | Домен HTTPS + BotFather prod URL | Реальные пользователи в Telegram |
| B3 | Secrets/CORS/production logs | Безопасность и сопровождение |
| B4 | Sentry + health + backups | Не падать молча |
| B5 | CI test/build/deploy | Контроль качества |

### C. Можно позже

- Визуальный редактор программ
- >100 упражнений и optional свой video storage позже
- Stars/подписки
- Сложные достижения/соц.механики

---

## Как предлагаю делать

1. **P0** — контент + multi-exercise + video player  
2. **P1** — programs UI + home/onboarding polish  
3. **P2** — production deploy  
4. **P3** — hardening/e2e  

---

## Решения (утверждено 2026-07-22)

1. **Хостинг (совет, free/min cost):** Cloudflare Pages (FE, free) + Supabase Postgres (free) + Render free **или** Railway (~$5) для API + Upstash Redis (free). Альтернатива: один VPS Docker ~$4–6/мес. Финальный выбор API-хоста — в P2. Не ngrok в prod.
2. **Видео:** external integration (YouTube embed / HTTPS URL), **без** своей базы роликов и без R2 в v1.
3. **Объём:** **100** упражнений сразу.
4. **Онбординг:** `days_per_week` — **да**.
5. **Ролики:** не снимаем/не заливаем; только интеграция внешних ссылок.

### Противоречия, снятые при ревью

- 50 vs 100 → везде **100**
- R2 must-have vs “не хранить ролики” → R2 **out of scope v1**
- P3 “expansion to 100” → 100 уже в P0; P3 = optional beyond 100

---

## Файлы в репозитории

- `docs/production-upgrade-tz.md` — полное ТЗ v2.1 (approved)
- `docs/production-upgrade-instruction.md` — инструкция для агента
- `docs/production-upgrade-discussion.md` — это резюме

P0 в работе.
