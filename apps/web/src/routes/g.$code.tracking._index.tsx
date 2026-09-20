import { ActionButton } from "@zero-lag/ui/components/action-button";
import { Icon } from "@zero-lag/ui/components/icon";
import { IconButton } from "@zero-lag/ui/components/icon-button";
import {
	Screen,
	ScreenActions,
	ScreenBody,
	ScreenHeader,
} from "@zero-lag/ui/components/screen";
import { Sheet } from "@zero-lag/ui/components/sheet";
import { cn } from "@zero-lag/ui/lib/utils";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { useGameShell } from "../game/shell";
import { trackerAgeLabel, trackerIsReporting } from "../map/position-source";
import { relativeAge } from "../map/staleness";
import { AddressRow } from "../tracking/address-row";
import type { TrackerApp } from "../tracking/api";
import { TrackerGlyph } from "../tracking/tracker-glyph";
import { useCountingAge } from "../tracking/use-counting-age";
import { useTrackingWizard } from "../tracking/wizard";

/**
 * What a player who has already done this comes back to. m15-spec §6.
 *
 * The flow's three screens answer "set this up". This answers the much smaller
 * question they have an hour later — *is it still working* — and it is a
 * separate screen because landing somebody who set this up at lunchtime on
 * "which app do you use?" would be absurd.
 *
 * It keeps the address, so re-copying costs nothing and does not mean walking
 * back through the flow. Turning tracking off is behind the `⋯`, in a sheet
 * with a red button, which is the shape the lobby settled for leaving a game:
 * it revokes a URL already pasted into another app, and that does not belong
 * one tone away from the control next to it.
 */
export default function TrackingStatus() {
	const navigate = useNavigate();
	const { session } = useGameShell();
	const { state, readAt, app, disable, busy } = useTrackingWizard();
	const [menuOpen, setMenuOpen] = useState(false);
	/**
	 * Set by the turn-off button, and read by the redirect below.
	 *
	 * Revoking makes this screen's own state `off`, which is the state that
	 * sends a player to step one — and the navigation to the map is still
	 * waiting on that route's chunk when the revoke lands, so without this the
	 * redirect wins and turning tracking off drops you into setting it up.
	 */
	const [turningOff, setTurningOff] = useState(false);

	const identity = state.kind === "on" ? state.identity : null;
	const ageMs = useCountingAge(identity?.lastSeenAgeMs ?? null, readAt, true);

	const toMap = () => void navigate(`/g/${session.code}/map`);

	// Nothing has ever been issued for this phone, so there is nothing to report
	// on: this is a first-timer who reached the flow's front door. Somebody on
	// their way out through the menu is not that.
	if (state.kind === "off" && !turningOff) {
		return <Navigate replace to={`/g/${session.code}/tracking/app`} />;
	}

	return (
		<Screen data-testid="tracking-status-screen">
			<ScreenHeader
				eyebrow="This phone"
				onBack={toMap}
				title="Background tracking"
				trailing={
					identity && (
						<IconButton
							aria-label="More"
							data-testid="tracking-menu"
							onClick={() => setMenuOpen(true)}
						>
							<Icon name="dots-three" size="sm" />
						</IconButton>
					)
				}
			/>

			<ScreenBody>
				{state.kind === "loading" && (
					<p className="text-ink-dim text-sm">Checking…</p>
				)}

				{state.kind === "failed" && (
					<p
						className="text-danger text-sm leading-snug"
						data-testid="tracking-failed"
					>
						Could not reach the server. Your position is still being shared
						while this page is open.
					</p>
				)}

				{identity && (
					<>
						<StatusCard ageMs={ageMs} app={app} />

						{app ? (
							<div className="flex items-center gap-3 rounded-control border border-hairline bg-surface py-2 pr-2 pl-3">
								<TrackerGlyph app={app} className="text-ink-dim" size="sm" />
								<span className="flex-1 font-semibold text-sm">{app.name}</span>
								<ActionButton
									data-testid="tracking-change-app"
									inline
									onClick={() =>
										void navigate(`/g/${session.code}/tracking/app`)
									}
									size="compact"
									tone="quiet"
								>
									Change
								</ActionButton>
							</div>
						) : (
							<ActionButton
								onClick={() => void navigate(`/g/${session.code}/tracking/app`)}
								tone="secondary"
							>
								Pick a tracker app
							</ActionButton>
						)}

						{app && <AddressRow app={app} token={identity.token} />}
					</>
				)}
			</ScreenBody>

			<ScreenActions>
				<ActionButton data-testid="tracking-done" onClick={toMap}>
					Done
				</ActionButton>
			</ScreenActions>

			<Sheet
				onClose={() => setMenuOpen(false)}
				open={menuOpen}
				testId="tracking-menu-sheet"
				title="Turn off background tracking?"
			>
				<p className="text-ink-dim text-sm leading-snug">
					The link stops working on the next ping, so the app you set up will be
					told it was turned off rather than left guessing. Your position is
					still shared while this page is open, and setting it up again means a
					new link to paste.
				</p>
				<ActionButton
					className="mt-5"
					data-testid="tracking-disable"
					disabled={busy}
					onClick={() => {
						setTurningOff(true);
						disable();
						toMap();
					}}
					tone="danger"
				>
					Turn it off
				</ActionButton>
			</Sheet>
		</Screen>
	);
}

/**
 * The one thing a returning player came for, at the top and at the size of the
 * question. It used to be a grey 12px line between a paragraph and a picker.
 */
function StatusCard({
	ageMs,
	app,
}: {
	ageMs: number | null;
	app: TrackerApp | null;
}) {
	const reporting = trackerIsReporting(ageMs);
	const everPinged = ageMs !== null;

	return (
		<div className="flex flex-col gap-1 rounded-tile border border-hairline bg-surface p-4">
			<div className="flex items-center gap-2.5">
				<span
					className={cn(
						"size-2.5 rounded-full",
						reporting
							? "zl-breathe bg-live"
							: everPinged
								? "bg-stale"
								: "bg-ink-faint",
					)}
				/>
				<h2 className="text-xl" data-testid="tracking-status">
					{reporting ? "Reporting" : everPinged ? "Silent" : "Waiting"}
				</h2>
			</div>

			{ageMs !== null && (
				<p className="num text-ink-dim text-xs" data-testid="tracking-age">
					last ping {reporting ? trackerAgeLabel(ageMs) : relativeAge(ageMs)}
				</p>
			)}

			<p className="mt-1 text-ink-dim text-sm leading-snug">
				{reporting
					? "Your phone is reporting on its own. Locking the screen changes nothing."
					: everPinged
						? `Nothing has arrived in a while. ${app ? app.name : "The tracker app"} may have been stopped by the phone, or its battery saver got to it.`
						: `No ping has arrived yet. Finish setup in ${app ? app.name : "your tracker app"} and it lands here by itself.`}
			</p>
		</div>
	);
}
