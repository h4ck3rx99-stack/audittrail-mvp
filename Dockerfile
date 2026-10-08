# Production image using Next.js standalone output.
# Build:  docker build -t audittrail .
# Run:    docker run --env-file .env.production -p 3000:3000 audittrail
# Release tasks (run once per deploy, from the same image):
#   docker run --env-file .env.production audittrail npx prisma migrate deploy
#   docker run --env-file .env.production audittrail npx tsx --conditions=react-server scripts/catalog-sync.ts

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Placeholder values only for the build; real configuration is validated at runtime.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build \
    AUTH_SECRET=build-time-placeholder-secret-not-used-at-runtime \
    APP_URL=http://localhost:3000 \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_OUTPUT_STANDALONE=1
RUN npx prisma generate && npx next build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# Migrations, CLI and catalog sync tooling for release tasks.
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/tsconfig.json ./tsconfig.json
USER app
EXPOSE 3000
CMD ["node", "server.js"]
