ARG BUN_VERSION=1.3-alpine

# ---- deps ----
FROM oven/bun:${BUN_VERSION} AS deps
WORKDIR /app
COPY package.json bun.lock* bun.lockb* ./
RUN bun install --frozen-lockfile --production

# ---- dev-deps (for typecheck) ----
FROM oven/bun:${BUN_VERSION} AS build
WORKDIR /app
COPY package.json bun.lock* bun.lockb* ./
RUN bun install --frozen-lockfile
COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN bunx tsc --noEmit

# ---- runner ----
FROM oven/bun:${BUN_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -S app && adduser -S app -G app

COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/src          ./src
COPY package.json tsconfig.json ./

USER app

# Long-polling Telegram bot — no inbound port.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD pgrep -f "bun" >/dev/null || exit 1

CMD ["bun", "run", "src/main.ts"]
