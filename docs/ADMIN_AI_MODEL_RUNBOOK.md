# Инструкция администратора: модель AI в Groq

Backend использует только Groq Chat Completions. Резервного провайдера OpenAI Platform и связанных с ним ключей в приложении нет.

## Конфигурация

```env
LLM_API_KEY=<секретный ключ Groq>
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_MODEL=qwen/qwen3.6-27b
LLM_FALLBACK_MODELS=
NUTRITION_VISION_MODEL=qwen/qwen3.6-27b
```

Фрагмент `/openai/v1` в адресе — название OpenAI-совместимого протокола Groq. Запросы отправляются на домен `api.groq.com` и не используют OpenAI Platform.

`LLM_MODEL` обслуживает AI-тренера. `NUTRITION_VISION_MODEL` распознаёт фото этикетки. Резервные модели Groq можно перечислить через запятую в `LLM_FALLBACK_MODELS`; пустое значение означает работу только с основной моделью.

## Замена модели

1. Проверьте точный ID и возможности модели в [официальном каталоге Groq](https://console.groq.com/docs/models).
2. Для тренера модель должна поддерживать Chat Completions и русский язык; для этикетки — ещё и изображения.
3. Измените `backend/.env` локально или environment variables сервиса `fitness-api` в production.
4. Перезапустите backend. Миграция БД при смене модели не нужна.
5. Не помещайте ключ в frontend, Git, документацию или сообщение об ошибке.

Локальный перезапуск:

```powershell
C:\fitness_prog\scripts\dev.cmd restart-backend
```

## Проверка

```powershell
cd C:\fitness_prog\backend
.\.venv\Scripts\python.exe -m pytest tests\test_ai_engine_llm.py tests\test_nutrition_label_vision.py tests\test_llm_prompts.py
.\.venv\Scripts\python.exe -m ruff check app tests
Invoke-RestMethod http://127.0.0.1:8001/health
```

В Mini App проверьте один вопрос AI-тренеру и одно читаемое фото пищевой ценности. Ответ тренера должен иметь источник `groq`; при недоступности внешней модели приложение возвращает безопасный локальный ответ. Для этикетки при ошибке распознавания открывается ручной ввод.

Полезные логи: `groq_response_failed`, `groq_model_skipped`, `groq_fallback_succeeded`, `nutrition_label_recognition_failed`.

## Типовые ошибки

| Симптом | Что проверить |
|---|---|
| `401 Unauthorized` | Значение `LLM_API_KEY` и принадлежность ключа нужному проекту Groq. |
| `404` / `model_not_found` | Точный ID и доступность модели в аккаунте. |
| `429` | Лимиты Groq. При настроенном каскаде backend временно пропускает ограниченную модель. |
| `400 unsupported parameter` | Поддерживает ли выбранная модель текущие параметры Chat Completions. |
| Локальный ответ | Сеть, ключ, модель и backend-логи. |
| После изменения старая модель | Перезапущен ли именно backend `fitness-api`. |

## Откат

Верните прежние `LLM_MODEL`, `NUTRITION_VISION_MODEL` и каскад Groq, затем перезапустите backend и повторите профильные тесты. Локальная история диалога хранится в PostgreSQL, поэтому откат модели не требует очистки пользовательских данных.
