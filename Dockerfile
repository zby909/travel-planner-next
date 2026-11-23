FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN npm ci --omit=dev && ./node_modules/.bin/prisma generate

FROM base AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_URL=file:/app/data/travel.db
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs \
  && mkdir -p /app/data/uploads \
  && chown -R nextjs:nodejs /app/data
COPY --from=builder --chown=nextjs:nodejs /app/package.json /app/LICENSE ./
COPY --from=builder --chown=nextjs:nodejs /app/docs/THIRD-PARTY-NOTICES.md ./docs/THIRD-PARTY-NOTICES.md
COPY --from=prod-deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
# Copy only common map assets and generic placeholders, never users' old photos.
COPY --from=builder --chown=nextjs:nodejs /app/public/maps ./public/maps
COPY --from=builder --chown=nextjs:nodejs /app/public/images/place-placeholder.svg ./public/images/place-placeholder.svg
COPY --from=builder --chown=nextjs:nodejs /app/public/images/destination-placeholder.svg ./public/images/destination-placeholder.svg
COPY --from=builder --chown=nextjs:nodejs /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma/migrations ./prisma/migrations
COPY --from=builder --chown=nextjs:nodejs \
  /app/scripts/apply-pending-restore.mjs \
  /app/scripts/backup-before-place-note.mjs \
  /app/scripts/bootstrap-admin.mjs \
  /app/scripts/check-data.mjs \
  /app/scripts/create-user.mjs \
  /app/scripts/deploy-database.mjs \
  /app/scripts/file-checksum.mjs \
  /app/scripts/migrate-backup.mjs \
  /app/scripts/prune-staged-media.mjs \
  /app/scripts/restore-media.mjs \
  /app/scripts/sqlite-path.mjs \
  /app/scripts/start-container.mjs \
  ./scripts/
COPY --from=builder --chown=nextjs:nodejs /app/next.config.ts ./next.config.ts
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "node scripts/apply-pending-restore.mjs && node scripts/deploy-database.mjs && exec node scripts/start-container.mjs"]
