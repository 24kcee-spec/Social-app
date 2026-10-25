FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
COPY . .
RUN pnpm install --frozen-lockfile

FROM dependencies AS web-build
ARG SUPABASE_URL
ARG SUPABASE_PUBLISHABLE_KEY
ARG PUBLIC_API_URL=http://api:4000
ARG PUBLIC_WEB_URL
ENV SUPABASE_URL=$SUPABASE_URL SUPABASE_PUBLISHABLE_KEY=$SUPABASE_PUBLISHABLE_KEY PUBLIC_API_URL=$PUBLIC_API_URL PUBLIC_WEB_URL=$PUBLIC_WEB_URL
RUN pnpm --filter @sp/web build

FROM node:22-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=web-build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=web-build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node","apps/web/server.js"]

FROM dependencies AS api
ENV NODE_ENV=production PORT=4000
USER node
EXPOSE 4000
CMD ["pnpm","--filter","@sp/api","start"]

FROM dependencies AS live-guard
ENV NODE_ENV=production
USER node
CMD ["node","apps/web/scripts/livekit-guard.mjs"]
