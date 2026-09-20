import { ActionButton } from "@zero-lag/ui/components/action-button";
import { Icon } from "@zero-lag/ui/components/icon";
import {
	Screen,
	ScreenActions,
	ScreenBody,
	ScreenHeader,
} from "@zero-lag/ui/components/screen";
import { useEffect } from "react";
import { Navigate, useNavigate } from "react-router";
import { useGameShell } from "../game/shell";
import { AddressRow } from "../tracking/address-row";
import { ownTracksConfigUrl } from "../tracking/api";
import { StepRail } from "../tracking/step-rail";
import { TrackerGlyph } from "../tracking/tracker-glyph";
import { useTrackingWizard } from "../tracking/wizard";

/**
 * Step two: the address, and the one app that does not need it typed.
 * m15-spec §4, §6.
 *
 * **The token is issued here**, by the screen where having one changes what is
 * on it. The sheet this replaces issued it behind a button whose only visible
 * effect was more instructions, which is a tap that appears to do nothing.
 *
 * There is deliberately no QR code. A QR points *somebody else's* phone at
 * something, which is why the invite sheet has one; the phone being set up
 * here is the phone displaying the screen, and it cannot scan itself.
 */
export default function TrackingAddress() {
	const navigate = useNavigate();
	const { session } = useGameShell();
	const { app, state, ensureToken } = useTrackingWizard();

	// Synchronising with the server: this screen cannot show an address until a
	// row exists, and nothing else in the flow asks for one.
	useEffect(() => {
		if (state.kind === "off") ensureToken();
	}, [state.kind, ensureToken]);

	const toWaiting = () =>
		void navigate(`/g/${session.code}/tracking/waiting`, { replace: true });

	// Deep-linked, or opened after the catalogue dropped the app this phone
	// remembered. Either way the question before this one is unanswered.
	if (!app) return <Navigate replace to={`/g/${session.code}/tracking/app`} />;

	const token = state.kind === "on" ? state.identity.token : null;
	const isOwnTracks = app.id === "owntracks";
	const isTraccar = app.id === "traccar";

	return (
		<Screen data-testid="tracking-address-step">
			<ScreenHeader
				eyebrow="Background tracking"
				onBack={() => void navigate(`/g/${session.code}/tracking/app`)}
				title={`Point ${app.name} here`}
			/>
			<StepRail step={1} />
			<ScreenBody>
				<p className="text-ink-dim text-sm leading-snug">
					{isOwnTracks
						? "One tap sets all of it — the address, a name for this phone, and the mode that posts without an account. Paste it yourself instead if you would rather see what it does."
						: isTraccar
							? "Point it at this address. GET, a form post, or JSON all work, as long as the request carries a latitude and a longitude."
							: `Open ${app.name} and put this in its settings. It keeps sending while that app runs, whatever this page is doing.`}
				</p>

				{token === null ? (
					<p
						className="rounded-tile bg-surface-sunken p-3 text-ink-dim text-sm"
						data-testid="tracking-address-pending"
					>
						{state.kind === "failed"
							? "Could not reach the server, so there is no link yet. Your position is still being shared while this page is open."
							: "Making a link for this phone…"}
					</p>
				) : (
					<AddressRow app={app} token={token} />
				)}

				{app.install && (
					<a
						className="flex min-h-tap items-center gap-2.5 rounded-control border border-hairline bg-surface px-3 text-sm"
						data-testid="tracking-install"
						href={app.install}
						rel="noreferrer"
						target="_blank"
					>
						<TrackerGlyph app={app} size="sm" />
						{app.installLabel}
						<Icon
							className="ml-auto text-ink-faint"
							name="caret-right"
							size="sm"
						/>
					</a>
				)}
			</ScreenBody>

			<ScreenActions>
				{isOwnTracks && (
					<ActionButton
						beacon
						data-testid="tracking-owntracks"
						disabled={token === null}
						hint="one tap · nothing to paste"
						onClick={() => {
							if (token === null) return;
							/*
							 * Not in-app navigation: a custom scheme, handed to the OS so
							 * OwnTracks can read its whole configuration out of it. The
							 * router has nothing to do with where this goes.
							 */
							window.location.href = ownTracksConfigUrl(
								token,
								session.playerId,
							);
							// Land on the listening screen, so coming back from OwnTracks
							// lands on the answer rather than on the instructions.
							toWaiting();
						}}
					>
						Open in OwnTracks
					</ActionButton>
				)}
				<ActionButton
					beacon={!isOwnTracks}
					data-testid="tracking-pasted"
					disabled={token === null}
					onClick={toWaiting}
					tone={isOwnTracks ? "secondary" : "primary"}
				>
					I have pasted it
				</ActionButton>
			</ScreenActions>
		</Screen>
	);
}
