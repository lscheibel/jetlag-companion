import { useZero } from "@rocicorp/zero/react";
import { ActionButton } from "@zero-lag/ui/components/action-button";
import { Chip } from "@zero-lag/ui/components/chip";
import { NumberStepper } from "@zero-lag/ui/components/number-stepper";
import { Sheet } from "@zero-lag/ui/components/sheet";
import { cn } from "@zero-lag/ui/lib/utils";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useGameShell } from "../game/shell";
import {
	formatDuration,
	formatGround,
	formatZone,
	GAME_SIZES,
	type GameSize,
	HIDING_DURATION_MAX_MS,
	HIDING_DURATION_MIN_MS,
	HIDING_ZONE_MAX_M,
	HIDING_ZONE_MIN_M,
	SIZE_BANDS,
} from "../setup/game-size";
import { persistSetup } from "../setup/persist";
import { useSetup } from "../setup/wizard";
import { WizardStep } from "../setup/wizard-step";

/**
 * How big a game this is.
 *
 * The size is a **prefill, not a setting**: three small buttons set the two
 * numbers below them, and both stay adjustable in place, because a host who
 * knows their city knows better than a band does. The recommendation is
 * computed from the area's own stop count and ground rather than guessed.
 */
export default function SetupSize() {
	const navigate = useNavigate();
	const location = useLocation();
	const zero = useZero();
	const { session } = useGameShell();
	const setup = useSetup();
	const [detail, setDetail] = useState<GameSize | null>(null);
	const fromLobby =
		new URLSearchParams(location.search).get("from") === "lobby";
	const lobby = `/g/${session.code}`;
	const [busy, setBusy] = useState(false);
	const [problem, setProblem] = useState<string | null>(null);

	function continueSetup() {
		if (!fromLobby) {
			void navigate(`/g/${session.code}/setup/review`);
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
			continueTestId="setup-size-continue"
			eyebrow={fromLobby ? "This game" : undefined}
			note={
				problem ? <span className="text-danger">{problem}</span> : undefined
			}
			onBack={() =>
				void navigate(fromLobby ? lobby : `/g/${session.code}/setup/transit`)
			}
			onContinue={continueSetup}
			showRail={!fromLobby}
			step={3}
			title="How big is this game?"
		>
			<p className="px-1 text-ink-dim text-xs leading-snug">
				{setup.area
					? `${setup.stopsInPlay.toLocaleString("en")} stops across ${formatGround(setup.area.squareKm)} — that looks like a ${SIZE_BANDS[setup.suggestedSize].name.toLowerCase()} game.`
					: "Measuring the area…"}
			</p>

			<div className="grid grid-cols-3 gap-2">
				{GAME_SIZES.map((size) => {
					const band = SIZE_BANDS[size];
					const chosen = size === setup.size;
					return (
						<button
							className={cn(
								"flex min-h-[3.75rem] flex-col items-center justify-center gap-0.5 rounded-control border-2",
								"transition-transform duration-[--dur-tap] ease-[--ease-pop] hover:-translate-y-0.5",
								chosen
									? "zl-pop border-action bg-action/10"
									: "border-hairline bg-surface",
							)}
							data-testid={`size-${size}`}
							key={size}
							onClick={() => setup.chooseSize(size)}
							type="button"
						>
							<span className="font-display font-extrabold text-xl leading-none tracking-tight">
								{band.letter}
							</span>
							<span
								className={cn("eyebrow", chosen && "text-action")}
								data-testid={chosen ? "size-chosen" : undefined}
							>
								{band.caption}
							</span>
						</button>
					);
				})}
			</div>

			<div className="flex items-center justify-between gap-3 px-1">
				<span className="text-ink-dim text-xs">{setup.band.blurb}</span>
				<button
					className="font-mono text-[0.6rem] text-action uppercase tracking-[0.07em]"
					data-testid="size-explain"
					onClick={() => setDetail(setup.size)}
					type="button"
				>
					What this means ›
				</button>
			</div>

			<div className="flex-1" />

			<NumberStepper
				canDecrease={setup.hidingDurationMs > HIDING_DURATION_MIN_MS}
				canIncrease={setup.hidingDurationMs < HIDING_DURATION_MAX_MS}
				label="Time to hide"
				onStep={setup.stepDuration}
				suggested={
					setup.durationOverridden
						? {
								label: formatDuration(setup.band.hidingDurationMs),
								onRestore: setup.restoreDuration,
							}
						: null
				}
				testId="hiding-time"
				value={formatDuration(setup.hidingDurationMs)}
			/>

			<NumberStepper
				canDecrease={setup.hidingRadiusMeters > HIDING_ZONE_MIN_M}
				canIncrease={setup.hidingRadiusMeters < HIDING_ZONE_MAX_M}
				label="Hiding zone"
				onStep={setup.stepZone}
				suggested={
					setup.zoneOverridden
						? {
								label: formatZone(setup.band.hidingRadiusMeters),
								onRestore: setup.restoreZone,
							}
						: null
				}
				testId="hiding-zone"
				value={formatZone(setup.hidingRadiusMeters)}
			/>

			<SizeSheet
				fits={detail === setup.suggestedSize}
				onClose={() => setDetail(null)}
				onUse={(size) => {
					setup.chooseSize(size);
					setDetail(null);
				}}
				size={detail}
			/>
		</WizardStep>
	);
}

interface SizeSheetProps {
	size: GameSize | null;
	fits: boolean;
	onClose: () => void;
	onUse: (size: GameSize) => void;
}

/**
 * What a size actually means, behind a tap rather than crowding the screen it
 * explains. One button, and it names its effect; dismissing changes nothing.
 */
function SizeSheet({ size, fits, onClose, onUse }: SizeSheetProps) {
	const band = size ? SIZE_BANDS[size] : null;

	return (
		<Sheet
			actions={
				band && (
					<ActionButton
						data-testid="size-sheet-use"
						onClick={() => onUse(band.size)}
					>
						Use these numbers
					</ActionButton>
				)
			}
			onClose={onClose}
			open={band !== null}
			testId="size-sheet"
		>
			{band && (
				<div className="flex flex-col gap-3">
					<div className="flex items-center gap-3">
						<span className="grid size-11 shrink-0 place-items-center rounded-control border-2 border-action bg-action/10 font-display font-extrabold text-xl">
							{band.letter}
						</span>
						<div className="min-w-0 flex-1">
							<div className="font-display font-extrabold text-lg tracking-tight">
								{band.name}
							</div>
							<div className="text-ink-dim text-xs">{band.blurb}</div>
						</div>
						{fits && <Chip tone="live">Fits your area</Chip>}
					</div>

					<p className="text-ink-dim text-xs leading-snug">{band.examples}</p>

					<dl className="flex flex-col">
						<Fact label="Usually runs" value={band.runsFor} />
						<Fact label="Stops in play" value={band.stopsRange} />
						<Fact label="Ground covered" value={band.groundRange} />
						<Fact
							label="Sets time to hide"
							sets
							value={formatDuration(band.hidingDurationMs)}
						/>
						<Fact
							label="Sets hiding zone"
							sets
							value={formatZone(band.hidingRadiusMeters)}
						/>
					</dl>

					<p className="text-center text-ink-dim text-xs">
						Both numbers stay adjustable afterwards.
					</p>
				</div>
			)}
		</Sheet>
	);
}

function Fact({
	label,
	value,
	sets = false,
}: {
	label: string;
	value: string;
	sets?: boolean;
}) {
	return (
		<div className="flex items-baseline justify-between gap-3 border-hairline border-b py-2 last:border-b-0">
			<dt className="text-ink-dim text-xs">{label}</dt>
			<dd className={cn("num text-right text-sm", sets && "text-action")}>
				{value}
			</dd>
		</div>
	);
}
