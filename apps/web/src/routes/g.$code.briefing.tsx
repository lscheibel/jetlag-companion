import { useQuery } from "@rocicorp/zero/react";
import { queries } from "@zero-lag/schema";
import { ActionButton } from "@zero-lag/ui/components/action-button";
import {
	Screen,
	ScreenActions,
	ScreenBody,
	ScreenHeader,
} from "@zero-lag/ui/components/screen";
import { Surface } from "@zero-lag/ui/components/surface";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useGameShell } from "../game/shell";
import { LobbyProvider, useLobbyActions } from "../lobby/actions";
import { AreaThumbnail } from "../lobby/area-thumbnail";
import { markBriefingSeen } from "../lobby/briefing-seen";
import { useLobby } from "../lobby/use-lobby";
import { formatDuration, formatZone } from "../setup/game-size";

/**
 * What a player is agreeing to when they say they are ready: where the game is,
 * how long they get, and whatever the host wrote down.
 *
 * **Read-only.** The rules are the host's text, not a form — no checkboxes and
 * nothing to tick off. Reading them is the acknowledgement, and the button at
 * the bottom is the only control. If the host has written no rules the section
 * is absent and the briefing is the area alone.
 */
export default function BriefingRoute() {
	return (
		<LobbyProvider>
			<Briefing />
		</LobbyProvider>
	);
}

function Briefing() {
	const navigate = useNavigate();
	const { session } = useGameShell();
	const lobby = useLobby();
	const { setReady } = useLobbyActions();
	const [games] = useQuery(queries.game());
	const [stops] = useQuery(queries.mapStops());
	const [rules] = useQuery(queries.houseRules());

	const config = games[0]?.mapConfig ?? null;
	const inPlay = stops.filter((stop) => stop.insideArea).length;
	const lines = (rules[0]?.text ?? "")
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	/**
	 * Seeing it is what unlocks the ready control back on the lobby, so it is
	 * recorded on arrival rather than on the way out: a player who reads the
	 * briefing and then uses the phone's own back gesture has still read it.
	 */
	useEffect(() => {
		markBriefingSeen(session.gameId, session.playerId);
	}, [session.gameId, session.playerId]);

	return (
		<Screen data-testid="briefing">
			<ScreenHeader
				eyebrow="Before you say you are ready"
				onBack={() => void navigate(`/g/${session.code}`)}
				title="The briefing"
			/>

			<ScreenBody>
				<div className="overflow-hidden rounded-tile border border-hairline bg-surface">
					<AreaThumbnail
						area={config?.validHidingArea ?? null}
						className="block h-[104px] w-full"
					/>
					<dl className="grid grid-cols-2 gap-px bg-hairline">
						<Fact label="Where" value={config?.name ?? "—"} />
						<Fact
							label="In play"
							value={`${inPlay.toLocaleString("en")} stops`}
						/>
						<Fact
							label="Time to hide"
							value={
								lobby.round ? formatDuration(lobby.round.hidingDurationMs) : "—"
							}
						/>
						<Fact
							label="Hiding zone"
							value={config ? formatZone(config.hidingRadiusMeters) : "—"}
						/>
					</dl>
				</div>

				{lines.length > 0 && (
					<>
						<div className="flex items-center justify-between gap-3 px-1 pt-1">
							<span className="eyebrow">House rules</span>
							<span className="eyebrow">
								Written by{" "}
								{lobby.people.find((person) => person.isHost)?.displayName ??
									"the host"}
							</span>
						</div>
						<Surface className="px-3.5 py-0" data-testid="rules-text">
							{lines.map((line, index) => (
								<div
									className="flex gap-2.5 border-hairline border-b py-2.5 last:border-b-0"
									key={line}
								>
									<span className="num w-4 shrink-0 pt-0.5 text-right text-[0.65rem] text-ink-faint">
										{index + 1}
									</span>
									<span className="min-w-0 flex-1 text-[0.85rem] leading-snug">
										{line}
									</span>
								</div>
							))}
						</Surface>
					</>
				)}

				<div className="flex-1" />
			</ScreenBody>

			<ScreenActions note="All of this stays two taps away for the rest of the game.">
				<ActionButton
					beacon
					data-testid="mark-ready"
					onClick={() => {
						setReady(true);
						void navigate(`/g/${session.code}`);
					}}
					tone="primary"
				>
					I'm ready
				</ActionButton>
			</ScreenActions>
		</Screen>
	);
}

function Fact({ label, value }: { label: string; value: string }) {
	return (
		<div className="bg-surface px-3 py-2">
			<dt className="eyebrow">{label}</dt>
			<dd className="mt-0.5 font-semibold text-[0.82rem]">{value}</dd>
		</div>
	);
}
