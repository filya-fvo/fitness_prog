# UX-ревью со стороны пользователя

**Дата:** 2026-08-07 (обновление; исходный файл `UX_USER_REVIEW_2026-08-05.md`)  
**Контекст:** полный пользовательский прогон после email-auth, OTP draft, i18n RU, каталога упражнений, bot reply keyboard `/start`+`/help`, полировки active workout.  
**Среда:** локальный фронт `http://127.0.0.1:5173`, API `:8001`.  
**Метод проверки:**
1. **API journey (email OTP)** — end-to-end сценарий нового пользователя через браузерный auth (отчёт `docs/_ux_test_run_2026-08-07.json`).
2. **Browser UI walk** — Shell без Telegram: форма «Вход по email», табы Главная / Тренировки / Питание / Прогресс / Ещё / AI.
3. **Unit:** `backend/tests/test_telegram_bot.py` — 13 passed (в т.ч. reply keyboard `/start`+`/help`).

---

## 1. Краткий вердикт

Продукт **готов к controlled production / closed beta** как Telegram Mini App с запасным входом по email.

С прошлого ревью (2026-08-05) закрыты критичные блокеры QA:
- **Браузерный вход по email OTP** работает (раньше: «email отключён / auth только в TG»).
- **Привязка email к тому же аккаунту** + повторный login сохраняет `user_id`.
- **OTP-шаг не теряется** при уходе в почтовый клиент (`otpDraft` + localStorage).
- Каталог упражнений: **112** позиций; «Беговая дорожка», «Пуловер в блоке на спину», «Французский жим со штангой» на месте.
- Бот: persistent кнопки **`/start`** и **`/help`** под полем ввода (+ Open при `MINI_APP_URL`).
- i18n: «Серия», русские уровни в онбординге/профиле; фильтры программ — RU labels (fix 2026-08-07).

**Оценка зрелости UX:** ~8.5/10 для TG fitness mini-app (P0/P1 UX backlog закрыт в коде; остаётся device/ops).  
До «ежедневного привычного инструмента» остаются empty-states, toasts, плотность ActiveWorkout/Профиля и device-E2E в реальном Telegram.

---

## 2. Результаты полного теста (2026-08-07)

### 2.1 API journey (email path)

| Шаг | Результат | Заметка |
|-----|-----------|---------|
| API health | OK | status ok |
| Frontend :5173 | OK | 200 |
| Email OTP request | OK | delivery=dev_log если SMTP не подхватился; с SMTP_* — smtp |
| Email OTP verify → JWT | OK | новый user |
| GET/PUT /users/me | OK | onboarding_completed=true |
| Programs list | OK | 38 шаблонов |
| Exercises catalog | OK | total=112; treadmill/pullover/french |
| Start program → set → complete | OK | history >=1 |
| Nutrition search + log | OK | log 201 (повторная проверка) |
| Barcode lookup | OK empty | unknown EAN → found=false |
| AI chat | OK | reply на замену жима |
| Notification settings | OK | get/put 200 |
| Water +250 | OK | PUT /notifications/water mode=add |
| Supplements stack | OK | |
| Link email + re-login same user | OK | same_user=true |
| Bot reply keyboard unit | OK | /start, /help, is_persistent |

**Hard fail:** 0.  
**Вывод:** core-пути «войти → анкета → программа → сет → finish → еда → AI → привязка почты» проходимы без Telegram initData.

### 2.2 Browser UI (без JWT)

| Экран | Что видно | Оценка |
|-------|-----------|--------|
| Shell | Баннер «Вход по email» + fil_fit_bot@mail.ru | Auth path discoverable |
| Главная | Empty программа, Серия 0, Синхронизация 0/онлайн, привычки | Tech-sync всё ещё user-facing |
| Тренировки | Программы / Каталог | Чисто, мало «моя программа» |
| Питание | Нужна авторизация; Нет продуктов; Добавить disabled | Dual empty |
| Прогресс | Серия / нули | Тяжело новичку |
| Ещё | Профиль + AI | Правильно |
| AI | Chips + лимит 15/сутки | Хороший first paint |

### 2.3 Telegram bot

| Фича | Статус |
|------|--------|
| Reply keyboard /start + /help | Реализовано + unit tests |
| Slash menu setMyCommands | На webhook /start и /help |
| Welcome text про email browser login | В start_welcome_text |
| Live device (тап в TG) | Нужен restart backend + один /start |

---

## 3. Карта потоков (актуально)

| Поток | Статус | Оценка |
|-------|--------|--------|
| Вход Telegram Mini App | Основной prod-путь | Ожидаемо |
| Вход email (браузер) | **Работает** OTP + JWT | Закрывает QA/web |
| Привязка email к TG-аккаунту | Profile → Тело → Почта | Same-account |
| Онбординг → программа → тренировка | API OK | Device E2E в TG — остаток |
| Питание + barcode | UI+API | Confirm-grams сохранён |
| Уведомления / вода / добавки | API OK | Worker — ops |
| AI | Chat OK | Ценность выше in-workout |
| Бот help/start | Клавиатура + guide | UX входа |

---

## 4. Что уже хорошо

1. Навигация 5 табов + AI/профиль в «Ещё».
2. Email auth + link + OTP draft.
3. Тренировочный core: start/set/complete/history; rest/elapsed isolation.
4. Питание: сканер → граммы → Добавить; чипы 50–250 г.
5. Каталог 112 с каноническими именами.
6. Уведомления/добавки + water API.
7. Бот: /start и /help не нужно набирать.
8. i18n RU (Серия, уровни, фильтры программ).

---

## 5. Оставшиеся UX-разрывы (production backlog)

### P0 — до/сразу после launch

| # | Проблема | Зачем | Статус 2026-08-07 |
|---|----------|-------|-------------------|
| 1 | Empty-states слабо ведут к действию | Time-to-first-value | **Частично:** Home hero CTA + Progress empty + Nutrition auth empty |
| 2 | «Синхронизация: 0 / онлайн» — tech copy | Доверие | **Сделано:** «Сохранено» / оффлайн / ждёт сети |
| 3 | Мало success toasts | Кажется, не нажалось | **Сделано:** ToastHost + вода/еда/restore |
| 4 | Edit/delete питания | Страх ошибки | **Сделано:** API + UI Изменить/Удалить |
| 5 | Плотность ActiveWorkout | Ошибки в зале | **Сделано:** simple mode «Зал» (default) |
| 6 | Device E2E в Telegram | Prod truth | Открыто |
| 7 | SMTP reliability для OTP | Ops |

### P1 — первая неделя

1. ~~Листание дней в питании.~~ **Сделано**
2. ~~Хаб «Тренировки» с карточкой текущей программы.~~ **Сделано**
3. ~~Simple mode активной тренировки.~~ **Сделано**
4. ~~Связка добавки ↔ уведомления.~~ **Сделано**
5. ~~Offline banner человеческим языком.~~ **Сделано** (`OfflineBanner` в Shell)
6. ~~Сканер: подсказка + fallback EAN.~~ **Сделано**
7. ~~Профиль: быстрый vs расширенный.~~ **Сделано**
8. ~~AI entry с главной.~~ **Сделано** (чипы + `/ai?q=`)

### P2 — retention

- Недельный обзор — частично (Progress charts уже есть)
- ~~Умные подсказки.~~ **Сделано** (Home tips)
- ~~Шаблоны приёмов пищи.~~ **Сделано**
- ~~A11y / reduce motion для таймера.~~ **Сделано** (RestTimer)

---

## 6. Production readiness checklist

### Готово / почти готово
- [x] JWT auth Telegram + email OTP
- [x] Same-account email link
- [x] Core workout + nutrition + AI API
- [x] Programs/exercises seed
- [x] Bot welcome + help + reply keyboard (code)
- [x] RU copy pass
- [x] Notification settings + water

### Обязательно перед широким prod
- [ ] Live Telegram: Menu Button, /start keyboard, webhook secret
- [ ] SMTP prod + мониторинг OTP
- [ ] Worker/ARQ для reminders
- [ ] HTTPS Mini App URL в BotFather
- [ ] Sentry/logs + backup Postgres
- [ ] Privacy note для email
- [ ] Rate limits OTP (prod values)
- [ ] Ручной device QA §8

### Не блокеры launch
- [x] Home primary CTA + hide sync
- [x] Nutrition day switcher + edit/delete UX
- [x] ActiveWorkout simple mode
- [x] Train hub program card
- [x] Supplements ↔ alerts link
- [x] Offline banner
- [x] Scanner hints + manual EAN
- [x] Profile quick/advanced
- [x] AI entry on Home
- [x] Meal templates + home tips + reduce-motion rest timer

---

## 7. Микрокопирайт

| Сейчас | Лучше | Статус |
|--------|--------|--------|
| Вход по email временно отключён | — | **Устарело** — форма работает |
| beginner в фильтрах программ | Новичок / Опытный / Продвинутый | **Исправлено 2026-08-07** |
| Синхронизация: 0 | Скрыть / «Сохранено» | **Сделано** |
| Источник: сервер | Убрать / «сохранённые данные» | **Сделано** на Progress |
| Нет продуктов (без auth) | Один empty «Войдите…» | **Сделано** |

---

## 8. Device-QA чеклист

### Browser (email)
- [x] Форма входа видна вне TG
- [x] OTP request/verify → JWT (API)
- [x] Онбординг profile save
- [x] Программа → сет → complete → history
- [x] Nutrition log + daily
- [x] Link email → re-login same user
- [ ] Полный UI login с реальным письмом Mail.ru
- [ ] OTP draft: уйти в почту → вернуться

### Telegram Mini App
- [ ] /start → welcome + reply keyboard /start /help (+ Open)
- [ ] /help → файл инструкции
- [ ] Menu Button Open → Mini App
- [ ] initData auth
- [ ] Active: Готово / Изменить / rest / finish
- [ ] Питание: скан → граммы → Добавить
- [ ] Вода; добавки; test reminder
- [ ] Profile: привязка email
- [ ] Офлайн 1 сет → sync

---

## 9. Итог для production

**Можно выкатывать closed beta**, если закрыты ops: HTTPS Mini App, webhook, SMTP, worker, device smoke в TG.

**Не считать «готово всем»**, пока:
1. Home/Progress empty-states не ведут за руку за <30 секунд,
2. нет device-подтверждения barcode + keyboard + reminders,
3. tech-copy (sync) не убран с главной.

**Пакет ROI на следующий спринт:**
1. Home primary CTA + toasts + hide sync
2. Nutrition edit/delete + day switcher
3. ActiveWorkout simple mode
4. TG device E2E smoke sign-off

---

## 10. Артефакты прогона

- API report: `docs/_ux_test_run_2026-08-07.json`
- Helper: `backend/scripts/_ux_full_user_test.py`
- Bot tests: `backend/tests/test_telegram_bot.py` (13 passed)
- Related: `docs/I18N_RU_REVIEW.md`, `docs/USER_GUIDE.md`, `instruction.md`

---

*Документ обновлён 2026-08-07. Имя файла сохранено для совместимости ссылок.*
