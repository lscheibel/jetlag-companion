import { Chip } from "@zero-lag/ui/components/chip";
import { fadeOnly, listItem } from "@zero-lag/ui/lib/motion";
import { cn } from "@zero-lag/ui/lib/utils";
import { motion, useReducedMotion } from "motion/react";
import type { LobbyPerson } from "./model";

/**
 * One person in the lobby, under the team they are on.
 *
 * The row is a fact, not a toolbar. Tapping it opens the person — that is
 * where a name is changed, and where a host moves or removes. The host hat
 * itself is in the game menu; the badge here is only a label.
 *
 * Presence carries every player in the game, always — what it withholds is
 * where they are. m1-spec §9.
 */

interface PersonRowProps {
	person: LobbyPerson;
	isMe: boolean;
	/** Not on a team, which is the one thing here that holds up a start. */
	loose?: boolean;
	removed?: boolean;
	onOpen: () => void;
}

export function PersonRow({
	person,
	isMe,
	loose = false,
	removed = false,
	onOpen,
}: PersonRowProps) {
	const reduced = useReducedMotion();

	return (
		<motion.button
			className={cn(
				"flex min-h-tap w-full items-center gap-2 rounded-control border bg-surface px-2.5 py-1 text-left",
				"transition-transform duration-[--dur-press] ease-[--ease-pop] active:scale-[0.99]",
				loose ? "border-stale/50 bg-stale/[0.08]" : "border-hairline",
				removed && "opacity-60",
				isMe && !loose && "border-action/35",
			)}
			data-testid={`player-${person.displayName}`}
			onClick={onOpen}
			type="button"
			variants={reduced ? fadeOnly : listItem}
		>
			{/* Never colour alone: the dot is decoration and the word is the fact. */}
			<span
				aria-hidden
				className={cn(
					"size-1.5 shrink-0 rounded-full",
					person.online ? "zl-breathe bg-live" : "bg-ink-faint",
				)}
			/>
			<span className="sr-only" data-testid={`online-${person.displayName}`}>
				{person.online ? "online" : "offline"}
			</span>

			<span className="min-w-0 flex-1 truncate text-sm">
				{person.displayName}
				{isMe ? " (you)" : ""}
			</span>

			{person.isHost && (
				<Chip data-testid={`host-badge-${person.displayName}`}>Host</Chip>
			)}
			{person.readyAt !== null && !removed && (
				<span
					className="zl-pop grid size-5 shrink-0 place-items-center rounded-[6px] bg-live font-bold text-[#04180e] text-[0.65rem]"
					data-testid={`ready-${person.displayName}`}
				>
					✓
				</span>
			)}
			<span
				className="sr-only"
				data-testid={`ready-state-${person.displayName}`}
			>
				{person.readyAt === null ? "waiting" : "ready"}
			</span>
			{removed && (
				<span className="eyebrow" data-testid={`removed-${person.displayName}`}>
					Removed
				</span>
			)}
			<span aria-hidden className="text-ink-faint text-sm">
				›
			</span>
		</motion.button>
	);
}
