import { areaPackContentHash, mapConfigContentHash } from "./content-hash";
import type { AreaPack, MapConfig } from "./types";

export type ValidationIssue = {
	readonly path: string;
	readonly message: string;
};

export type ValidationResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly issues: readonly ValidationIssue[] };

function result(issues: ValidationIssue[]): ValidationResult {
	return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

export function validateAreaPack(pack: AreaPack): ValidationResult {
	const issues: ValidationIssue[] = [];
	const modeIds = new Set(pack.modes.map((mode) => mode.id));
	const stopIds = new Set(pack.stops.map((stop) => stop.id));

	if (pack.stops.length !== stopIds.size) {
		issues.push({ path: "stops", message: "stop ids are not unique" });
	}

	for (const stop of pack.stops) {
		for (const modeId of stop.modeIds) {
			if (!modeIds.has(modeId)) {
				issues.push({
					path: `stops.${stop.id}.modeIds`,
					message: `unknown mode "${modeId}"`,
				});
			}
		}
		const [lng, lat] = stop.position;
		const [minLng, minLat, maxLng, maxLat] = pack.bounds;
		if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) {
			issues.push({
				path: `stops.${stop.id}.position`,
				message: "outside the pack's bounds",
			});
		}
	}

	for (const line of pack.lines) {
		if (!modeIds.has(line.modeId)) {
			issues.push({
				path: `lines.${line.id}.modeId`,
				message: `unknown mode "${line.modeId}"`,
			});
		}
		for (const stopId of line.stopIds) {
			if (!stopIds.has(stopId)) {
				issues.push({
					path: `lines.${line.id}.stopIds`,
					message: `unknown stop "${stopId}"`,
				});
			}
		}
	}

	if (areaPackContentHash(pack) !== pack.contentHash) {
		issues.push({
			path: "contentHash",
			message: "does not match the pack's contents",
		});
	}

	return result(issues);
}

export function validateMapConfig(
	config: MapConfig,
	pack: AreaPack,
): ValidationResult {
	const issues: ValidationIssue[] = [];

	if (config.areaPackId !== pack.id) {
		issues.push({ path: "areaPackId", message: `expected "${pack.id}"` });
	}
	if (config.areaPackVersion !== pack.version) {
		issues.push({
			path: "areaPackVersion",
			message: `expected "${pack.version}"`,
		});
	}

	const stopIds = new Set(pack.stops.map((stop) => stop.id));
	for (const stopId of config.enabledStopIds) {
		if (!stopIds.has(stopId)) {
			issues.push({
				path: "enabledStopIds",
				message: `unknown stop "${stopId}"`,
			});
		}
	}

	// An empty seed means every fold returns nothing, which reads in the UI as a
	// broken constraint engine rather than as a misbuilt area.
	if (config.validHidingArea.length === 0) {
		issues.push({ path: "validHidingArea", message: "is empty" });
	}

	if (mapConfigContentHash(config) !== config.contentHash) {
		issues.push({
			path: "contentHash",
			message: "does not match the config's contents",
		});
	}

	return result(issues);
}
