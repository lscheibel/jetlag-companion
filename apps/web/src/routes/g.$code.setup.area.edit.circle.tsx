import {
	circleLngLat,
	distanceMeters,
	type LngLat,
	multiPolygonBBox,
} from "@zero-lag/geo";
import { ActionButton } from "@zero-lag/ui/components/action-button";
import { NumberStepper } from "@zero-lag/ui/components/number-stepper";
import {
	Screen,
	ScreenActions,
	ScreenHeader,
} from "@zero-lag/ui/components/screen";
import { useMemo, useState } from "react";
import { CircleDraftLayer } from "../map/circle-draft-layer";
import { MapPointerHandler } from "../map/map-interactions";
import { EditorMap } from "../setup/area/editor-map";
import { FoldLayer } from "../setup/area/layers";
import { useAreaToolNav } from "../setup/area/tool-nav";
import { useAreaEditor } from "../setup/area/use-editor";
import { WouldBecome } from "../setup/area/would-become";
import { formatZone } from "../setup/game-size";

const RADIUS_MIN = 50;
const RADIUS_STEP = 100;
const DEFAULT_RADIUS = 800;
const SNAP_METERS = 200;

export default function SetupAreaCircle() {
	const editor = useAreaEditor();
	const nav = useAreaToolNav();
	const [center, setCenter] = useState<LngLat | null>(null);
	const [radius, setRadius] = useState(DEFAULT_RADIUS);
	const [stopName, setStopName] = useState<string | null>(null);
	const geometry = useMemo(
		() => (center ? circleLngLat(center, radius) : null),
		[center, radius],
	);
	const op = editor.cut ? "subtract" : "add";
	const bounds = multiPolygonBBox(editor.foldMulti);
	const label = stopName
		? `${formatZone(radius)} around ${stopName}`
		: center
			? `${formatZone(radius)} circle`
			: "Circle";

	function commit() {
		if (!geometry) return;
		editor.addGeometry({ source: "circle", name: label, geometry });
		nav.afterCommit();
	}

	return (
		<Screen>
			<ScreenHeader
				eyebrow="Setting the area"
				onBack={nav.back}
				title={editor.cut ? "Circle to take out" : "A circle"}
			/>
			<EditorMap bounds={bounds} className="min-h-0 flex-1">
				<FoldLayer area={editor.foldMulti} />
				<CircleDraftLayer center={center} kind="area" radiusMeters={radius} />
				<MapPointerHandler
					mode={{
						kind: "radius",
						center,
						radiusMeters: radius,
					}}
					onRadiusChange={(draft) => {
						let next = draft.center;
						if (next && !center) {
							let bestName: string | null = null;
							let best = SNAP_METERS;
							for (const stop of editor.catalogStops) {
								const d = distanceMeters(next, [stop.lng, stop.lat]);
								if (d < best) {
									best = d;
									bestName = stop.name;
									next = [stop.lng, stop.lat];
								}
							}
							setStopName(bestName);
						}
						setCenter(next);
						setRadius(
							Math.max(RADIUS_MIN, Math.round(draft.radiusMeters / 50) * 50),
						);
					}}
				/>
			</EditorMap>
			<div className="px-4 pt-2">
				<NumberStepper
					canDecrease={radius > RADIUS_MIN}
					label="Radius"
					onStep={(direction) =>
						setRadius((current) =>
							Math.max(RADIUS_MIN, current + direction * RADIUS_STEP),
						)
					}
					testId="area-circle-radius"
					value={formatZone(radius)}
				/>
			</div>
			<ScreenActions
				note={
					geometry ? (
						<WouldBecome geometry={geometry} op={op} />
					) : (
						"Tap to place the centre, then drag the handles. The map still pans."
					)
				}
			>
				<ActionButton
					beacon
					data-testid="area-circle-add"
					disabled={!geometry || !editor.ready}
					onClick={commit}
				>
					{editor.cut ? `Take out ${label}` : `Add ${label}`}
				</ActionButton>
			</ScreenActions>
		</Screen>
	);
}
