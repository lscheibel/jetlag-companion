import type { LocationIssue } from "@zero-lag/platform";
import type { PositionSnapshot } from "@zero-lag/schema";
import { ActionButton } from "@zero-lag/ui/components/action-button";
import { Sheet } from "@zero-lag/ui/components/sheet";
import { useCountingAge } from "../tracking/use-counting-age";
import { type Camera, cameraLabel } from "./camera";
import {
	positionSourceCopy,
	positionSourceOf,
	trackerAgeLabel,
	trackerIsReporting,
} from "./position-source";
import { formatAccuracy, relativeAge } from "./staleness";
import { formatCoordinates } from "./toolkit";

/**
 * What the locate control opens. m15-spec §6.
 *
 * The control used to do one thing with a fix and a different thing without
 * one, which meant the only screen explaining *why* there was no position was
 * the screen you could not reach once there was. This is the one place that
 * answers "where is this phone, and who can see it" in both cases — and it is
 * where background tracking is set up, because that is the same question asked
 * about the next ten minutes rather than about now.
 *
 * The camera cycle is the sheet's primary action rather than the control's own
 * behaviour, which costs a tap on the map's most-used button. That is a real
 * price and it buys a real thing: the two sources can fail independently, and
 * a player who cannot tell which one failed cannot fix either.
 */

interface PositionSheetProps {
	readonly open: boolean;
	readonly onClose: () => void;
	readonly fix: PositionSnapshot | null;
	readonly issue: LocationIssue | null;
	readonly camera: Camera;
	readonly onCycleCamera: () => void;
	readonly onBackgroundTracking: () => void;
	/** Server-measured at the last read; the sheet counts up from it locally. */
	readonly trackerAgeMs: number | null;
	readonly trackerReadAt: number;
	/** A token exists, whether or not anything has ever used it. */
	readonly trackerConfigured: boolean;
}

export function PositionSheet({
	open,
	onClose,
	fix,
	issue,
	camera,
	onCycleCamera,
	onBackgroundTracking,
	trackerAgeMs,
	trackerReadAt,
	trackerConfigured,
}: PositionSheetProps) {
	const hasBrowserFix = Boolean(fix && fix.source !== "unavailable");
	const trackerAgeNow = useCountingAge(trackerAgeMs, trackerReadAt, open);
	const source = positionSourceOf({
		hasBrowserFix,
		trackerAgeMs: trackerAgeNow,
	});
	const copy = positionSourceCopy(source);

	return (
		<Sheet
			/*
			 * The camera cycle goes in the sheet's pinned slot rather than in the
			 * body. It is the one thing here that *does* something to the map, and
			 * the body above it is all explanation — which on a small screen can be
			 * long enough to push a button in the flow below the fold.
			 */
			actions={
				<ActionButton
					data-testid="position-recenter"
					disabled={!hasBrowserFix}
					onClick={() => {
						onCycleCamera();
						onClose();
					}}
				>
					{cameraLabel(camera)}
				</ActionButton>
			}
			onClose={onClose}
			open={open}
			testId="position-sheet"
			title="Your position"
		>
			<p className="font-semibold text-sm" data-testid="position-source">
				{copy.title}
			</p>
			<p className="mt-1 text-ink-dim text-sm leading-snug">{copy.detail}</p>

			<dl className="mt-5 flex flex-col gap-3">
				<SourceRow
					detail={<BrowserDetail fix={fix} issue={issue} />}
					label="This browser"
					on={hasBrowserFix}
				/>
				<SourceRow
					detail={
						<TrackerDetail
							ageMs={trackerAgeNow}
							configured={trackerConfigured}
						/>
					}
					label="Tracker app"
					on={trackerIsReporting(trackerAgeNow)}
				/>
			</dl>

			{!hasBrowserFix && <BrowserAdvice issue={issue} />}

			<ActionButton
				className="mt-6 w-full"
				data-testid="position-tracking"
				onClick={onBackgroundTracking}
				tone="secondary"
			>
				{trackerConfigured
					? "Background tracking"
					: "Set up background tracking"}
			</ActionButton>
		</Sheet>
	);
}

function SourceRow({
	label,
	detail,
	on,
}: {
	label: string;
	detail: React.ReactNode;
	on: boolean;
}) {
	return (
		<div className="flex items-baseline justify-between gap-3">
			<dt className="flex items-baseline gap-2 text-sm">
				<span className={on ? "text-live" : "text-ink-faint"}>●</span>
				{label}
			</dt>
			<dd className="text-right text-ink-dim text-sm">{detail}</dd>
		</div>
	);
}

function BrowserDetail({
	fix,
	issue,
}: {
	fix: PositionSnapshot | null;
	issue: LocationIssue | null;
}) {
	if (!fix || fix.source === "unavailable") {
		if (issue === "denied") return "Blocked";
		if (issue === "insecure_context") return "Needs https";
		if (issue === "unsupported") return "Unsupported";
		return "No fix yet";
	}

	const accuracy = formatAccuracy(fix.accuracyMeters);
	return (
		<span data-testid="position-coordinates">
			{formatCoordinates([fix.lng, fix.lat])}
			{accuracy === null ? null : ` · ${accuracy}`}
		</span>
	);
}

function TrackerDetail({
	ageMs,
	configured,
}: {
	ageMs: number | null;
	configured: boolean;
}) {
	if (ageMs === null) return configured ? "No pings yet" : "Not set up";
	if (!trackerIsReporting(ageMs)) return `Silent · ${relativeAge(ageMs)}`;
	return trackerAgeLabel(ageMs);
}

/**
 * The old `GpsHelpSheet`, kept whole and moved here.
 *
 * It was previously the *alternative* to this control doing anything, which
 * meant it appeared only when the map had nothing to show and vanished the
 * moment a fix arrived. As a section it can sit under the state it explains.
 */
function BrowserAdvice({ issue }: { issue: LocationIssue | null }) {
	const lead =
		issue === "denied"
			? "Location is blocked for this page."
			: issue === "insecure_context"
				? "Location needs a secure page (https)."
				: issue === "unsupported"
					? "This browser cannot read a location."
					: "No fix yet — the phone has not seen satellites.";

	const advice =
		issue === "denied"
			? "In the browser or system settings, allow location for this site, then come back and tap locate again. A denial is remembered until you change it."
			: issue === "insecure_context" || issue === "unsupported"
				? "Open the game over https on a phone that has a GPS, rather than a plain http address or a desktop without a receiver."
				: "Stand near a window or go outside and wait a few seconds. Indoors, a first fix can take a while even when permission is already granted.";

	return (
		<div className="mt-5 rounded-tile bg-surface-sunken p-3">
			<p className="text-sm leading-snug" data-testid="position-advice">
				{lead}
			</p>
			<p className="mt-1 text-ink-dim text-sm leading-snug">{advice}</p>
		</div>
	);
}
