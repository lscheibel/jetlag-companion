import { ScreenHeader } from "@zero-lag/ui/components/screen";
import { cn } from "@zero-lag/ui/lib/utils";
import type { ReactNode } from "react";

/**
 * Who is here, what this game is called, and the two controls that belong to
 * the game rather than to anything on the screen: a way to hand it to somebody
 * standing next to you, and everything else.
 *
 * The join code is **not** in the header. It is something you give away once,
 * not a badge to wear for four hours — so it lives behind the share control,
 * with the QR first because that is how it actually gets used.
 */

interface LobbyHeaderProps {
	title: string;
	players: number;
	teams: number;
	onInvite?: () => void;
	onMenu?: () => void;
	/** Clock, readout — sits with the invite and menu controls. */
	status?: ReactNode;
}

export function LobbyHeader({
	title,
	players,
	teams,
	onInvite,
	onMenu,
	status,
}: LobbyHeaderProps) {
	return (
		<ScreenHeader
			eyebrow={`${count(players, "player")} · ${count(teams, "team")}`}
			title={title}
			trailing={
				<div className="flex shrink-0 items-center gap-1.5">
					{status}
					{onInvite && (
						<HeaderButton
							label="Ask people in"
							onClick={onInvite}
							testId="show-qr"
						>
							<svg
								aria-hidden="true"
								fill="none"
								height="19"
								stroke="currentColor"
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth="2"
								viewBox="0 0 24 24"
								width="19"
							>
								<title>Ask people in</title>
								<path d="M12 16V4" />
								<path d="M8 8l4-4 4 4" />
								<path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
							</svg>
						</HeaderButton>
					)}
					{onMenu && (
						<HeaderButton label="More" onClick={onMenu} testId="lobby-menu">
							<span aria-hidden className="pb-1 text-lg leading-none">
								⋯
							</span>
						</HeaderButton>
					)}
				</div>
			}
		/>
	);
}

interface HeaderButtonProps {
	children: ReactNode;
	label: string;
	onClick: () => void;
	testId: string;
}

function HeaderButton({ children, label, onClick, testId }: HeaderButtonProps) {
	return (
		<button
			aria-label={label}
			className={cn(
				"grid size-tap shrink-0 place-items-center rounded-control border border-hairline bg-surface",
				"transition-transform duration-[--dur-press] ease-[--ease-pop] hover:-translate-y-0.5 active:scale-90",
			)}
			data-testid={testId}
			onClick={onClick}
			type="button"
		>
			{children}
		</button>
	);
}

function count(value: number, noun: string): string {
	return `${value} ${noun}${value === 1 ? "" : "s"}`;
}
