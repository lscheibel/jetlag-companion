import { ActionButton } from "@zero-lag/ui/components/action-button";
import { Icon } from "@zero-lag/ui/components/icon";
import {
	Screen,
	ScreenActions,
	ScreenBody,
	ScreenHeader,
} from "@zero-lag/ui/components/screen";
import { cn } from "@zero-lag/ui/lib/utils";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { useGameShell } from "../game/shell";
import { trackerAgeLabel, trackerIsReporting } from "../map/position-source";
import { StepRail } from "../tracking/step-rail";
import { useCountingAge } from "../tracking/use-counting-age";
import { useTrackingWizard } from "../tracking/wizard";

/**
 * Step three: whether it worked. m15-spec §6.
 *
 * Every part of the actual configuration happens in another app, so this is
 * the only place a player finds out that it took — and that is the difference
 * between a feature people trust and a URL they hope about. It gets a whole
 * screen for that reason, and it resolves itself: nothing here is a button, a
 * refresh or a claim. The poll behind it is `useTracking`'s, running for as
 * long as the flow is open.
 *
 * What counts as arrival is a **fresh** ping, not any ping: this device may
 * already carry a token that was last heard from two hours ago, and greeting
 * that with "it's working" would be a claim about the present made out of the
 * past. Once one does land the screen latches, so a tracker on a five-minute
 * interval cannot un-answer the question while somebody is reading it. A
 * tracker that goes quiet later is the standing screen's business.
 */
export default function TrackingWaiting() {
	const navigate = useNavigate();
	const { session } = useGameShell();
	const { app, state, readAt } = useTrackingWizard();

	const identity = state.kind === "on" ? state.identity : null;
	const ageMs = useCountingAge(identity?.lastSeenAgeMs ?? null, readAt, true);
	// A latch, adjusted during render rather than in an effect: the question
	// this screen asks is answered once, and re-asking it every second would
	// let a tracker's own reporting interval take the answer back.
	const [arrived, setArrived] = useState(false);
	if (!arrived && trackerIsReporting(ageMs)) setArrived(true);

	/**
	 * No token means nothing can be pinging us, which puts the player one screen
	 * back rather than in front of a beacon that will never resolve.
	 *
	 * Only once the first read has landed, though: `loading` is not an answer,
	 * and treating it as one would bounce anybody who reloads this screen — or
	 * follows a link to it — straight back to step one while their token was
	 * still on its way.
	 */
	if (state.kind !== "loading" && (identity === null || app === null)) {
		return <Navigate replace to={`/g/${session.code}/tracking/app`} />;
	}

	const toMap = () => void navigate(`/g/${session.code}/map`);

	return (
		<Screen data-testid="tracking-waiting-step">
			<ScreenHeader
				eyebrow="Background tracking"
				onBack={() => void navigate(`/g/${session.code}/tracking/address`)}
				title={app?.name ?? "Background tracking"}
			/>
			<StepRail step={2} />

			<ScreenBody className="justify-center">
				<div className="flex flex-col items-center gap-4 pb-6 text-center">
					{/* The gap under the beacon clears the widest ring rather than the
					    box it is drawn in: the rings expand past their container, and a
					    loop breathing into a heading reads as part of the sentence
					    rather than as the thing being watched. */}
					<div className="mb-8">
						<Beacon arrived={arrived} />
					</div>

					<h2 className="text-2xl" data-testid="tracking-status">
						{arrived ? "It's working" : "Waiting for the first ping"}
					</h2>

					{arrived && ageMs !== null && (
						<p className="num text-live text-sm" data-testid="tracking-age">
							last ping {trackerAgeLabel(ageMs)}
						</p>
					)}

					<p className="max-w-[28ch] text-ink-dim text-sm leading-snug">
						{arrived
							? "Your team can see you with the screen locked. Turn it off whenever you like, from the locate control."
							: `Finish in ${app?.name ?? "your tracker app"} and it lands here by itself. You can leave — it keeps listening either way.`}
					</p>

					{!arrived && (
						<ActionButton
							data-testid="tracking-back-to-address"
							inline
							onClick={() =>
								void navigate(`/g/${session.code}/tracking/address`)
							}
							size="compact"
							tone="quiet"
						>
							Back to the address
						</ActionButton>
					)}
				</div>
			</ScreenBody>

			<ScreenActions>
				<ActionButton
					beacon={arrived}
					data-testid="tracking-done"
					onClick={toMap}
					tone={arrived ? "primary" : "secondary"}
				>
					{arrived ? "Done" : "Do this later"}
				</ActionButton>
			</ScreenActions>
		</Screen>
	);
}

/**
 * Listening, then landed.
 *
 * Three rings on the same loop a third of a cycle apart, which reads as
 * something reaching outward rather than as a spinner — a spinner would be a
 * claim that this page is doing the work, and it is not. The arrival is a pop
 * rather than a cross-fade because it is the one moment in this flow worth
 * noticing, and the blanket reduced-motion guard turns both off.
 */
function Beacon({ arrived }: { arrived: boolean }) {
	return (
		<div className="relative grid size-20 place-items-center">
			{!arrived &&
				[0, 1, 2].map((ring) => (
					<span
						aria-hidden
						className="zl-pulse-ring absolute inset-0 rounded-full border-2 border-stale"
						key={ring}
						style={{ animationDelay: `${ring * 1066}ms` }}
					/>
				))}
			<span
				className={cn(
					"grid place-items-center rounded-full transition-colors",
					arrived
						? "zl-pop size-14 bg-live text-white"
						: "size-12 border border-hairline bg-surface text-stale",
				)}
			>
				<Icon name={arrived ? "check" : "broadcast"} size="lg" />
			</span>
		</div>
	);
}
