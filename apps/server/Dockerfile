# syntax=docker/dockerfile:1
FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json apps/server/

RUN pnpm install --frozen-lockfile

COPY apps/server apps/server
RUN pnpm --filter @stellar-thorn/server build

ENV NODE_ENV=production
# Issued API keys live here; mount a volume on it to keep them across restarts.
ENV BARET_DATA_DIR=/data
VOLUME /data
EXPOSE 8080
CMD ["node", "apps/server/dist/index.js"]
