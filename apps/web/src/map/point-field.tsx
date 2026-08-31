import { distanceMeters, type LngLat } from "@zero-lag/geo";
import { webPlatform } from "@zero-lag/platform/web";
import { Field } from "@zero-lag/ui/components/field";
import { Icon, type IconName } from "@zero-lag/ui/components/icon";
import { Sheet } from "@zero-lag/ui/components/sheet";
import { cn } from "@zero-lag/ui/lib/utils";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MapPin } from "./pin-layer";
import type { MapPoi } from "./poi";
import { type PoiTypeId, poiTypeLabel, poiTypeSingular } from "./poi-type";
import { PoiTypeGlyph } from "./poi-type-glyph";
import { usePointSources } from "./point-sources";
import { formatAccuracy, relativeAge } from "./staleness";
import {
	formatCoordinates,
	formatDistance,
	parsePastedCoordinates,
	sameLngLat,
} from "./toolkit";

/**
 * Where a coordinate came from. It is not decoration: the glyph on the resting
 * line is the only thing that tells a player whether the number under their
 * thumb is their own position, a pin they trusted an hour ago, or something
 * they typed.
 */
type PointSource =
	| "typed"
	| "me"
	| "map"
	| "clipboard"
	| "pin"
	| "place"
	| "zone";

const SOURCE_ICON: Readonly<Record<PointSource, IconName>> = {
	typed: "pencil-line",
	me: "crosshair",
	map: "map-trifold",
	clipboard: "clipboard",
	pin: "map-pin",
	place: "flag-banner",
	zone: "map-pin-simple-area",
};

/** Above this many rows, finding one by eye stops working. */
const SEARCH_AT = 8;

interface PointFieldProps {
	readonly point: LngLat | null;
	readonly onPoint: (point: LngLat) => void;
	readonly testIdPrefix: string;
	/** A name on the leading edge, where two points share one card. */
	readonly label?: string;
	/** The map is writing this point on every tap. */
	readonly armed?: boolean;
	/** Aim the map at this point. Absent where there is no map to tap. */
	readonly onArm?: () => void;
}

/**
 * A point, at rest.
 *
 * In a card a coordinate is a fact about the thing being made — a line the
 * height of a tap, with where it came from, what it is, and a way to copy it.
 * There is no field here and no caret: typing is the exception, and a card that
 * shows a text box advertises the exception as the job. Tapping the line opens
 * the sheet, and the field only exists in there.
 */
export function PointField({
	point,
	onPoint,
	testIdPrefix,
	label,
	armed = false,
	onArm,
}: PointFieldProps) {
	const [open, setOpen] = useState(false);
	/** Bumped on every opening, so the sheet starts over without an effect. */
	const [opening, setOpening] = useState(0);
	const [source, setSource] = useState<PointSource | null>(null);
	const written = useRef<LngLat | null>(point);

	// A value that changed without this field writing it came off the map.
	if (
		point &&
		(written.current === null || !sameLngLat(written.current, point))
	) {
		written.current = point;
		setSource("map");
	} else if (!point && written.current !== null) {
		written.current = null;
		setSource(null);
	}

	const apply = (next: LngLat, from: PointSource) => {
		written.current = next;
		setSource(from);
		onPoint(next);
	};

	// The glyph says where this value came from; the ring says where the next
	// one will. Two different facts, and the ring already has a line of its own.
	const glyph = source ? SOURCE_ICON[source] : SOURCE_ICON.pin;

	return (
		<div
			className="flex min-w-0 flex-col gap-1"
			data-testid={`${testIdPrefix}-coordinates`}
		>
			<div
				className={cn(
					"flex min-h-tap-primary items-center gap-3 rounded-tile border-2 bg-surface px-3.5 py-2",
					armed
						? "border-action shadow-[0_0_0_3px_var(--surface-raised),0_0_0_6px_var(--action)]"
						: "border-hairline-strong",
				)}
			>
				<button
					className="flex min-w-0 flex-1 items-center gap-3 self-stretch text-left"
					data-testid={`${testIdPrefix}-point`}
					onClick={() => {
						setOpening((count) => count + 1);
						setOpen(true);
					}}
					type="button"
				>
					<Icon className="shrink-0 text-ink-dim" name={glyph} size="sm" />
					<span className="min-w-0 flex-1">
						{label && <span className="eyebrow block">{label}</span>}
						<span
							className={cn(
								"block truncate font-medium font-mono text-base tabular-nums",
								!point && "text-ink-faint",
							)}
						>
							{point ? formatCoordinates(point) : "Choose a point"}
						</span>
					</span>
					{/* A chevron while there is nothing to show, copy once there is:
					    the trailing edge carries whichever the line needs. */}
					{!point && (
						<Icon
							className="shrink-0 text-ink-faint"
							name="caret-right"
							size="sm"
						/>
					)}
				</button>
				{point && <CopyButton point={point} testId={`${testIdPrefix}-copy`} />}
			</div>
			{armed && (
				<p className="eyebrow px-1" data-testid={`${testIdPrefix}-armed`}>
					Tap the map
				</p>
			)}
			<PointSheet
				key={opening}
				onArm={onArm}
				onClose={() => setOpen(false)}
				onPoint={apply}
				open={open}
				point={point}
				testIdPrefix={testIdPrefix}
			/>
		</div>
	);
}

/** Copy is a state, not a screen: the glyph becomes a check and comes back. */
function CopyButton({
	point,
	testId,
}: {
	readonly point: LngLat;
	readonly testId: string;
}) {
	const [copied, setCopied] = useState(false);
	const timer = useRef<number | null>(null);
	useEffect(
		() => () => {
			if (timer.current !== null) window.clearTimeout(timer.current);
		},
		[],
	);
	if (!webPlatform.clipboard.capability().available) return null;

	return (
		<button
			aria-label={copied ? "Copied" : "Copy the coordinates"}
			className={cn(
				"grid size-10 shrink-0 place-items-center rounded-control",
				"transition-transform duration-[--dur-press] ease-[--ease-pop] active:scale-90",
				copied ? "text-live" : "text-ink-dim",
			)}
			data-testid={testId}
			onClick={() => {
				void webPlatform.clipboard
					.write(formatCoordinates(point))
					.then((ok) => {
						if (!ok) return;
						setCopied(true);
						timer.current = window.setTimeout(() => setCopied(false), 1400);
					});
			}}
			type="button"
		>
			<Icon name={copied ? "check" : "copy"} size="sm" />
		</button>
	);
}

type Level =
	| { readonly kind: "point" }
	| { readonly kind: "pins" }
	| { readonly kind: "placeTypes" }
	| { readonly kind: "places"; readonly type: PoiTypeId };

/**
 * The sheet: the field, and every way of filling it.
 *
 * A source that lands a point dismisses the sheet — one tap, one result, the
 * map back in view. The exception is a paste that could not be read, which has
 * something left to say and so stays to say it.
 */
function PointSheet({
	open,
	point,
	testIdPrefix,
	onPoint,
	onArm,
	onClose,
}: {
	readonly open: boolean;
	readonly point: LngLat | null;
	readonly testIdPrefix: string;
	readonly onPoint: (point: LngLat, source: PointSource) => void;
	readonly onArm?: () => void;
	readonly onClose: () => void;
}) {
	const sources = usePointSources();
	const [level, setLevel] = useState<Level>({ kind: "point" });
	const [text, setText] = useState(point ? formatCoordinates(point) : "");
	const [problem, setProblem] = useState<string | null>(null);
	const [query, setQuery] = useState("");

	/** A level change starts its list unfiltered. */
	const goTo = (next: Level) => {
		setQuery("");
		setLevel(next);
	};

	const pick = (next: LngLat, source: PointSource) => {
		onPoint(next, source);
		onClose();
	};

	const changeText = (next: string) => {
		setText(next);
		setProblem(null);
		const found = parsePastedCoordinates(next, sources.area);
		if (found) onPoint(found.point, "typed");
	};

	const paste = () => {
		void webPlatform.clipboard.read().then((clip) => {
			if (!clip) {
				setProblem("Nothing on the clipboard. The point is unchanged.");
				return;
			}
			const found = parsePastedCoordinates(clip, sources.area);
			if (!found) {
				setText(clip);
				setProblem(
					"Nothing in that looks like a point. Edit it, or paste again.",
				);
				return;
			}
			setText(formatCoordinates(found.point));
			pick(found.point, "clipboard");
		});
	};

	const pins = byDistance(
		sources.pins,
		(pin) => [pin.lng, pin.lat],
		sources.origin,
	);
	const placesOfType =
		level.kind === "places"
			? byDistance(
					sources.places.filter((place) => place.kind === level.type),
					(place) => [place.lng, place.lat],
					sources.origin,
				)
			: [];
	const search =
		level.kind === "pins" && pins.length > SEARCH_AT
			? "Find a pin"
			: level.kind === "places" && placesOfType.length > SEARCH_AT
				? `Find a ${poiTypeSingular(level.type)}`
				: null;

	if (typeof document === "undefined") return null;

	const title =
		level.kind === "point"
			? "The point"
			: level.kind === "pins"
				? "From a pin"
				: level.kind === "placeTypes"
					? "What kind of place"
					: poiTypeLabel(level.type);

	/*
	 * To the body, not to the card. The pickers live inside cards that scroll
	 * and are capped at a fraction of the screen, and a sheet rendered inside
	 * one of those is a sheet inside a 45%-tall box.
	 */
	return createPortal(
		<Sheet
			onClose={onClose}
			open={open}
			pinned={
				search && (
					<Field
						data-testid={`${testIdPrefix}-search`}
						label={search}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Any part of the name"
						trailing={
							<Icon
								className="text-ink-faint"
								name="magnifying-glass"
								size="sm"
							/>
						}
						value={query}
					/>
				)
			}
			testId={`${testIdPrefix}-sheet`}
			title={
				level.kind === "point" ? (
					title
				) : (
					<span className="flex items-center gap-1">
						<button
							aria-label="Back"
							className="-ml-1 grid size-tap shrink-0 place-items-center rounded-control text-ink-dim transition-transform duration-[--dur-press] ease-[--ease-pop] active:scale-90"
							data-testid={`${testIdPrefix}-back`}
							onClick={() =>
								goTo(
									level.kind === "places"
										? { kind: "placeTypes" }
										: { kind: "point" },
								)
							}
							type="button"
						>
							<Icon name="caret-left" size="md" />
						</button>
						<span className="truncate">{title}</span>
					</span>
				)
			}
		>
			{level.kind === "point" && (
				<>
					<Field
						className="[&_input]:font-mono [&_input]:tabular-nums"
						data-testid={`${testIdPrefix}-input`}
						inputMode="decimal"
						label="Coordinates"
						onChange={(event) => changeText(event.target.value)}
						placeholder="52.52000, 13.40500"
						problem={problem}
						value={text}
					/>
					<span className="eyebrow px-1">Choose position</span>
					<div className="flex flex-col gap-2">
						{sources.fix && (
							<SourceRow
								hint={`${formatAccuracy(sources.fix.accuracyMeters)} · ${relativeAge(Math.max(0, Date.now() - sources.fix.capturedAt))}`}
								icon="crosshair"
								onClick={() => {
									const fix = sources.fix;
									if (fix) pick(fix.point, "me");
								}}
								testId={`${testIdPrefix}-source-me`}
								title="Current location"
							/>
						)}
						{onArm && (
							<SourceRow
								hint="Tap the map to place it"
								icon="map-trifold"
								onClick={() => {
									onArm();
									onClose();
								}}
								testId={`${testIdPrefix}-source-map`}
								title="Choose on map"
							/>
						)}
						{webPlatform.clipboard.capability().available && (
							<SourceRow
								hint="A pair, a link, or degrees"
								icon="clipboard"
								onClick={paste}
								testId={`${testIdPrefix}-source-paste`}
								title="Paste from clipboard"
							/>
						)}
						{sources.pins.length > 0 && (
							<SourceRow
								count={sources.pins.length}
								drills
								hint="Your team's map"
								icon="map-pin"
								onClick={() => goTo({ kind: "pins" })}
								testId={`${testIdPrefix}-source-pins`}
								title="From a pin"
							/>
						)}
						{sources.places.length > 0 && (
							<SourceRow
								drills
								hint="Stations, parks, museums"
								icon="flag-banner"
								onClick={() => goTo({ kind: "placeTypes" })}
								testId={`${testIdPrefix}-source-places`}
								title="From a place"
							/>
						)}
						{sources.hidingZoneStop && (
							<SourceRow
								hint={sources.hidingZoneStop.name}
								icon="map-pin-simple-area"
								onClick={() => {
									const stop = sources.hidingZoneStop;
									if (stop) pick(stop.point, "zone");
								}}
								testId={`${testIdPrefix}-source-zone`}
								title="Hiding zone stop"
							/>
						)}
					</div>
				</>
			)}

			{level.kind === "pins" && (
				<PinList
					onPick={(next) => pick(next, "pin")}
					pins={matching(pins, query, (pin) => pin.label)}
					testIdPrefix={testIdPrefix}
				/>
			)}

			{level.kind === "placeTypes" && (
				<PlaceTypeList
					onPick={(type) => goTo({ kind: "places", type })}
					places={sources.places}
					testIdPrefix={testIdPrefix}
					types={sources.placeTypes}
				/>
			)}

			{level.kind === "places" && (
				<PlaceList
					onPick={(next) => pick(next, "place")}
					origin={sources.origin}
					places={matching(placesOfType, query, (place) => place.name)}
					testIdPrefix={testIdPrefix}
				/>
			)}
		</Sheet>,
		document.body,
	);
}

function SourceRow({
	icon,
	leading,
	title,
	hint,
	count,
	drills = false,
	onClick,
	testId,
}: {
	readonly icon?: IconName;
	readonly leading?: ReactNode;
	readonly title: string;
	readonly hint?: string;
	readonly count?: number;
	readonly drills?: boolean;
	readonly onClick: () => void;
	readonly testId: string;
}) {
	return (
		<button
			className="flex min-h-tap-comfortable w-full items-center gap-3 rounded-tile border border-hairline bg-surface px-3 py-2 text-left transition-transform duration-[--dur-press] ease-[--ease-pop] active:scale-[0.985]"
			data-testid={testId}
			onClick={onClick}
			type="button"
		>
			{icon ? (
				<span className="grid size-9 shrink-0 place-items-center rounded-control bg-surface-raised text-ink-dim">
					<Icon name={icon} size="sm" />
				</span>
			) : (
				leading
			)}
			<span className="min-w-0 flex-1">
				<span className="block truncate font-medium text-sm">{title}</span>
				{hint && (
					<span className="block truncate text-ink-faint text-xs">{hint}</span>
				)}
			</span>
			{count !== undefined && (
				<span className="shrink-0 font-mono text-ink-faint text-xs tabular-nums">
					{count}
				</span>
			)}
			{drills && (
				<Icon
					className="shrink-0 text-ink-faint"
					name="caret-right"
					size="sm"
				/>
			)}
		</button>
	);
}

/** Nearest first, or the order they came in with nothing to measure from. */
function byDistance<T>(
	items: readonly T[],
	at: (item: T) => LngLat,
	origin: LngLat | null,
): readonly T[] {
	if (!origin) return items;
	return [...items].sort(
		(a, b) => distanceMeters(origin, at(a)) - distanceMeters(origin, at(b)),
	);
}

function away(origin: LngLat | null, point: LngLat): string | undefined {
	return origin ? formatDistance(distanceMeters(origin, point)) : undefined;
}

function PinList({
	pins,
	onPick,
	testIdPrefix,
}: {
	readonly pins: readonly MapPin[];
	readonly onPick: (point: LngLat) => void;
	readonly testIdPrefix: string;
}) {
	if (pins.length === 0) return <Nothing />;
	return (
		<div className="flex flex-col gap-2">
			{pins.map((pin) => (
				<SourceRow
					hint={pin.note || undefined}
					key={pin.id}
					leading={
						<span
							aria-hidden
							className="size-3.5 shrink-0 rounded-full"
							style={{ backgroundColor: pin.color }}
						/>
					}
					onClick={() => onPick([pin.lng, pin.lat])}
					testId={`${testIdPrefix}-pin-${pin.id}`}
					title={pin.label || "Unnamed pin"}
				/>
			))}
		</div>
	);
}

function PlaceTypeList({
	types,
	places,
	onPick,
	testIdPrefix,
}: {
	readonly types: readonly PoiTypeId[];
	readonly places: readonly MapPoi[];
	readonly onPick: (type: PoiTypeId) => void;
	readonly testIdPrefix: string;
}) {
	const counts = new Map<PoiTypeId, number>();
	for (const place of places) {
		counts.set(place.kind, (counts.get(place.kind) ?? 0) + 1);
	}
	// Only types with somewhere to go: a row that opens an empty list is a row
	// that should not have been there.
	const shown = types.filter((type) => (counts.get(type) ?? 0) > 0);

	return (
		<div className="flex flex-col gap-2">
			{shown.map((type) => (
				<SourceRow
					count={counts.get(type)}
					drills
					key={type}
					leading={<PoiTypeGlyph type={type} />}
					onClick={() => onPick(type)}
					testId={`${testIdPrefix}-type-${type}`}
					title={poiTypeLabel(type)}
				/>
			))}
			{shown.length === 0 && <Nothing />}
		</div>
	);
}

function PlaceList({
	places,
	origin,
	onPick,
	testIdPrefix,
}: {
	readonly places: readonly MapPoi[];
	readonly origin: LngLat | null;
	readonly onPick: (point: LngLat) => void;
	readonly testIdPrefix: string;
}) {
	if (places.length === 0) return <Nothing />;
	return (
		<div className="flex flex-col gap-2">
			{places.map((place) => (
				<SourceRow
					hint={away(origin, [place.lng, place.lat])}
					key={place.id}
					leading={<PoiTypeGlyph type={place.kind} />}
					onClick={() => onPick([place.lng, place.lat])}
					testId={`${testIdPrefix}-place-${place.id}`}
					title={place.name || poiTypeSingular(place.kind)}
				/>
			))}
		</div>
	);
}

function matching<T>(
	items: readonly T[],
	query: string,
	name: (item: T) => string,
): readonly T[] {
	const needle = query.trim().toLowerCase();
	if (!needle) return items;
	return items.filter((item) => name(item).toLowerCase().includes(needle));
}

function Nothing() {
	return (
		<p className="px-1 py-2 text-ink-dim text-sm leading-snug">
			Nothing here to pick.
		</p>
	);
}
