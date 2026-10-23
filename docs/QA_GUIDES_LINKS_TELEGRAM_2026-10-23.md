# Руководства, Android-ссылки и подключение Telegram — 23.10.2026

## Результат

Полные канонические руководства читаются в приложении с оглавлением и скачиванием. Пользовательское доступно без входа; административное только администратору, с очисткой содержимого при смене сессии. Telegram подключается к действующему аккаунту через одноразовый запрос, подтверждение в личном боте и отдельное явное решение при объединении двух аккаунтов. История сохраняется существующим merge_accounts. Android добавляет внешние ссылки на бота/сайт на входе и в профиле; native merge сохраняет SQLite и pending operation IDs.

Runtime web опубликован из6903b47f4a5523125489f9b7836b69326d670169. Изолированные source commits: e8caa97,58c1371,4c9a2bb,8a133d5,b8b52d2,6903b47. Android runtime3d99a27, shared pin8a133d5. Основной dirty checkout не менялся.

## Проверки

Backend1051 passed/60skipped, реальные PostgreSQL link integration17, протокол15, frontend877, reader66 и link45 browser scenarios, lint/TS/build/bundle PASS. Native231Vitest+167Node,20shell,Java URL tests PASS. Независимые read-only reviews привели к исправлениям owner guards, явного merge ID и сохранности обеих локальных историй до зелёных commits.

Production: backup /opt/fitness/backups/fitness-20261023T094128Z.dump; isolated restore до обновления и с новой идемпотентной миграцией — RESTORE_VERIFY_OK. Rollback image tags сохранены в /opt/fitness/backups/guides-links-20261023. FF/build/migrate/up завершились; повторная проверка Compose, /health и сайта PASS. SSH после завершения оборвался; результат проверен повторным read-only подключением, deploy не запускался повторно.

Live браузер: настоящее production-руководство прочитано, анонимный admin/link API закрыт; опубликованный JS прошёл free-link/explicit-merge/cancel/error с синтетическими API-ответами только в памяти браузера. Пользовательских записей и сообщений production не создано.

Hosted CI39933444847: backend, frontend test/build, browser QA, Docker image и PostgreSQL integration PASS. Visual QA нашёл два устаревших FAQ/help эталона (новая кнопка reader меняет высоту7050→7102). RED2 воспроизведён локально; обновлены только эти два PNG. Пороги и assertions не изменены. Повторные проверки: visual13/13, feature6/6 PASS; независимый review двух PNG без замечаний. Результат сохранён в ignored .superpowers/sdd/2026-10-21-guides-links-telegram/faq-visual-*.txt.

## APK24 только локальный

Версия24/0.8.16-dev, SHA256 5a18c91ab0c46c37d58b544ea630b2cb099b53f5debbbe4b7f65cc0ec001399a,74777682bytes; прежний certificate8a313fef52cf7e7b7f692760790b9d0f2b8af76ae9a0bdd69bc56f38d9a69472 проверен. Архив C:/for_delete/fitness-android-workout-methods/apk-releases/local-24-5a18c91ab0c46c37d58b544ea630b2cb099b53f5debbbe4b7f65cc0ec001399a/FilFit.apk, рядом metadata.json. Publisher не запускался. Публичный APK23 manifest до/после побайтово совпал; latest.json/latest.apk не заменены.

На dedicated AOSP36/ADB5049 прошли exact install/hash, offline cold/restart с actual pixels393dp,3 NativeHttp/SessionVault instrumentation tests, обе реальные внешние ACTION_VIEW ссылки и настоящее production-руководство внутри APK. Installed explicit merge с synthetic session/API и настоящим SQLite сохранил обе операции/ID и выбранную проекцию80 после настоящего force-stop/cold restart. Native vault отдельно проверен instrumentation; fixture его не меняла. Доказательства и подробный Android отчёт: docs/android/GUIDES-LINKS-TELEGRAM-2026-10-23.md Android-репозитория и ignored artifacts/guides-links-telegram-20261023.

## Границы

Физический телефон, установленный Telegram и сквозное подтверждение реального production-аккаунта владельца не проверялись. Ссылки на AOSP открылись системным WebView browser, поскольку Telegram там не установлен. Реальный серверный link/merge проверен на изолированном PostgreSQL; installed UI использовал синтетический API. Прежние уведомления/E5/OEM в задачу не входили. Никаких seed/reset/удалений production, рассылок или внешних AI не было. Разовое расписание filfit-22-10-00 удалено.
