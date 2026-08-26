import type { LngLat } from "@zero-lag/geo";
import { webPlatform } from "@zero-lag/platform/web";
import { ActionButton } from "@zero-lag/ui/components/action-button";
import { Field } from "@zero-lag/ui/components/field";
import { Icon } from "@zero-lag/ui/components/icon";
import { cn } from "@zero-lag/ui/lib/utils";
import { useRef, useState } from "react";
import { parsePastedCoordinates } from "./toolkit";

interface CoordinateFieldsProps {
	readonly point: LngLat | null;
	readonly onPoint: (point: LngLat) => void;
	readonly testIdPrefix: string;
	readonly focused?: boolean;
	readonly onFocus?: () => void;
}

/**
 * Latitude, longitude, and paste. A map tap writes the same point the fields
 * show; typing a valid pair writes it back.
 */
export function CoordinateFields({
	point,
	onPoint,
	testIdPrefix,
	focused = false,
	onFocus,
}: CoordinateFieldsProps) {
	const lastEmitted = useRef<LngLat | null>(point);
	const [latText, setLatText] = useState(point ? formatLat(point) : "");
	const [lngText, setLngText] = useState(point ? formatLng(point) : "");
	const fromMap =
		point != null &&
		(lastEmitted.current == null ||
			lastEmitted.current[0] !== point[0] ||
			lastEmitted.current[1] !== point[1]);
	if (fromMap) {
		lastEmitted.current = point;
		const nextLat = formatLat(point);
		const nextLng = formatLng(point);
		if (latText !== nextLat) setLatText(nextLat);
		if (lngText !== nextLng) setLngText(nextLng);
	} else if (!point && lastEmitted.current) {
		lastEmitted.current = null;
		if (latText) setLatText("");
		if (lngText) setLngText("");
	}

	const applyPoint = (next: LngLat) => {
		lastEmitted.current = next;
		setLatText(formatLat(next));
		setLngText(formatLng(next));
		onPoint(next);
	};

	const paste = () => {
		void webPlatform.clipboard.read().then((text) => {
			if (!text) return;
			const found = parsePastedCoordinates(text);
			if (!found) return;
			applyPoint(found.point);
		});
	};

	const onLatChange = (next: string) => {
		setLatText(next);
		const parsed = pointFromFields(next, lngText);
		if (!parsed) return;
		lastEmitted.current = parsed;
		onPoint(parsed);
	};

	const onLngChange = (next: string) => {
		setLngText(next);
		const parsed = pointFromFields(latText, next);
		if (!parsed) return;
		lastEmitted.current = parsed;
		onPoint(parsed);
	};

	return (
		<div
			className={cn(
				"flex items-stretch gap-2 rounded-tile",
				focused && "shadow-[0_0_0_3px_var(--ground),0_0_0_6px_var(--action)]",
			)}
			data-testid={`${testIdPrefix}-coordinates`}
			onPointerDown={onFocus}
		>
			<div className="min-w-0 flex-1">
				<Field
					data-testid={`${testIdPrefix}-lat`}
					inputMode="decimal"
					label="Latitude"
					onChange={(event) => onLatChange(event.target.value)}
					placeholder="52.52000"
					value={latText}
				/>
			</div>
			<div className="min-w-0 flex-1">
				<Field
					data-testid={`${testIdPrefix}-lng`}
					inputMode="decimal"
					label="Longitude"
					onChange={(event) => onLngChange(event.target.value)}
					placeholder="13.40500"
					value={lngText}
				/>
			</div>
			{webPlatform.clipboard.capability().available ? (
				<ActionButton
					aria-label="Paste coordinates"
					className="shrink-0 self-stretch [&_.zl-press-face]:h-full [&_.zl-press-face]:min-h-tap-primary [&_.zl-press-face]:w-tap-primary [&_.zl-press-face]:items-center [&_.zl-press-face]:justify-center [&_.zl-press-face]:px-0"
					data-testid={`${testIdPrefix}-paste`}
					inline
					onClick={paste}
					size="primary"
					tone="secondary"
					type="button"
				>
					<Icon name="clipboard" size="sm" />
				</ActionButton>
			) : null}
		</div>
	);
}

function formatLat(point: LngLat): string {
	return point[1].toFixed(5);
}

function formatLng(point: LngLat): string {
	return point[0].toFixed(5);
}

function pointFromFields(latText: string, lngText: string): LngLat | null {
	const lat = Number(latText);
	const lng = Number(lngText);
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
	if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
	return [lng, lat];
}
