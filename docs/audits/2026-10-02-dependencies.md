# Dependency audit — 2026-10-02

Проверены точные списки установленных Python-пакетов локального backend и production
образа, без установки/обновления зависимостей приложения. `pip-audit 2.10.1`
запущен отдельным временным инструментом с `--no-deps --disable-pip` по сохранённым
спискам. Оба запуска завершились с exit 1 из-за найденных advisories.
Статический triage выполнен по текущим исходникам и доступному локальному коду
транзитивных библиотек; эксплуатационные запросы и внешние доставки не выполнялись.

## Результат и окружения

| Окружение | Проверено пакетов | Исходные записи scanner | Уникальные package + advisory ID | Пакеты с advisory |
|---|---:|---:|---:|---:|
| Local backend | 66 | 22 | **19** | 5 |
| Production image | 59 | 2 | **1** | 1 |

Повторные записи `cryptography`, `ecdsa` и `pip` в local и `ecdsa` в production
объединены только в этом отчёте. Исходные JSON сохранены без изменений. Две записи
pip указывают `26.2` и `26.2.0`: это одна версия по правилам Python packaging.
Количество advisories не равно количеству доказанных уязвимостей приложения.

| Пакет | Local | Production | Исправление по scanner / первичному advisory |
|---|---|---|---|
| cryptography | 49.0.0, 1 advisory | 50.0.2, scanner clean | 50.0.0 |
| ecdsa | 0.19.2, 1 advisory | 0.19.2, 1 advisory | Исправленной версии нет |
| pip | 26.1.2, 1 advisory | 26.2.1, scanner clean | 26.2.0 |
| PyJWT | 2.13.0, 13 advisories | 2.15.1, scanner clean | Обычно 2.14.0; один 2.15.0, один без fix; есть расхождение источников ниже |
| urllib3 | 2.7.0, 3 advisories | 2.8.0, scanner clean | 2.8.0 |

`scanner clean` означает отсутствие записей в данном ответе базы advisories,
а не доказательство отсутствия любых уязвимостей.

## Дедуплицированный список Python advisories

Ссылки GHSA ведут на первичные advisories сопровождающих библиотек; для pip —
на официальное объявление Python Security. Все 19 строк относятся к local;
**только строка ecdsa также относится к production**.

| Package / ID | CVE и первичный источник | Fix | Статический verdict |
|---|---|---|---|
| cryptography / PYSEC-2026-3552 | CVE-2026-69247, [GHSA-g6cj-pr64-35w5](https://github.com/pyca/cryptography/security/advisories/GHSA-g6cj-pr64-35w5) | 50.0.0 | not_actionable: C |
| ecdsa / PYSEC-2026-1325 | CVE-2024-23342, [GHSA-wj6h-64fc-37mp](https://github.com/tlsfuzzer/python-ecdsa/security/advisories/GHSA-wj6h-64fc-37mp) | Нет | not_actionable: E |
| pip / PYSEC-2026-3721 | CVE-2026-13346, [GHSA-qwm4-qh6w-59xr / Python Security](https://mail.python.org/archives/list/security-announce@python.org/thread/L2BNQGGVQCEV7DROOORQ7WFKKFF2OOQX/) | 26.2.0 | needs_review: P, rank 3 |
| PyJWT / PYSEC-2026-4145 | CVE-2026-102268, [GHSA-ffc3-869f-jxw9](https://github.com/jpadilla/pyjwt/security/advisories/GHSA-ffc3-869f-jxw9) | 2.14.0 | not_actionable: J |
| PyJWT / PYSEC-2026-4146 | CVE-2026-103001, [GHSA-gvp8-978c-rx2q](https://github.com/jpadilla/pyjwt/security/advisories/GHSA-gvp8-978c-rx2q) | Нет | not_actionable: J |
| PyJWT / PYSEC-2026-4149 | CVE-2026-102271, [GHSA-p4g4-x82p-q773](https://github.com/jpadilla/pyjwt/security/advisories/GHSA-p4g4-x82p-q773) | 2.14.0 | not_actionable: J |
| PyJWT / PYSEC-2026-4152 | CVE-2026-102274, [GHSA-w6j9-cwv2-h6wq](https://github.com/jpadilla/pyjwt/security/advisories/GHSA-w6j9-cwv2-h6wq) | Scanner: 2.14.0; первичный: None | not_actionable: J; fix не согласован |
| PyJWT / PYSEC-2026-4144 | CVE-2026-102267, [GHSA-9v7f-9g4p-ffgj](https://github.com/jpadilla/pyjwt/security/advisories/GHSA-9v7f-9g4p-ffgj) | 2.14.0 | not_actionable: J |
| PyJWT / PYSEC-2026-4143 | CVE-2026-102266, [GHSA-9j54-fg26-wv3r](https://github.com/jpadilla/pyjwt/security/advisories/GHSA-9j54-fg26-wv3r) | 2.14.0 | not_actionable: J |
| PyJWT / PYSEC-2026-4148 | CVE-2026-102270, [GHSA-jwrc-g2q2-pq5p](https://github.com/jpadilla/pyjwt/security/advisories/GHSA-jwrc-g2q2-pq5p) | 2.14.0 | not_actionable: J |
| PyJWT / PYSEC-2026-4140 | CVE-2026-101917, [GHSA-2gx3-rcp4-g85q](https://github.com/jpadilla/pyjwt/security/advisories/GHSA-2gx3-rcp4-g85q) | 2.14.0 | not_actionable: J |
| PyJWT / PYSEC-2026-4141 | CVE-2026-101918, [GHSA-42vr-xj54-vc7v](https://github.com/jpadilla/pyjwt/security/advisories/GHSA-42vr-xj54-vc7v) | 2.15.0 | not_actionable: J |
| PyJWT / PYSEC-2026-4147 | CVE-2026-102269, [GHSA-hxm8-2xgr-2p9m](https://github.com/jpadilla/pyjwt/security/advisories/GHSA-hxm8-2xgr-2p9m) | 2.14.0 | not_actionable: J |
| PyJWT / PYSEC-2026-4151 | CVE-2026-102273, [GHSA-w2cx-738m-mc7w](https://github.com/jpadilla/pyjwt/security/advisories/GHSA-w2cx-738m-mc7w) | 2.14.0 | not_actionable: J |
| PyJWT / PYSEC-2026-4150 | CVE-2026-102272, [GHSA-r6x4-923q-g947](https://github.com/jpadilla/pyjwt/security/advisories/GHSA-r6x4-923q-g947) | 2.14.0 в таблице; текст содержит старое «pending» | not_actionable: J |
| PyJWT / PYSEC-2026-4142 | CVE-2026-102265, [GHSA-8wjv-2p76-3863](https://github.com/jpadilla/pyjwt/security/advisories/GHSA-8wjv-2p76-3863) | 2.14.0 | not_actionable: J |
| urllib3 / PYSEC-2026-4177 | CVE-2026-97689, [GHSA-vxq7-64xx-v4gw](https://github.com/urllib3/urllib3/security/advisories/GHSA-vxq7-64xx-v4gw) | 2.8.0 | needs_review: U1, rank 1 |
| urllib3 / PYSEC-2026-4176 | CVE-2026-97688, [GHSA-gh4c-6fx4-qh6g](https://github.com/urllib3/urllib3/security/advisories/GHSA-gh4c-6fx4-qh6g) | 2.8.0 | needs_review: U2, rank 2 |
| urllib3 / PYSEC-2026-4175 | CVE-2026-97687, [GHSA-8988-9cw3-xx77](https://github.com/urllib3/urllib3/security/advisories/GHSA-8988-9cw3-xx77) | 2.8.0 | needs_review: U3, rank 4 |

## Применимость к текущему приложению

**U1/U2 — conditional request path, medium confidence.** Аутентифицированный
пользователь сохраняет HTTPS Web Push endpoint (`backend/app/routers/notifications.py:205,211,331`);
валидация здесь проверяет HTTPS, без allowlist host. Если настроены VAPID и
выполняется доставка, `backend/app/services/web_push.py:72,94-105` вызывает
`pywebpush` с этим endpoint. Локальная библиотека использует `requests.post`,
а requests читает ответ через `Response.iter_content` → `raw.stream(...,
decode_content=True)`. Поэтому обычное отсутствие `stream=True` у вызова requests
само по себе не исключает уязвимости urllib3 при разборе chunked/deflate ответа.
U1 допускает расход памяти на строку размера chunk; U2 — зависание декодера.
Таймаут доставки не заменяет ограничения этого разбора. Статическая цепочка
правдоподобна для local urllib3 2.7.0; реальную VAPID-конфигурацию, запуск доставки
и эксплуатацию не проверяли. В production установлен исправленный urllib3 2.8.0.
Следующий шаг — изолированный regression harness с синтетическим ответом и
проверка конфигурации доставки, затем контролируемое обновление local.

**U3 — deployment configuration gap, low confidence.** Advisory относится к
TLS-настройкам HTTPS proxy. Код приложения не задаёт custom `ProxyManager`/SSL
options; наличие HTTPS proxy из окружения и ожидаемые custom TLS controls
не установлены. Нельзя приписать приложению подтверждённый обход TLS.
Проверить настройки прокси локальных процессов; production версия уже исправлена.

**P — build/install surface, medium confidence.** Pip используется в Dockerfile
и CI при установке пакетов; runtime HTTP router его не вызывает. Advisory требует
именно вредоносный package index, а не просто вредоносный пакет. Первичный источник
выделяет `pip download --only-binary` как существенно новый риск; такой режим в
рассмотренных scripts/manifests не найден. Доверие к index/конфигурации разработчика
не установлено, поэтому это вопрос supply chain проверки local, а не доказанный
request exploit. Проверить index и использовать исправленный pip при следующем
контролируемом обновлении инструментов; production pip 26.2.1 уже исправлен.

**J — unused affected implementation, high confidence для текущих auth paths.**
И app JWT, и Telegram OIDC импортируют `jose.jwt`, а не PyJWT:
`backend/app/core/security.py:17,157` и
`backend/app/services/telegram_browser_auth.py:15,182`. Алгоритм app JWT ограничен
настройкой (по умолчанию HS256), OIDC — только RS256. JWKS получает HTTPX из
фиксированного Telegram URL, без redirects и с лимитом 64 KiB. Импортов PyJWT в
app/scripts не найдено. Транзитивный `py_vapid.jwt` реализует подпись через
cryptography и собственный модуль; имя `jwt` здесь не означает использование PyJWT.
Это исключает найденные PyJWT sinks из рассмотренных текущих auth/Web Push paths;
не доказывает безопасность произвольных сторонних скриптов в той же Python среде.

**C — missing affected sink, high confidence.** Уязвимость касается PKCS7
дешифрования/оракула padding. В app/scripts таких операций не найдено: текущие
потребители cryptography разбирают ключи и выполняют JWT/VAPID EC/RSA операции.
Нет установленного пути недоверенного PKCS7 ciphertext к affected decrypt API.

**E — different crypto backend, high confidence для текущих подписей.** Minerva
влияет на операции python-ecdsa, включая подпись P-256; проверка подписи не
затронута. В local и production установлен cryptography, который jose выбирает
первым; fallback ecdsa появляется только при ImportError cryptography.
Приложение использует HS256/RS256 для auth, а VAPID EC signing идёт через
cryptography. Прямых `ecdsa.SigningKey.sign_digest` в app/scripts нет. Поэтому
единственный production advisory не подтверждает эксплуатацию через рассмотренные
операции приложения. Исправленной версии ecdsa нет: рассмотреть необходимость
fallback зависимости при отдельном обновлении, без автоматического удаления.

Итог triage local: **15 not_actionable в рассмотренном scope, 4 needs_review,
0 confirmed exploits**. Production: **1 not_actionable в рассмотренном scope,
0 confirmed exploits**. Ранги сравнивают только needs_review, не заменяют severity.
Отсутствие подтверждённой эксплуатации не означает отсутствие всех рисков.

## npm и ограничения доказательств

Отдельный `npm audit --json` сообщил два high package findings: runtime
`axios@1.18.1` и dev-only `brace-expansion@1.1.18/2.1.4/5.0.9`.
Это количество пакетов из npm summary, не Python advisory count и не число
подтверждённых атак. По GHSA ID npm содержит **15 уникальных advisories**:
12 Axios и 3 brace-expansion (последние повторяются для ветвей версий).

**Browser Axios — эксплуатация не установлена, medium confidence.**
`frontend/src/api/client.ts:7,23,45,52` создаёт свой client с build-time API baseURL,
JSON headers и собственным interceptor; API modules вызывают явные get/post/put/
patch/delete по путям API. Uploads используют native browser FormData.
Не найден источник prototype pollution, которым атакующий мог бы изменить
Object.prototype для цепочки указанных read-side gadgets. Это необходимое
предусловие, а не доказательство отсутствия таких источников во всех библиотеках.
Axios browser mapping заменяет Node HTTP adapter на `null`
(`frontend/node_modules/axios/package.json:52`); Node proxy/NO_PROXY,
HTTP/2, socket-createConnection и fromDataURI sinks не используются в этом
browser runtime. Fetch redirect advisory требует контроля URL и доверия к
`maxRedirects: 0` как защите серверных запросов; такого SSRF boundary здесь не
установлено. Обновление Axios всё равно рекомендуется при контролируемом
обновлении зависимостей с regression проверкой auth/uploads.

| Уникальный npm advisory / первичный источник | Fix | Scope и вывод |
|---|---|---|
| [GHSA-vh66-26gq-q6x8](https://github.com/axios/axios/security/advisories/GHSA-vh66-26gq-q6x8) | Axios 1.20.0 | Fetch prototype gadget; источник pollution не установлен |
| [GHSA-9fr6-4gfg-395g](https://github.com/axios/axios/security/advisories/GHSA-9fr6-4gfg-395g) | Axios 1.20.0 | Inherited method; собственный client и явные методы, pollution не установлен |
| [GHSA-c29m-xwm3-cm6r](https://github.com/axios/axios/security/advisories/GHSA-c29m-xwm3-cm6r) | Axios 1.20.0 | Node data URI ReDoS; Node adapter исключён browser mapping |
| [GHSA-mghh-pgcx-3jjj](https://github.com/axios/axios/security/advisories/GHSA-mghh-pgcx-3jjj) | Axios 1.20.0 | Node proxy ReDoS; отсутствует этот browser sink |
| [GHSA-x97p-jq2g-jp4f](https://github.com/axios/axios/security/advisories/GHSA-x97p-jq2g-jp4f) | Axios 1.20.0 | toFormData gadget; native FormData/JSON, pollution не установлен |
| [GHSA-3pq3-5fj3-cg6v](https://github.com/axios/axios/security/advisories/GHSA-3pq3-5fj3-cg6v) | Axios 1.20.0 | Node HTTP/2 DNS/proxy bypass; отсутствует browser sink |
| [GHSA-542g-h47m-68v8](https://github.com/axios/axios/security/advisories/GHSA-542g-h47m-68v8) | Axios 1.20.0 | Node HTTP/2 DoS; отсутствует browser sink |
| [GHSA-j8rh-479h-cp32](https://github.com/axios/axios/security/advisories/GHSA-j8rh-479h-cp32) | Axios 1.20.0 | Inherited headers after interceptor; pollution не установлен |
| [GHSA-4hqw-qxg8-jxx2](https://github.com/axios/axios/security/advisories/GHSA-4hqw-qxg8-jxx2) | Axios 1.20.0 | Inherited FormData getHeaders; native FormData, pollution не установлен |
| [GHSA-m8m8-qj5v-23w3](https://github.com/axios/axios/security/advisories/GHSA-m8m8-qj5v-23w3) | Axios 1.20.0 | Node inherited socket factory; отсутствует browser sink |
| [GHSA-44g4-m2mj-wpvx](https://github.com/axios/axios/security/advisories/GHSA-44g4-m2mj-wpvx) | Axios 1.20.0 | Node NO_PROXY CIDR; отсутствует browser sink |
| [GHSA-r4gj-5m52-g5wh](https://github.com/axios/axios/security/advisories/GHSA-r4gj-5m52-g5wh) | Axios 1.20.0 | Fetch redirect; пользовательский URL/server SSRF boundary не установлен |
| [GHSA-q2hr-2g5m-vwhr](https://github.com/juliangruber/brace-expansion/security/advisories/GHSA-q2hr-2g5m-vwhr) | 1.1.21 / 2.1.7 / 5.0.12 | Dev-only glob CPU DoS; недоверенный glob не установлен |
| [GHSA-qhr7-859c-m2p7](https://github.com/juliangruber/brace-expansion/security/advisories/GHSA-qhr7-859c-m2p7) | 1.1.20 / 2.1.6 / 5.0.11 | Dev-only nested-brace recursion; недоверенный glob не установлен |
| [GHSA-6j4f-fj2g-mc7p](https://github.com/juliangruber/brace-expansion/security/advisories/GHSA-6j4f-fj2g-mc7p) | 1.1.19 / 2.1.5 / 5.0.10 | Dev-only comma recursion; недоверенный glob не установлен |

**brace-expansion — not_actionable для production frontend, high confidence.**
Пакет используется dev-only lint/build tooling, где globs определяет репозиторий
и оператор, не пользователь приложения. `frontend/Dockerfile` выполняет build
в Node stage, а final runtime содержит nginx и dist без Node. Поэтому glob DoS
не имеет установленного production пользовательского пути. Для build environment
нельзя исключить произвольные недоверенные input других инструментов; обновление
dev dependency graph всё равно рекомендуется.

Исходные `npm-audit-online.json` и `npm-audit-summary.json` сохранены.
`npm audit fix`, обновление requirements/lockfiles и production writes не выполнялись.

SECURITY.md не найден; boundary assessment опирается на AGENTS.md и исполняемый
код. Версии production взяты из exact installed list образа; доступность всех
runtime ветвей в живом production не проверялась. Transitive source-to-sink анализ
requests/pywebpush проведён по локально установленным библиотекам; production
urllib3 не требует доказательства reachability для этих уже исправленных IDs.
Advisory metadata может измениться после даты отчёта; зафиксировано расхождение
fix metadata для PyJWT PYSEC-2026-4152, без выдуманного исправления.

Доказательства: `artifacts/full-audit-20261002-tests/pip-audit-local.json`,
`pip-audit-production.json`, соответствующие `.log`,
`python-local-requirements.txt`, `python-production-requirements.txt`.
Временный audit env/cache не нужен для воспроизведения выводов; зависимостей
приложения он не менял. Общие результаты пользовательских сценариев —
[user-scenarios](2026-10-02-user-scenarios.md).
