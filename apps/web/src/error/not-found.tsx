import { ActionButton } from "@zero-lag/ui/components/action-button";
import {
	Screen,
	ScreenActions,
	ScreenBody,
} from "@zero-lag/ui/components/screen";
import { Surface } from "@zero-lag/ui/components/surface";
import { useLocation, useNavigate, useNavigationType } from "react-router";
import { LineEnd } from "./line-end";

/**
 * An address that is not a route.
 *
 * Deliberately headerless. Every other screen in the app is a step in
 * something longer and carries the frame's back caret, but nobody sets out to
 * arrive here — so both ways out sit together in the bottom third where a
 * thumb already is, rather than one being a caret in the corner and the other
 * a button 500px below it.
 *
 * A mistyped *join code* is not this screen's job: setup/unknown-code.tsx
 * catches that, quotes the code and offers a retry. This one only ever sees an
 * address that no route claims.
 */
export function NotFound() {
	const navigate = useNavigate();
	const { pathname, search } = useLocation();
	/**
	 * Whether there is any app behind this screen to go back to.
	 *
	 * The router already knows, and the question it answers is the right one:
	 * did you get here from inside the app? Landing on a dead link from within
	 * is a PUSH, and there is a screen behind it. A cold-opened one — typed,
	 * scanned, or tapped in somebody's chat — is a POP on the first entry the
	 * tab has, where "go back one step" is either inert or an offer to leave.
	 *
	 * Deliberately not `window.history.length`. Reading that during render
	 * makes the first client render disagree with the prerendered HTML, and
	 * React answers a hydration mismatch by throwing the whole tree away and
	 * building it again — which on this screen is a visible flash of unstyled
	 * content. The navigation type is router state, identical on both sides.
	 */
	const cameFromInside = useNavigationType() !== "POP";

	return (
		<Screen>
			<ScreenBody className="gap-3.5 pt-[max(1.5rem,env(safe-area-inset-top))]">
				<div className="eyebrow">Nothing at this address</div>
				<LineEnd className="my-1 w-full max-w-[20rem]" />
				<h1 className="text-[2rem]">End of the line.</h1>
				<p className="text-ink-dim text-sm leading-snug">
					This link points at a stop that is not on the network. It may have
					been typed by hand, or it belonged to a game that has since finished.
				</p>
				<Surface className="flex flex-col gap-1.5" data-testid="not-found">
					<div className="eyebrow">You asked for</div>
					<div className="num break-all text-sm">{pathname + search}</div>
				</Surface>
			</ScreenBody>
			<ScreenActions note="Any game you have joined is still waiting for you.">
				<ActionButton
					beacon
					data-testid="back-to-start"
					onClick={() => void navigate("/")}
				>
					Back to the start
				</ActionButton>
				{cameFromInside && (
					<ActionButton
						data-testid="back-one-step"
						onClick={() => void navigate(-1)}
						size="compact"
						tone="quiet"
					>
						Go back one step
					</ActionButton>
				)}
			</ScreenActions>
		</Screen>
	);
}
