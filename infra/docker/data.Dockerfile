# The catalog artifacts the server reads at boot, and nothing else.
#
# `FROM scratch` because this image is never run. It exists to be read by a
# `COPY --from=` in apps/server/Dockerfile, which is how code and data come to
# be versioned apart: the artifacts are rebuilt from a 4.8 GB .pbf and a 2.0 GB
# GTFS feed a few times a year, the server is rebuilt on every commit, and CI
# has neither of those inputs because assets/ is gitignored.
#
# The build context is assets/catalog itself, not the repo root. That is what
# keeps this from ever having to agree with the root .dockerignore about which
# of the 7 GB of raw inputs to leave behind — the context *is* the payload.
#
# Build it with infra/docker/build-data-image.sh, which checks the artifacts
# are present and current and writes the ATTRIBUTION.txt copied in below.

FROM scratch

COPY . /data/

# `image.source` is what links the package to the repository on GitHub, so it
# appears in the repo sidebar and inherits its visibility.
LABEL org.opencontainers.image.source="https://github.com/lscheibel/jetlag-companion"
LABEL org.opencontainers.image.title="zero-lag catalog"
LABEL org.opencontainers.image.description="Stop, POI and administrative boundary catalogs derived from OpenStreetMap and the gtfs.de de_full feed."
LABEL org.opencontainers.image.licenses="ODbL-1.0 AND CC-BY-4.0"
