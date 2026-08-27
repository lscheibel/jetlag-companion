import { Chip } from "@zero-lag/ui/components/chip";
import { Icon } from "@zero-lag/ui/components/icon";
import { fadeOnly, listItem } from "@zero-lag/ui/lib/motion";
import { cn } from "@zero-lag/ui/lib/utils";
import { motion, useReducedMotion } from "motion/react";
import type { LobbyPerson } from "./model";

/**
 * One person in the lobby, under the team they are on.
 *
 * The row is a fact, not a toolbar. Tapping it opens the person — that is
 * where a name is changed, and where a host moves or removes. Stepping down
 * from host is on your own sheet; claiming it is still in the game menu. The
 * badge here is only a label.
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
	/** Ready ticks belong to the lobby before the whistle, not once a round is on. */
	showReady?: boolean;
	onOpen: () => void;
}

export function PersonRow({
	person,
	isMe,
	loose = false,
	removed = false,
	showReady = true,
	onOpen,
}: PersonRowProps) {
	const reduced = useReducedMotion();
	const ready = showReady && person.readyAt !== null && !removed;

	return (
		<motion.button
			className={cn(
				"flex min-h-tap-comfortable w-full items-center gap-2.5 rounded-tile border px-3.5 py-2.5 text-left",
				"transition-transform duration-[--dur-press] ease-[--ease-pop] active:scale-[0.99]",
				removed && "opacity-60",
				ready
					? "border-live/40 bg-live/15"
					: loose
						? "border-stale/50 bg-stale/[0.08]"
						: "border-hairline bg-surface",
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

			<span className="min-w-0 flex-1 truncate text-[0.95rem]">
				{person.displayName}
				{isMe ? " (you)" : ""}
			</span>

			{person.isHost && (
				<Chip data-testid={`host-badge-${person.displayName}`}>Host</Chip>
			)}
			{ready && (
				<span
					className="zl-pop grid size-5 shrink-0 place-items-center rounded-[6px] bg-live text-action-ink"
					data-testid={`ready-${person.displayName}`}
				>
					<Icon name="check" size="xs" weight="bold" />
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
		</motion.button>
	);
}
