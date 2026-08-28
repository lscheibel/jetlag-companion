# Deploying

Everything in this directory belongs on the server, not in the build. Copy it
across, fill in `.env`, and bring it up — there is no source checkout on the
host, because all four images are pulled.

```
infra/deploy/
  docker-compose.yml      the stack
  .env.example            copy to .env, fill in every value
  traefik/jetlag.yml    goes in Traefik's own config/ directory
```

## First time

1. `traefik/jetlag.yml` → the `config/` directory beside your Traefik compose
   file, the one bind-mounted to `/etc/traefik/conf.d`. Traefik reloads it
   without a restart.
2. DNS: `A` records for `jetlag` and `sync.jetlag`.
3. Copy `docker-compose.yml` and `.env.example` to a directory on the server,
   rename the latter to `.env`, and fill it in. `openssl rand -base64 32`
   generates a good value for each secret.
4. `docker compose up -d`

Give `zero-cache` several minutes on the first start. It builds a SQLite
replica of the whole database before it serves anything, which is why its
healthcheck allows a ten-minute start period.

## Deploying a new version

```
docker compose pull && docker compose up -d
```

`migrate` runs first, applies anything pending, and exits. `server` and
`zero-cache` start only if it exited zero, so a failed migration stops the
deploy instead of half-starting it. There is nothing to remember to run.

**Do not label these services for Watchtower.** Watchtower restarts a container
with a new image; it does not re-evaluate `depends_on`, so it would bring up a
server against a schema that was never migrated — silently skipping the one
safeguard above.

## Rolling back

`IMAGE_TAG` defaults to `latest`. Every build is also tagged with its commit
SHA, so a rollback is one line in `.env` followed by `docker compose up -d`.

Migrations do not roll back. If a release included one, going back to an older
image means the schema is ahead of the code — usually harmless for an additive
change, not for a destructive one.

## Where the rest lives

- Images are built and pushed by `.github/workflows/publish-images.yml` on
  every push to `main`.
- The catalog is **not** built in CI: `assets/` is gitignored, so a checkout has
  no 4.8 GB `.pbf` or 2.0 GB GTFS feed. It is published from a laptop with
  `npm run data:image -- --push` a few times a year, and pinned by tag in
  `apps/server/Dockerfile`.
