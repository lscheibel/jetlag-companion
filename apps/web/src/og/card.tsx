import { Wordmark } from "../setup/wordmark";

/**
 * The link preview. What a shared join link looks like in a chat before anyone
 * has tapped it.
 *
 * A React component rather than a hand-drawn SVG because it is then made of the
 * same tokens, the same fonts and the same wordmark as the app — `bg-ground`
 * here is the identical value the phone paints, and stays identical when the
 * palette moves. `npm run generate:og` photographs it; nothing renders this at
 * runtime, and the shot is committed as a static file.
 *
 * Fixed at 1200×630, the size every platform crops toward. Absolute px rather
 * than the responsive units the app uses: this has exactly one viewport, and it
 * is a canvas, not a screen.
 */
export function OgCard() {
	return (
		<div
			className="relative flex h-[630px] w-[1200px] shrink-0 flex-col justify-center overflow-hidden bg-ground pl-[104px]"
			data-testid="og-card"
		>
			{/* The platform edge. Signage marks where the floor stops before it
			    says anything, and this is the app's only piece of that grammar
			    that survives being shrunk to a chat thumbnail. */}
			<div className="absolute inset-y-0 left-0 w-[26px] bg-action" />

			<p className="eyebrow text-[20px] tracking-[0.2em]">Hide + Seek</p>

			<Wordmark className="mt-[26px] text-[104px]" />

			<div className="mt-[46px] flex items-center gap-[22px]">
				{/* The network, three lines of it. The same colours the map draws
				    U-Bahn, S-Bahn and tram in. */}
				<span className="flex gap-[9px]">
					<span className="size-[15px] rounded-full bg-transit-u" />
					<span className="size-[15px] rounded-full bg-transit-s" />
					<span className="size-[15px] rounded-full bg-transit-tram" />
				</span>
				<p className="max-w-[820px] text-[27px] text-ink-dim leading-snug">
					{/*Draw the area, run the round, keep every phone on one map.*/}
				</p>
			</div>
		</div>
	);
}
