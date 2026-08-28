# Applies pending Drizzle migrations, then exits.
#
# Its own image rather than a stage of the server, because it needs the exact
# things the server image is built to exclude: drizzle-kit (a devDependency),
# the TypeScript schema source, and packages/schema/src/migrations. The server
# ships a bundled dist and production dependencies only.
#
# infra/deploy/docker-compose.yml runs this as a blocking init step —
# `depends_on: condition: service_completed_successfully` — so a migration that
# fails stops the deploy instead of starting a server against a schema it does
# not match. `drizzle-kit migrate` is idempotent: it consults the
# __drizzle_migrations table and does nothing when there is nothing pending.

FROM node:24-slim
WORKDIR /app

COPY . .

# Dev dependencies included on purpose: drizzle-kit is one. This image is a
# one-shot task that runs for a second or two per deploy, so its size buys
# less than being installed straight from the lockfile the app was built with.
# No --include-workspace-root: the root's devDependencies are turbo and biome,
# neither of which applies a migration. dotenv still resolves, hoisted through
# @zero-lag/env.
RUN --mount=type=cache,target=/root/.npm \
	npm ci --workspace @zero-lag/schema

# drizzle.config.ts resolves `out` and the schema path relative to this
# directory. It also dotenv-loads ../../apps/server/.env, which does not exist
# here; dotenv ignores a missing file, and DATABASE_URL from the environment
# takes precedence regardless.
WORKDIR /app/packages/schema

CMD ["npx", "drizzle-kit", "migrate"]
