import { useZero } from "@rocicorp/zero/react";
import { Surface } from "@zero-lag/ui/components/surface";
import { fadeOnly, listContainer, listItem } from "@zero-lag/ui/lib/motion";
import { cn } from "@zero-lag/ui/lib/utils";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useGameShell } from "../game/shell";
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

function ModeRow({ tally, on, onToggle }: ModeRowProps) {
	const reduced = useReducedMotion();
	const label = modeLabel(tally.modeId);

	return (
		<motion.label
			variants={reduced ? fadeOnly : listItem}
			className={cn(
				"flex min-h-tap-comfortable cursor-pointer items-center gap-3 rounded-control border border-hairline bg-surface px-3 py-2",
				"has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
				!on && "opacity-60",
			)}
			data-testid={`mode-${tally.modeId}`}
		>
			<span
				aria-hidden
				className={cn(
					"grid size-8 shrink-0 place-items-center rounded-[9px] font-bold text-sm",
					label.color ? "text-white" : "bg-hairline-strong text-ink",
				)}
				style={label.color ? { background: label.color } : undefined}
			>
				{label.badge}
			</span>
			<span className="min-w-0 flex-1">
				<span className="block font-semibold text-[0.9rem] leading-tight">
					{label.name}
				</span>
				<span className="eyebrow mt-0.5 block">
					{modeTallyText(tally.lines, tally.stops)}
				</span>
			</span>
			<input
				checked={on}
				className="peer sr-only"
				onChange={onToggle}
				type="checkbox"
			/>
			<span
				aria-hidden
				className={cn(
					"relative h-7 w-12 shrink-0 rounded-chip transition-colors duration-[--dur-tap]",
					on ? "bg-live/40" : "bg-hairline-strong",
					"after:absolute after:top-[3px] after:size-[1.375rem] after:rounded-full after:transition-[left,background]",
					"after:duration-[--dur-tap] after:ease-[--ease-pop]",
					on
						? "after:left-[1.3125rem] after:bg-live"
						: "after:left-[3px] after:bg-ink-dim",
				)}
			/>
		</motion.label>
	);
}
