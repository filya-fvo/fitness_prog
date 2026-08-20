# Fitness Frontend

Telegram Mini App client (React + Vite + TypeScript + Tailwind).

## Setup

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

## Scripts

- `npm run dev` — local dev server
- `npm run build` — production build
- `npm run test` — Vitest
- `npm run lint` — ESLint
- `npm run test:e2e` — Playwright, axe и visual snapshots
- `npm run check:bundle` — gzip budget после build
- `npm run audit:lighthouse` — Lighthouse после build

Маршруты приложения лениво подключаются в `src/App.tsx`; общий Telegram/browser
layout, reconnect и авторизация находятся в `src/components/layout/Shell.tsx`.
Полная карта проекта и обязательные проверки описаны в `../AGENTS.md`.
