/**
 * The line that stops short.
 *
 * A dead address is a stop that is not on the network, so this draws exactly
 * that: four stations in service, then the track thinning to a marching dashed
 * stub and a hollow ring where the stop you asked for would have been.
 *
 * Decorative, and marked so. The headline and the sentence under it carry the
 * whole message on their own — somebody who does not read this as a transit
 * diagram should lose nothing but the picture.
 */

interface LineEndProps {
	className?: string;
}

export function LineEnd({ className }: LineEndProps) {
	return (
		// biome-ignore lint/a11y/noSvgWithoutTitle: decorative — the headline and the sentence under it say the whole thing, and a titled svg here gets read out twice
		<svg
			aria-hidden
			className={className}
			fill="none"
			viewBox="0 0 288 62"
			xmlns="http://www.w3.org/2000/svg"
		>
			{/* In service, in the blue the app spends on the U-Bahn. */}
			<line
				stroke="var(--transit-u)"
				strokeLinecap="round"
				strokeWidth="11"
				x1="16"
				x2="180"
				y1="31"
				y2="31"
			/>
			{/*
			 * The stub. `2 11` is a 13px period and zl-march travels -26px, which is
			 * two of them — so the dashes loop seamlessly instead of jumping back at
			 * the end of every cycle.
			 */}
			<line
				className="zl-march"
				stroke="var(--ink-faint)"
				strokeDasharray="2 11"
				strokeLinecap="round"
				strokeWidth="5"
				x1="188"
				x2="268"
				y1="31"
				y2="31"
			/>
			<g fill="var(--ground)" stroke="var(--transit-u)" strokeWidth="4">
				<circle cx="34" cy="31" r="6" />
				<circle cx="83" cy="31" r="6" />
				<circle cx="132" cy="31" r="6" />
				<circle cx="176" cy="31" r="6" />
			</g>
			{/*
			 * The stop that is not there: a station's own silhouette, drawn as an
			 * absence. `pathLength` rather than real units, because a dash pattern
			 * measured in pixels never divides a circumference evenly and the last
			 * dash collides with the first — at this size that reads as debris
			 * rather than as a dashed ring. Normalising the path to 40 makes
			 * `3 2` exactly eight dashes, whatever the radius.
			 *
			 * `fill-box` because zl-breathe scales, and an SVG shape scaled about
			 * the user-space origin leaves the canvas rather than pulsing in place.
			 */}
			<circle
				className="zl-breathe [transform-box:fill-box] [transform-origin:center]"
				cx="266"
				cy="31"
				pathLength="40"
				r="7"
				stroke="var(--ink-faint)"
				strokeDasharray="3 2"
				strokeWidth="3.5"
			/>
		</svg>
	);
}
