import { useZero } from "@rocicorp/zero/react";
import { Checkbox } from "@zero-lag/ui/components/checkbox";
import { Surface } from "@zero-lag/ui/components/surface";
import { fadeOnly, listContainer, listItem } from "@zero-lag/ui/lib/motion";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useGameShell } from "../game/shell";
import { ModeBadge } from "../setup/mode-badge";
import { modeLabel, modeTallyText } from "../setup/modes";
import { persistSetup } from "../setup/persist";
import { type ModeTally, useSetup } from "../setup/wizard";
import { WizardStep } from "../setup/wizard-step";

/**
 * What counts as transit. m4-spec §5.
 *
 * Everything is on until it is switched off, said once at the top so a screen
 * of switches does not read as a checklist to work through. Every row carries
 * its own weight in lines and stops, which is what makes turning the buses off
 * an informed decision rather than a guess — and the running total sits
 * directly above the button, where it answers the question the button asks.
 */
export default function SetupTransit() {
	const navigate = useNavigate();
	const location = useLocation();
	const zero = useZero();
	const { session } = useGameShell();
	const setup = useSetup();
	const { modes, selectedModes, stopsInPlay, toggleMode } = setup;
	const fromLobby =
		new URLSearchParams(location.search).get("from") === "lobby";
	const lobby = `/g/${session.code}`;
	const [busy, setBusy] = useState(false);
	const [problem, setProblem] = useState<string | null>(null);

	const on = (mode: ModeTally) =>
		selectedModes === null || selectedModes.includes(mode.modeId);

	function continueSetup() {
		if (!fromLobby) {
			void navigate(`/g/${session.code}/setup/size`);
			return;
		}
		setBusy(true);
		setProblem(null);
		void persistSetup(session, setup, zero)
			.then(() => navigate(lobby))
			.catch(() => {
				setProblem("Could not save. Check your signal and try again.");
				setBusy(false);
			});
	}

	return (
		<WizardStep
			busy={busy}
			continueLabel={fromLobby ? (busy ? "Saving…" : "Done") : "Continue"}
			continueTestId="setup-transit-continue"
			eyebrow={fromLobby ? "This game" : undefined}
			note={
				problem ? <span className="text-danger">{problem}</span> : undefined
			}
			onBack={() =>
				void navigate(fromLobby ? lobby : `/g/${session.code}/setup/area`)
			}
			onContinue={continueSetup}
			showRail={!fromLobby}
			step={2}
			title="What counts as transit?"
		>
			<p className="px-1 text-ink-dim text-xs leading-snug">
				Everything is in play unless you switch it off.
			</p>

			<motion.div
				animate="shown"
				className="flex flex-col gap-2"
				initial="hidden"
				variants={listContainer}
			>
				{modes.map((mode) => (
					<ModeRow
						key={mode.modeId}
						on={on(mode)}
						onToggle={() => toggleMode(mode.modeId)}
						tally={mode}
					/>
				))}
			</motion.div>

			{modes.length === 0 && (
				<p className="px-1 text-ink-dim text-sm">
					Counting what runs through the area…
				</p>
			)}

			<div className="flex-1" />

			<Surface
				className="flex items-center justify-between gap-3"
				data-testid="setup-stops-in-play"
			>
				<span className="eyebrow">In play</span>
				<span className="num font-medium text-lg">
					{stopsInPlay.toLocaleString("en")} stops
				</span>
			</Surface>
		</WizardStep>
	);
}

interface ModeRowProps {
	tally: ModeTally;
	on: boolean;
	onToggle: () => void;
}

/**
 * A checkbox, not a switch.
 *
 * A switch promises the change happens now; these modes are picked here and
 * applied at review, which is exactly the difference between the two controls.
 * The row still carries its own weight in lines and stops, because that is what
 * makes turning the buses off an informed decision rather than a guess.
 */
function ModeRow({ tally, on, onToggle }: ModeRowProps) {
	const reduced = useReducedMotion();
	const label = modeLabel(tally.modeId);

	return (
		<motion.div variants={reduced ? fadeOnly : listItem}>
			<Checkbox
				checked={on}
				hint={modeTallyText(tally.lines, tally.stops)}
				label={label.name}
				leading={<ModeBadge modeId={tally.modeId} />}
				onChange={onToggle}
				testId={`mode-${tally.modeId}`}
			/>
		</motion.div>
	);
}
