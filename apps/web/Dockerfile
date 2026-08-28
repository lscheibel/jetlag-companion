FROM node:24-slim AS builder
WORKDIR /app

COPY . .
RUN --mount=type=cache,target=/root/.npm npm install

# Baked into the client bundle, which is what makes this image
# environment-specific: a bundle built against localhost cannot be redeployed
# to jetlag.lennardscheibel.de, it has to be rebuilt. Both are public URLs, and
# only public values belong here — a build arg stays readable in
# `docker history` forever, on an image anyone can pull.
#
# VITE_ZERO_CACHE_URL was passed by docker-compose.yml but never declared here,
# so it never reached the build; packages/env/src/web.ts requires it as a URL.
ARG VITE_SERVER_URL
ARG VITE_ZERO_CACHE_URL
# Baked in like the URLs above, and for the same reason it has to be: a client
# bundle cannot be asked at runtime which commit produced it.
ARG BUILD_VERSION=dev
ENV VITE_SERVER_URL=${VITE_SERVER_URL}
ENV VITE_ZERO_CACHE_URL=${VITE_ZERO_CACHE_URL}
ENV VITE_BUILD_VERSION=${BUILD_VERSION}
ENV NODE_ENV=production

# SPA mode prerenders the shell: `react-router build` starts a server on an
# ephemeral port and fetches `/` from it. Inside the build container
# `localhost` resolves ::1 before 127.0.0.1 (Node's default is `verbatim`,
# and /etc/hosts lists both), so the server and the request that fetches it
# can land on different loopbacks — "Prerender: Request failed for /: connect
# ECONNREFUSED 127.0.0.1". macOS resolves IPv4 first, which is why the same
# build succeeds on a laptop and fails here. Pinning the order makes both ends
# agree; it is scoped to this command rather than the image.
RUN cd apps/web && NODE_OPTIONS=--dns-result-order=ipv4first npm run build

# ssr:false means build/client is a directory of static files — React Router's
# own documented deployment for SPA mode. Serving it from Caddy rather than
# react-router-serve drops the runtime from ~766 MB to tens of megabytes and
# removes the Node process: `npm ci --omit=dev --workspace web` was installing
# react, maplibre-gl and @rocicorp/zero to serve 2.8 MB of assets that Vite had
# already bundled them into.
FROM caddy:2-alpine AS runner

# Config first, build output second: the former changes rarely, the latter
# every commit, and a layer invalidates everything after it.
COPY infra/docker/web.Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /app/apps/web/build/client /srv

EXPOSE 3001
