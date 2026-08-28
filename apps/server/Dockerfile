# The catalog arrives as its own image, so code and data are versioned apart:
# this pin moves a few times a year, everything below it moves with every
# commit. It is an ARG so CI can build against a new catalog without editing
# the file, but the default is the pin that ships.
ARG DATA_IMAGE=ghcr.io/lscheibel/jetlag-companion-data:2026-08-28

FROM ${DATA_IMAGE} AS data

FROM node:24-slim AS builder
WORKDIR /app
ENV SKIP_ENV_VALIDATION=1

COPY . .
RUN --mount=type=cache,target=/root/.npm npm install

ENV NODE_ENV=production
RUN cd apps/server && npm run build

# A second, production-only install, because the builder's node_modules is not
# fit to ship. `npm prune --omit=dev` does not traverse workspace
# devDependencies — it removed 74 packages of ~1000 and left typescript, vite
# and @babel behind — and a hoisted monorepo install also puts *every*
# workspace's dependencies in one tree, so the server would carry maplibre-gl,
# @phosphor-icons and @base-ui for a map it never draws.
#
# `npm ci` needs every workspace package.json present to match the lockfile,
# which is why they are all listed; `--workspace server` is what narrows the
# install itself. Adding a package to the monorepo means adding a line here,
# and npm says so loudly if you forget.
FROM node:24-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY e2e/package.json e2e/
COPY packages/catalog/package.json packages/catalog/
COPY packages/config/package.json packages/config/
COPY packages/env/package.json packages/env/
COPY packages/geo/package.json packages/geo/
COPY packages/platform/package.json packages/platform/
COPY packages/rules/package.json packages/rules/
COPY packages/schema/package.json packages/schema/
COPY packages/ui/package.json packages/ui/

RUN --mount=type=cache,target=/root/.npm \
	npm ci --omit=dev --workspace server --include-workspace-root

FROM node:24-slim AS runner
ENV NODE_ENV=production
WORKDIR /app

# Ordered by how often each layer changes, because a changed layer invalidates
# every layer after it and forces all of them to be pushed again. The catalog
# is 232 MB and moves quarterly; node_modules moves with the lockfile; dist
# moves with every commit and is under a megabyte. Reversing this order would
# mean re-pushing the catalog on every deploy.
COPY --from=data /data ./assets/catalog
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json
COPY --from=builder /app/apps/server/dist ./apps/server/dist

# The loader would find these by walking up from the working directory, but
# saying so explicitly is one less thing that depends on where CMD runs from.
# A wrong path here is a server that quietly serves twelve Berlin stations.
ENV STOP_CATALOG_PATH=/app/assets/catalog/stops.catalog.json
ENV POIS_PATH=/app/assets/catalog/pois.catalog.json
ENV BOUNDARIES_PATH=/app/assets/catalog/boundaries.catalog.json

EXPOSE 3000

WORKDIR /app/apps/server
CMD ["node", "dist/index.mjs"]
