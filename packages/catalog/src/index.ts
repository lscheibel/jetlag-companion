export { buildValidHidingArea, closeRing } from "./map/area";
export {
	type BuiltMap,
	buildMap,
	drawnSelection,
	type MapDraft,
} from "./map/build";
export {
	type HashableMap,
	mapContentHash,
	stopCatalogVersion,
} from "./map/content-hash";
export {
	areaFromSelection,
	composedSelection,
	foldPieces,
	foldPiecesToMultiPolygon,
	nameFromPieces,
	piecesFromSelection,
} from "./map/pieces";
export {
	boundaryLabel,
	GERMAN_ADMIN_LEVEL_LABELS,
	MAX_ADMIN_LEVEL,
	MIN_ADMIN_LEVEL,
} from "./osm/admin-level";
export {
	type BoundaryParseResult,
	type BoundarySkipReason,
	type OsmObjectType,
	type ParsedBoundary,
	parseBoundaryLine,
} from "./osm/boundary";
export { BERLIN_FIXTURE_BOUNDARIES } from "./osm/fixture";
export {
	BOUNDARY_SEARCH_LIMIT,
	type BoundarySearch,
	boundariesFromGeojsonseq,
	boundariesInBBox,
	boundariesMatching,
	boundaryContaining,
	CATALOG_ADMIN_LEVELS,
	type CatalogAdminLevel,
	type CatalogBoundary,
	catalogBoundaryFromParsed,
} from "./osm/query";
export { BERLIN_FIXTURE_CATALOG } from "./stops/fixture";
export {
	compareLineNames,
	groupLinesByMode,
	modeIdsFromLines,
} from "./stops/lines";
export {
	bboxContains,
	expandBBox,
	materialiseStops,
	nearestStationMeters,
	stopsInBBox,
} from "./stops/materialise";
export { MODE_IDS, type ModeId } from "./stops/modes";
export {
	SCALE_SETTINGS,
	type ScaleSettings,
	spanMeters,
	suggestScalePreset,
} from "./stops/scale";
export type {
	CatalogStop,
	MaterialisedStop,
	StopCatalog,
	StopLine,
} from "./stops/types";
