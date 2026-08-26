import { Chip } from "@zero-lag/ui/components/chip";
import { Door } from "@zero-lag/ui/components/door";
import { Icon } from "@zero-lag/ui/components/icon";
import { Screen, ScreenBody } from "@zero-lag/ui/components/screen";
import { ThemeToggle } from "@zero-lag/ui/components/theme";
import { cn } from "@zero-lag/ui/lib/utils";
import { useState } from "react";
import { useNavigate } from "react-router";
import { SceneMenu } from "../debug/scene-menu";
import { loadSession } from "../session";
import { Wordmark } from "../setup/wordmark";

/**
 * The front door. Two ways in and no inputs on either of them.
 *
 * Naming yourself belongs to the flow you picked rather than to the screen
 * where you pick it — asking before anyone knows which door they are going
 * through is what makes a start screen feel like paperwork. Creating is the
 * loud one because most people arrive by somebody's link or QR and never see
 * this screen at all; of the ones who do, nearly all are opening the game.
 * m1-spec §8.
 */
export default function Start() {
	const navigate = useNavigate();
	// Read once: a session that appears while this screen is open would mean
	// another tab joined a game, which is not a thing to react to mid-tap.
	const [existing] = useState(loadSession);

	return (
		<Screen>
			<ScreenBody className="gap-4 pt-[max(1.5rem,env(safe-area-inset-top))]">
				<div className="flex flex-col items-start gap-2.5">
					<h1>
						<Wordmark className="text-[2.6rem]" />
					</h1>
					<p className="text-ink-dim text-sm">
						Hide and seek, for a whole city.
					</p>
				</div>

				{/* The four colours the rest of the app spends: U-Bahn, S-Bahn, tram,
				    and the one loud yellow that always means "act". */}
				<div aria-hidden className="flex gap-1">
					<i className="h-2 flex-1 rounded-full bg-transit-u" />
					<i className="h-2 flex-1 rounded-full bg-transit-s" />
					<i className="h-2 flex-1 rounded-full bg-transit-tram" />
					<i className="h-2 flex-1 rounded-full bg-action" />
				</div>

				<div className="flex-1" />

				<Door
					beacon
					data-testid="create-game"
					glyph={<Icon name="flag-banner" size="lg" />}
					hint="Set up the area and invite everyone"
					onClick={() => void navigate("/new")}
					tone="primary"
				>
					Create a game
				</Door>

				<Door
					data-testid="join-by-code"
					glyph={<Icon name="qr-code" size="lg" />}
					hint="If nobody sent you a link"
					onClick={() => void navigate("/join")}
				>
					Join with a code
				</Door>

				{existing && (
					/* Dashed, because an unfinished game is a loose end rather than a
					   third door. With no session open, the row is simply not there. */
					<button
						className={cn(
							"flex items-center gap-3 rounded-tile border border-hairline-strong border-dashed bg-surface px-3 py-2.5",
							"transition-transform duration-[--dur-tap] ease-[--ease-pop] active:scale-[0.98]",
						)}
						data-testid="resume"
						onClick={() => void navigate(`/g/${existing.code}`)}
						type="button"
					>
						<span
							aria-hidden
							className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-surface-raised"
						>
							<Icon name="timer" size="md" />
						</span>
						<span className="min-w-0 flex-1 text-left">
							<span className="num block font-semibold text-[0.95rem] tracking-[0.14em]">
								{existing.code}
							</span>
							<span className="eyebrow block">Still in this game</span>
						</span>
						<Chip tone="action">Rejoin</Chip>
					</button>
				)}

				{import.meta.env.DEV && <SceneMenu />}

				<div className="flex items-center justify-between gap-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
					<ThemeToggle />
					<p className="eyebrow text-right leading-snug">
						Companion to
						<br />
						Jet Lag: Hide + Seek
					</p>
				</div>
			</ScreenBody>
		</Screen>
	);
}
