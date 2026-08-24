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
import { fadeOnly, listContainer, listItem } from "@zero-lag/ui/lib/motion";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { GameTabs } from "../game/game-tabs";
import { useGameShell } from "../game/shell";
import { useIsHost } from "../lobby/use-is-host";

/**
 * The house rules: whatever this group agreed on top of the game.
 *
 * A place rather than a step, so it sits on the tab bar next to the lobby and
 * the map — the whole point of a house rule is being able to check it at the
 * moment somebody argues about it, which is never a moment you can afford to
 * go looking.
 *
 * The host writes; everybody else reads. Read-only is not a lesser view: the
 * rules are one person's text, not a form, and reading them is the whole
 * interaction. m5-spec §4.
 */
export default function RulesRoute() {
	const reduced = useReducedMotion();
	const zero = useZero();
	const { session } = useGameShell();
	const amHost = useIsHost(session.playerId);
	const [rows] = useQuery(queries.houseRules());
	const [draft, setDraft] = useState<string | null>(null);

	const saved = rows[0]?.text ?? "";
	const value = draft ?? saved;
	const lines = saved
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	function save() {
		zero.mutate(
			mutators.rules.update({ eventId: crypto.randomUUID(), text: value }),
		);
		setDraft(null);
	}

	return (
		<Screen data-testid="rules-card">
			<ScreenHeader
				eyebrow={amHost ? "Yours to write" : "Written by the host"}
				title="House rules"
			/>

			<ScreenBody>
				{lines.length === 0 && !amHost && (
					<p
						className="text-ink-dim text-sm leading-snug"
						data-testid="rules-text"
					>
						No house rules. The game is the game.
					</p>
				)}

				{lines.length > 0 && (
					<Surface className="px-3.5 py-0" data-testid="rules-text">
						<motion.div
							animate="shown"
							initial="hidden"
							variants={listContainer}
						>
							{lines.map((line, index) => (
								<motion.div
									className="flex gap-2.5 border-hairline border-b py-2.5 last:border-b-0"
									key={line}
									variants={reduced ? fadeOnly : listItem}
								>
									<span className="num w-4 shrink-0 pt-0.5 text-right text-[0.65rem] text-ink-faint">
										{index + 1}
									</span>
									<span className="min-w-0 flex-1 text-[0.85rem] leading-snug">
										{line}
									</span>
								</motion.div>
							))}
						</motion.div>
					</Surface>
				)}

				{amHost && (
					<label className="flex flex-col gap-1.5">
						<span className="eyebrow px-1">
							{lines.length > 0 ? "Edit them" : "Write them"}
						</span>
						<textarea
							className="min-h-36 w-full rounded-tile border-2 border-hairline-strong bg-surface p-3 text-base text-ink transition-colors focus:border-action focus:outline-none"
							data-testid="rules-input"
							onChange={(event) => setDraft(event.target.value)}
							placeholder={
								"No image searching station names.\nBuses count as transit."
							}
							value={value}
						/>
						<span className="px-1 text-ink-dim text-xs leading-snug">
							One rule a line. Everybody reads these in the briefing before they
							say they are ready.
						</span>
					</label>
				)}

				<div className="flex-1" />
			</ScreenBody>

			{amHost && (
				<ScreenActions>
					<ActionButton
						beacon
						data-testid="save-rules"
						disabled={draft === null || draft === saved}
						onClick={save}
					>
						{draft === null || draft === saved ? "Saved" : "Save rules"}
					</ActionButton>
				</ScreenActions>
			)}

			<GameTabs code={session.code} />
		</Screen>
	);
}
