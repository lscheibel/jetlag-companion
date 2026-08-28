#!/usr/bin/env bash
#
# Build the catalog data image — the artifacts the server reads at boot, in an
# image that CI and a laptop can both `COPY --from=`.
#
# The raw inputs never leave this machine. assets/gtfs and assets/osm are 7 GB
# and gitignored, so a GitHub Actions checkout has no way to produce these
# files; publishing them once, as an image tagged by the day they were built,
# is what lets the server image be built anywhere.
#
# Usage:  npm run data:image [-- --tag 2026-08-28] [-- --push]
#
# Rebuilt a few times a year, after:
#   npm run osm:extract && npm run osm:extract:pois
#   npm run catalog:build
#   npm run catalog:import:pois && npm run catalog:import:boundaries

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DATA_DIR="${REPO_ROOT}/assets/catalog"
IMAGE="${DATA_IMAGE:-ghcr.io/lscheibel/jetlag-companion-data}"
TAG="${TAG:-$(date +%Y-%m-%d)}"
PUSH=0

while [[ $# -gt 0 ]]; do
	case "$1" in
	--tag)
		TAG="${2:?--tag needs a value}"
		shift 2
		;;
	--push)
		PUSH=1
		shift
		;;
	*)
		echo "error: unknown argument $1" >&2
		exit 1
		;;
	esac
done

# Where each artifact comes from, for an error message that is worth reading.
ARTIFACTS=(
	"stops.catalog.json:npm run catalog:build"
	"pois.catalog.json:npm run catalog:import:pois"
	"boundaries.catalog.json:npm run catalog:import:boundaries"
)

# Long enough that a quarterly OSM extract does not trip it, short enough that
# a year-old timetable does. A warning only: which artifacts are stale enough
# to matter is a judgement call, and a build is not the place to make it.
STALE_DAYS=180

human() { du -h "$1" 2>/dev/null | cut -f1; }

echo "==> checking artifacts in assets/catalog"

missing=0
for entry in "${ARTIFACTS[@]}"; do
	file="${entry%%:*}"
	how="${entry#*:}"
	path="${DATA_DIR}/${file}"
	if [[ ! -f "${path}" ]]; then
		echo "    MISSING ${file} — build it with \`${how}\`" >&2
		missing=1
		continue
	fi
	note=""
	if [[ -n "$(find "${path}" -mtime "+${STALE_DAYS}" 2>/dev/null)" ]]; then
		note="  ** older than ${STALE_DAYS} days, consider re-running \`${how}\` **"
	fi
	printf '    %-26s %6s%s\n' "${file}" "$(human "${path}")" "${note}"
done

if [[ "${missing}" -ne 0 ]]; then
	echo >&2
	echo "error: the data image would ship a server that silently falls back" >&2
	echo "       to the twelve-station Berlin fixture. Refusing to build." >&2
	exit 1
fi

# Generated into the context rather than tracked, because the context is
# assets/catalog and that directory is itself generated. Both upstreams
# require attribution and this image is public.
cat > "${DATA_DIR}/ATTRIBUTION.txt" <<'ATTRIBUTION'
This image contains data derived from two sources, each of which requires
attribution.

Administrative boundaries and points of interest
  © OpenStreetMap contributors, https://www.openstreetmap.org/copyright
  Licensed under the Open Database License (ODbL) v1.0.
  Derived from the Geofabrik Germany extract:
  https://download.geofabrik.de/europe/germany-latest.osm.pbf

Public transport stops, lines and modes
  Source data by DELFI e.V., packaged as GTFS by https://gtfs.de
  Licensed under Creative Commons Attribution 4.0 (CC-BY 4.0).
  Derived from the de_full feed: https://gtfs.de/en/feeds/de_full/

The files here are compacted derivatives, not the original datasets. See
packages/catalog in https://github.com/lscheibel/jetlag-companion for how
each was produced.
ATTRIBUTION

# Built for linux/amd64 because that is the deployment target and what the
# GitHub Actions runners are. The image holds no executables, so its platform
# label is bookkeeping rather than meaning — but every image carries one, and a
# single-arch image built on an Apple Silicon Mac makes every amd64 build log
# an InvalidBaseImagePlatform warning. Pinning it here moves that warning to
# local arm64 test builds, where it is visible and harmless, instead of CI.
#
# A multi-arch manifest would silence both, but needs a docker-container buildx
# driver; not worth the setup for a directory of JSON.
echo
echo "==> building ${IMAGE}:${TAG} for linux/amd64"
docker build \
	--platform linux/amd64 \
	--file "${REPO_ROOT}/infra/docker/data.Dockerfile" \
	--tag "${IMAGE}:${TAG}" \
	"${DATA_DIR}"

size="$(docker image inspect "${IMAGE}:${TAG}" --format '{{.Size}}')"
echo "    ${IMAGE}:${TAG} — $((size / 1000000)) MB uncompressed"

if [[ "${PUSH}" -eq 1 ]]; then
	echo
	echo "==> pushing ${IMAGE}:${TAG}"
	docker push "${IMAGE}:${TAG}"
	echo
	echo "==> pin it in apps/server/Dockerfile:"
	echo "    ARG DATA_IMAGE=${IMAGE}:${TAG}"
else
	echo
	echo "    not pushed. \`npm run data:image -- --push\` when you are ready,"
	echo "    after \`docker login ghcr.io\`."
fi
