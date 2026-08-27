#!/usr/bin/env bash
#
# Extract amenity / tourism / historic / leisure / natural / diplomatic POIs
# from an OSM .pbf.
#
# Two osmium passes, both inside the container defined in docker-compose.yml:
#
#   1. tags-filter  — keep nodes, ways and relations with the kinds the play
#                     map offers, plus the ways and nodes they reference.
#                     Parks (leisure=park) and consulates (diplomatic=consulate)
#                     are candidates only: osmium cannot AND a name or NOT
#                     honorary_consul. The TypeScript importer drops those.
#   2. export       — write one GeoJSON feature per line. Points stay points;
#                     closed ways and multipolygon relations assemble as
#                     polygons so the importer can place a dot at the centre.
#
# Usage:  npm run osm:extract:pois [-- <input.osm.pbf>]
# Input and output both live in the repo's gitignored assets/osm/ directory.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DATA_DIR="${REPO_ROOT}/assets/osm"
COMPOSE=(docker compose -f "${REPO_ROOT}/infra/docker/docker-compose.yml")

INPUT="${1:-germany-latest.osm.pbf}"
FILTERED="pois.osm.pbf"
OUTPUT="pois.geojsonseq"

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
echo "==> pass 1/2: filtering POI tags"
echo "    in:  ${INPUT} ($(human "${DATA_DIR}/${INPUT}"))"
started=$(date +%s)
"${COMPOSE[@]}" run --rm osmium tags-filter \
	"/data/${INPUT}" \
	nwr/tourism=museum,gallery,zoo,theme_park,aquarium \
	nwr/amenity=library,theatre,hospital,cinema \
	nwr/historic=castle \
	nwr/leisure=water_park,stadium,park,golf_course \
	nwr/natural=peak \
	nwr/diplomatic=consulate \
	--output "/data/${FILTERED}" \
	--overwrite
echo "    out: ${FILTERED} ($(human "${DATA_DIR}/${FILTERED}")) in $(($(date +%s) - started))s"

echo
echo "==> pass 2/2: exporting points and assembled polygons"
# point,polygon: nodes stay pins; closed ways and multipolygon relations become
# areas. LineStrings are dropped — an unclosed way is not a place we can plot.
started=$(date +%s)
"${COMPOSE[@]}" run --rm osmium export \
	"/data/${FILTERED}" \
	--config /config/poi-export-config.json \
	--geometry-types=point,polygon \
	--output-format=geojsonseq \
	--format-option print_record_separator=false \
	--show-errors \
	--output "/data/${OUTPUT}" \
	--overwrite
echo "    out: ${OUTPUT} ($(human "${DATA_DIR}/${OUTPUT}")) in $(($(date +%s) - started))s"

echo
echo "==> ${OUTPUT}: $(wc -l < "${DATA_DIR}/${OUTPUT}" | tr -d ' ') features"
echo "    next: npm run catalog:import:pois"
