FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY client/package*.json ./client/
RUN npm ci --prefix client
COPY . .
RUN npm --prefix client run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=3000 \
    CLAMSCAN_PATH=/usr/bin/clamscan \
    CLAMAV_DATABASE_PATH=/var/lib/clamav
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    ca-certificates \
    clamav \
    clamav-freshclam \
    gosu \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/server.js ./server.js
COPY --from=build /app/config ./config
COPY --from=build /app/middleware ./middleware
COPY --from=build /app/models ./models
COPY --from=build /app/routes ./routes
COPY --from=build /app/services ./services
COPY --from=build /app/views ./views
COPY --from=build /app/public ./public
COPY --from=build /app/client/dist ./client/dist
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN mkdir -p /app/tmp \
    && chown node:node /app/tmp \
    && chmod +x /app/docker-entrypoint.sh
EXPOSE 3000
CMD ["/app/docker-entrypoint.sh"]
