import { useQuery, useZero } from "@rocicorp/zero/react";
import { queries } from "@zero-lag/schema";
import { Surface } from "@zero-lag/ui/components/surface";
import { type ReactNode, useState } from "react";
import { useNavigate } from "react-router";
import { useGameShell } from "../game/shell";
import { formatDuration, formatGround, formatZone } from "../setup/game-size";
import { modeLabel } from "../setup/modes";
import { persistSetup } from "../setup/persist";
import { useSetup } from "../setup/wizard";
import { WizardStep } from "../setup/wizard-step";

/**
 * One last look. The rail names this as the fifth step, every line jumps
 * back to the screen that set it, and the button says what actually happens.
 *
 * This is also the only screen in the flow that writes anything, and it writes
 * only what changed: a host who pressed straight through has agreed to the
 * board the game already opened on, and rebuilding it identically would burn a
 * map application and an event to say nothing.
 */
export default function SetupReview() {
	const navigate = useNavigate();
	const zero = useZero();
	const { session } = useGameShell();
	const setup = useSetup();
	const [players] = useQuery(queries.players());
	const [busy, setBusy] = useState(false);
	const [problem, setProblem] = useState<string | null>(null);

	const me = players.find((player) => player.id === session.playerId);
	const step = (path: string) => () =>
		void navigate(`/g/${session.code}/setup/${path}`);

	function open() {
		setBusy(true);
		setProblem(null);
		void (async () => {
			try {
				await persistSetup(session, setup, zero);
				await navigate(`/g/${session.code}`);
			} catch (cause) {
				setProblem(
					cause instanceof Error && cause.message === "empty_area"
						? "That area has nothing in it. Pick somewhere else."
						: "Could not set the game up. Check your signal and try again.",
				);
				setBusy(false);
			}
		})();
	}

	// Nothing in this flow means anything until the board has synced: the
	// counts, the suggestion and every "did this change?" below are read off
	// it. Opening the lobby before then would quietly drop what the host chose.
	const ready = setup.area !== null;

	return (
		<WizardStep
			busy={busy || !ready}
			continueLabel={busy ? "Opening…" : "Open the lobby"}
			continueTestId="setup-open-lobby"
			note={
				problem ? (
					<span className="text-danger" data-testid="setup-error">
						{problem}
					</span>
				) : ready ? (
					"Nothing here is locked in. You can change all of it while people are still arriving."
				) : (
					"Reading the board this game opened on…"
				)
			}
			onBack={() => void navigate(`/g/${session.code}/setup/size`)}
			onContinue={open}
			step={4}
			title="Everything set?"
		>
			<Surface className="px-3.5 py-0" data-testid="setup-review">
				<Row
					detail={me?.displayName ? "Running the game" : undefined}
					label="You"
					onChange={step("name")}
					value={me?.displayName ?? "…"}
				/>
				<Row
					detail={setup.area ? formatGround(setup.area.squareKm) : undefined}
					label="Area"
					onChange={step("area")}
					value={setup.area?.name ?? "…"}
				/>
				<Row
					detail={`${setup.stopsInPlay.toLocaleString("en")} stops in play`}
					label="Transit"
					onChange={step("transit")}
					value={transitSummary(setup)}
				/>
				<Row
					detail={`${formatDuration(setup.hidingDurationMs)} to hide · ${formatZone(setup.hidingRadiusMeters)} zones`}
					label="Size"
					onChange={step("size")}
					value={`${setup.band.name} · ${setup.band.runsFor.toLowerCase()}`}
				/>
			</Surface>
		</WizardStep>
	);
}

function transitSummary(setup: ReturnType<typeof useSetup>): string {
	const selected = setup.selectedModes;
	if (!selected) return "Everything that runs here";
	return selected.map((modeId) => modeLabel(modeId).name).join(", ");
}

interface RowProps {
	label: string;
	value: ReactNode;
	detail?: ReactNode;
	onChange: () => void;
}

function Row({ label, value, detail, onChange }: RowProps) {
	return (
		<div className="flex items-center gap-3 border-hairline border-b py-3 last:border-b-0">
			<div className="min-w-0 flex-1">
				<div className="eyebrow">{label}</div>
				<div className="mt-0.5 font-semibold text-[0.9rem] leading-tight">
					{value}
				</div>
				{detail && (
					<div className="mt-0.5 text-ink-dim text-xs leading-snug">
						{detail}
					</div>
				)}
			</div>
			<button
				className="grid min-h-tap shrink-0 place-items-center rounded-control border border-hairline px-3 font-mono text-[0.6rem] text-ink-dim uppercase tracking-[0.08em]"
				data-testid={`change-${label.toLowerCase()}`}
				onClick={onChange}
				type="button"
			>
				Change
			</button>
		</div>
	);
}
