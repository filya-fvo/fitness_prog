# Локальный ИИ и распознавание этикеток на VPS

Production не обращается к Groq, OpenAI или другому внешнему AI API. На VPS
работают два закрытых Docker-сервиса:

- `llm`: `llama.cpp` и `Qwen2.5-3B-Instruct Q4_K_M` для русских ответов и
  нормализации текста;
- `ocr`: Tesseract `rus+eng` для чтения фото пищевой этикетки.

Фото сначала попадает во внутренний Tesseract. В Qwen передаётся только
распознанный текст. Порты `8080` и `8090` не публикуются на VPS и доступны лишь
API в Docker-сети `ai_internal`. Код дополнительно отклоняет любой LLM URL,
который не указывает на `llm` или loopback.

## Ресурсы и ограничения

Для текущего VPS 2 vCPU / 4 ГБ RAM:

- Qwen ограничен 2,8 ГБ RAM, 2 CPU, контекстом 4096 токенов и одним запросом;
- OCR ограничен 384 МБ RAM, 1 CPU и также обрабатывает одно фото за раз;
- прогретый короткий ответ обычно формируется за 10–20 секунд, первый после
  запуска модели может занять до 40 секунд; одновременные запросы становятся в очередь;
- если модель недоступна, AI-тренер даёт безопасный rule-based ответ, а
  этикетка всё равно может вернуть данные детерминированного OCR-парсера.

Вопросы о боли не передаются модели: приложение всегда отвечает безопасным
детерминированным правилом. Вывод модели также отклоняется, если он повторяет
сводку приложения вместо ответа или содержит фрагменты на другом языке.

Повышать тариф для этой конфигурации не требуется. Проверьте тариф, если
доступная память устойчиво ниже 500 МБ, swap постоянно растёт или AI регулярно
не укладывается в timeout.

## Первая установка модели

Модель не хранится в Git. Интернет нужен один раз для загрузки официального
GGUF-файла, после этого inference полностью локален.

```bash
cd /opt/fitness/source
sudo sh scripts/install-local-ai-model.sh /opt/fitness/models
sha256sum /opt/fitness/models/qwen2.5-3b-instruct-q4_k_m.gguf
```

Ожидаемая SHA-256:

```text
626b4a6678b86442240e33df819e00132d3ba7dddfe1cdc4fbb18e0a9615c62d
```

Источник модели: [официальный репозиторий Qwen](https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF).

## Конфигурация

В `backend/.env.production`:

```env
LLM_PROVIDER=local
LLM_API_KEY=
LLM_BASE_URL=http://llm:8080/v1
LLM_MODEL=qwen2.5-3b-instruct
LLM_TIMEOUT_SECONDS=75
LLM_MAX_OUTPUT_TOKENS=320
OCR_BASE_URL=http://ocr:8090
OCR_TIMEOUT_SECONDS=35
LOCAL_AI_MODELS_DIR=/opt/fitness/models
```

Старые `LLM_FALLBACK_MODELS` и `NUTRITION_VISION_MODEL` больше не используются.
Старый внешний ключ можно удалить из production `.env` после проверки запуска.

## Запуск и проверка

```bash
cd /opt/fitness/source
docker compose --env-file backend/.env.production up -d --build llm ocr api
docker compose --env-file backend/.env.production ps
docker compose --env-file backend/.env.production logs --tail=80 llm ocr api
docker stats --no-stream
```

Проверка из закрытой сети через API-контейнер:

```bash
docker compose --env-file backend/.env.production exec api \
  curl -fsS http://llm:8080/health
docker compose --env-file backend/.env.production exec api \
  curl -fsS http://ocr:8090/health
```

На компьютере разработчика:

```powershell
cd C:\fitness_prog\backend
.\.venv\Scripts\python.exe -m pytest -q tests\test_ai_engine_llm.py tests\test_nutrition_label_vision.py tests\test_llm_prompts.py
.\.venv\Scripts\python.exe -m ruff check app tests
```

После этого вручную проверьте в приложении короткий вопрос ИИ-тренеру и чёткое
фото таблицы КБЖУ. Цифры в черновике этикетки обязательно остаются редактируемыми.

## Диагностика

| Симптом | Что проверить |
|---|---|
| Ответ «локальная модель недоступна» | `docker compose ps llm`, затем логи `llm` и `api`. |
| `local_ai_rejected_non_local_configuration` | В `.env.production` должен быть `http://llm:8080/v1`, не внешний домен. |
| `local_ai_request_failed` | Загружена ли модель, не сработал ли лимит RAM, отвечает ли `/health`. |
| Вместо ответа повторяется сводка тренировки | Убедитесь, что API и `llm` используют `qwen2.5-3b-instruct`; затем перезапустите оба сервиса. |
| Этикетка не читается | Логи `ocr`, ровное фото без бликов, таблица крупно в кадре. |
| `local_ocr_failed` | Состояние `ocr`, наличие языков `rus` и `eng`, доступность внутренней сети. |
| Долгий ответ | Очередь запросов, CPU в `docker stats`, слишком длинный вопрос. |

Проверить отсутствие публичных AI-портов:

```bash
docker ps --format 'table {{.Names}}\t{{.Ports}}'
sudo ss -lntp
```

У `llm` и `ocr` не должно быть записей вида `0.0.0.0:8080` или
`0.0.0.0:8090`.

## Откат без потери данных

ИИ не меняет схему PostgreSQL. Для временного отключения остановите только эти
сервисы — пользователи, тренировки и история диалогов останутся в БД:

```bash
docker compose --env-file backend/.env.production stop llm ocr
```

После исправления снова выполните `up -d llm ocr api`. Не удаляйте PostgreSQL
volume и не используйте `docker compose down -v`.
