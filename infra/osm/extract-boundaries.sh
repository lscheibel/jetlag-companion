#!/usr/bin/env bash
#
# Extract administrative boundaries from an OSM .pbf. m4-spec §4.
#
# Two osmium passes, both inside the container defined in docker-compose.yml:
#
#   1. tags-filter  — keep relations tagged boundary=administrative, plus the
#                     ways and nodes they reference. Streaming, one pass.
#   2. export       — assemble those relations into polygons and write one
#                     GeoJSON feature per line for the importer to stream.
#
# The second pass is the one that earns the native dependency: a boundary
# relation is an unordered bag of ways with outer/inner roles, arbitrary
# direction, holes and real exclaves, and libosmium's area assembler already
# resolves all of that. Everything downstream of this script is TypeScript.
#
# Usage:  npm run osm:extract [-- <input.osm.pbf>]
# Input and output both live in the repo's gitignored assets/osm/ directory.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DATA_DIR="${REPO_ROOT}/assets/osm"
COMPOSE=(docker compose -f "${REPO_ROOT}/infra/docker/docker-compose.yml")

INPUT="${1:-germany-latest.osm.pbf}"
FILTERED="boundaries.osm.pbf"
OUTPUT="boundaries.geojsonseq"

if [[ ! -d "${DATA_DIR}" ]]; then
	echo "error: ${DATA_DIR} does not exist. Create it and put ${INPUT} inside." >&2
	exit 1
fi

if [[ ! -f "${DATA_DIR}/${INPUT}" ]]; then
	echo "error: ${DATA_DIR}/${INPUT} not found." >&2
	echo "       Download a Geofabrik extract, e.g." >&2
	echo "       https://download.geofabrik.de/europe/germany-latest.osm.pbf" >&2
	exit 1
fi

human() { du -h "$1" 2>/dev/null | cut -f1; }

echo "==> osmium version"
"${COMPOSE[@]}" run --rm osmium --version | head -2

echo
echo "==> pass 1/2: filtering boundary=administrative relations"
echo "    in:  ${INPUT} ($(human "${DATA_DIR}/${INPUT}"))"
started=$(date +%s)
"${COMPOSE[@]}" run --rm osmium tags-filter \
	"/data/${INPUT}" \
	r/boundary=administrative \
	--output "/data/${FILTERED}" \
	--overwrite
echo "    out: ${FILTERED} ($(human "${DATA_DIR}/${FILTERED}")) in $(($(date +%s) - started))s"

echo
echo "==> pass 2/2: assembling polygons"
# --geometry-types=polygon is load-bearing, not tidiness: boundary relations
# carry admin_centre and label *nodes* as members, and without this they are
# exported as Point features that look like tiny boundaries to a naive importer.
# --show-errors reports relations whose rings do not close; they are dropped,
# and a silent drop is the thing worth avoiding.
started=$(date +%s)
"${COMPOSE[@]}" run --rm osmium export \
	"/data/${FILTERED}" \
	--config /config/export-config.json \
	--geometry-types=polygon \
	--output-format=geojsonseq \
	--format-option print_record_separator=false \
	--show-errors \
	--output "/data/${OUTPUT}" \
	--overwrite
echo "    out: ${OUTPUT} ($(human "${DATA_DIR}/${OUTPUT}")) in $(($(date +%s) - started))s"

echo
echo "==> ${OUTPUT}: $(wc -l < "${DATA_DIR}/${OUTPUT}" | tr -d ' ') features"
echo "    next: npm run catalog:import:boundaries"
