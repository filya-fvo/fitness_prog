# Multi-stage static build for Nginx / any static host
FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm install
COPY . .

# Build-time public env (override in CI/CD)
ARG VITE_API_URL=
ARG VITE_SENTRY_DSN=
ARG VITE_BOT_USERNAME=
ENV VITE_API_URL=$VITE_API_URL \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN \
    VITE_BOT_USERNAME=$VITE_BOT_USERNAME

RUN npm run build:publish

FROM nginx:1.28-alpine AS runtime
COPY --from=build /app/dist /opt/fitness-release
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.d/40-publish-release.sh /docker-entrypoint.d/40-publish-release.sh
RUN chmod 755 /docker-entrypoint.d/40-publish-release.sh
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
