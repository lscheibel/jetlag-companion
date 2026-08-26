import { useQuery, useZero } from "@rocicorp/zero/react";
import { mutators, queries } from "@zero-lag/schema";
import { ActionButton } from "@zero-lag/ui/components/action-button";
import {
	Screen,
	ScreenActions,
	ScreenBody,
	ScreenHeader,
} from "@zero-lag/ui/components/screen";
import { Surface } from "@zero-lag/ui/components/surface";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useGameShell } from "../game/shell";
import { LobbyProvider, useLobbyActions } from "../lobby/actions";
import { AreaThumbnail } from "../lobby/area-thumbnail";
import { markBriefingSeen } from "../lobby/briefing-seen";
import { useIsHost } from "../lobby/use-is-host";
import { useLobby } from "../lobby/use-lobby";
import { formatDuration, formatZone } from "../setup/game-size";

/**
 * What a player is agreeing to when they say they are ready: where the game is,
 * how long they get, and whatever the host wrote down.
 *
 * The host writes the house rules here — this is the screen that says them,
 * so it is also the screen that takes them. Everybody else reads. Reading is
 * the acknowledgement, and the button at the bottom is the only control they
 * have. If the host has written no rules the section is absent for everyone
 * else, and the briefing is the area alone.
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
	const zero = useZero();
	const { session } = useGameShell();
	const lobby = useLobby();
	const { setReady } = useLobbyActions();
	const amHost = useIsHost(session.playerId);
	const [games] = useQuery(queries.game());
	const [stops] = useQuery(queries.mapStops());
	const [rules] = useQuery(queries.houseRules());
	const [draft, setDraft] = useState<string | null>(null);

	const config = games[0]?.mapConfig ?? null;
	const inPlay = stops.filter((stop) => stop.insideArea).length;
	const saved = rules[0]?.text ?? "";
	const value = draft ?? saved;
	const dirty = draft !== null && draft !== saved;

	function saveRules(text: string) {
		zero.mutate(mutators.rules.update({ eventId: crypto.randomUUID(), text }));
		setDraft(null);
	}

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

				<HouseRules
					amHost={amHost}
					dirty={dirty}
					hostName={
						lobby.people.find((person) => person.isHost)?.displayName ??
						"the host"
					}
					onChange={setDraft}
					onSave={() => saveRules(value)}
					saved={saved}
					value={value}
				/>

				<div className="flex-1" />
			</ScreenBody>

			<ScreenActions note="All of this stays two taps away for the rest of the game.">
				<ActionButton
					beacon
					data-testid="mark-ready"
					onClick={() => {
						if (amHost && dirty) saveRules(value);
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

interface HouseRulesProps {
	amHost: boolean;
	dirty: boolean;
	hostName: string;
	onChange: (value: string) => void;
	onSave: () => void;
	saved: string;
	value: string;
}

function HouseRules({
	amHost,
	dirty,
	hostName,
	onChange,
	onSave,
	saved,
	value,
}: HouseRulesProps) {
	const lines = saved
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	if (!amHost && lines.length === 0) return null;

	return (
		<>
			<div className="flex items-center justify-between gap-3 px-1 pt-1">
				<span className="eyebrow">House rules</span>
				<span className="eyebrow">
					{amHost ? "Yours to write" : `Written by ${hostName}`}
				</span>
			</div>
			{amHost ? (
				<div className="flex flex-col gap-1.5">
					<textarea
						className="min-h-36 w-full rounded-tile border-2 border-hairline-strong bg-surface p-3 text-base text-ink transition-colors focus:border-action focus:outline-none"
						data-testid="rules-input"
						onChange={(event) => onChange(event.target.value)}
						placeholder={
							"No image searching station names.\nBuses count as transit."
						}
						value={value}
					/>
					<span className="px-1 text-ink-dim text-xs leading-snug">
						One rule a line. Everybody reads these before they say they are
						ready.
					</span>
					<ActionButton
						data-testid="save-rules"
						disabled={!dirty}
						onClick={onSave}
						size="compact"
						tone="secondary"
					>
						{dirty ? "Save rules" : "Saved"}
					</ActionButton>
				</div>
			) : (
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
			)}
		</>
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
