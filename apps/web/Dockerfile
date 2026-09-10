# Uses Docker Desktop's built-in BuildKit frontend (no extra registry frontend).
# Build stage
FROM --platform=$BUILDPLATFORM node:24.19.0-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS builder

# Sentry org/project are public identifiers (not secrets). The auth token
# is the only real secret; it is mounted via `--mount=type=secret` during
# the pnpm build step so it never lands in any layer or image metadata.
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ENV SENTRY_ORG=$SENTRY_ORG
ENV SENTRY_PROJECT=$SENTRY_PROJECT

# Install build dependencies in a single layer
RUN apk add --no-cache python3 make g++ && \
  corepack enable && \
  corepack prepare pnpm@10.32.1 --activate

WORKDIR /app

# Copy package files first for better layer caching
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/libs/package.json ./packages/libs/
COPY packages/permissions/package.json ./packages/permissions/

# Install dependencies
RUN --mount=type=cache,id=relayops-pnpm,target=/pnpm/store,sharing=locked \
  pnpm install --frozen-lockfile --store-dir=/pnpm/store --network-concurrency=8

# Copy only necessary source code
COPY packages/typescript-config ./packages/typescript-config
COPY packages/libs ./packages/libs
COPY packages/permissions ./packages/permissions
COPY i18n ./i18n
COPY apps/web ./apps/web
COPY LICENSE THIRD_PARTY_NOTICES ./
COPY scripts/release/licenses.mjs ./scripts/release/licenses.mjs

# Build the permissions package first
WORKDIR /app/packages/permissions
RUN pnpm run build

# Build the application
WORKDIR /app/apps/web
# SENTRY_AUTH_TOKEN is optional: only mounted during container builds that
# need it (e.g., the publish workflows). Local or CI builds without the
# secret still succeed; the build just runs without it.
RUN --mount=type=secret,id=SENTRY_AUTH_TOKEN,required=false \
    if [ -f /run/secrets/SENTRY_AUTH_TOKEN ]; then export SENTRY_AUTH_TOKEN="$(cat /run/secrets/SENTRY_AUTH_TOKEN)"; fi; \
    pnpm run build

RUN node /app/scripts/release/licenses.mjs web /app/licenses/web

# Production stage with specific version
FROM nginx:1.30.4-alpine@sha256:dc5069ad14f19660b141b21236140b91656bf89bbc3e2417c70ae650cd66104c AS runtime

# Create non-root user and configure nginx in a single layer
RUN apk add --no-cache libcrypto3=3.5.8-r0 libssl3=3.5.8-r0 libuuid=2.42.3-r1 && \
  addgroup -g 1001 appuser && \
  adduser -u 1001 -G appuser -D appuser && \
  # Set permissions for nginx directories
  chown -R appuser:appuser /var/cache/nginx && \
  chmod -R 755 /var/cache/nginx && \
  # Create directory for pid file
  mkdir -p /var/run/nginx && \
  chown -R appuser:appuser /var/run/nginx && \
  chmod -R 755 /var/run/nginx && \
  # Set permissions for nginx pid file
  touch /var/run/nginx.pid && \
  chown appuser:appuser /var/run/nginx.pid && \
  chmod 644 /var/run/nginx.pid && \
  # Update nginx configuration to run as non-root
  sed -i 's/user  nginx;/user  appuser;/' /etc/nginx/nginx.conf && \
  # Remove the user directive completely to avoid warnings
  sed -i 's/user  appuser;//' /etc/nginx/nginx.conf

# Copy built files from builder stage
COPY --from=builder --chown=appuser:appuser /app/apps/web/dist /usr/share/nginx/html

# Copy nginx configuration (writable so env.sh can substitute placeholders at runtime)
COPY --chown=appuser:appuser apps/web/nginx.conf /etc/nginx/conf.d/default.conf
RUN chown -R appuser:appuser /etc/nginx/conf.d

# Copy and set permissions for environment script
COPY --chown=appuser:appuser apps/web/env.sh /docker-entrypoint.d/env.sh
RUN chmod +x /docker-entrypoint.d/env.sh

COPY --from=builder /app/licenses/web /licenses
COPY --from=builder /app/licenses/web /usr/share/nginx/html/licenses
ARG RELAYOPS_SOURCE_URL
ARG RELAYOPS_REVISION=local
LABEL org.opencontainers.image.title="RelayOps web" org.opencontainers.image.licenses="MIT" org.opencontainers.image.source=$RELAYOPS_SOURCE_URL org.opencontainers.image.revision=$RELAYOPS_REVISION
# Switch to non-root user
USER appuser
EXPOSE 5173

HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=12 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5173/ || exit 1

# Use exec form of CMD for proper signal handling
CMD ["nginx", "-g", "daemon off;"]
