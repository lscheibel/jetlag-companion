import { ActionButton } from "@zero-lag/ui/components/action-button";
import {
	Screen,
	ScreenActions,
	ScreenBody,
} from "@zero-lag/ui/components/screen";
import { Surface } from "@zero-lag/ui/components/surface";
import { isRouteErrorResponse, useNavigate } from "react-router";

/**
 * The other half of the boundary: everything that is not a missing page.
 *
 * It shares NotFound's frame and deliberately not its picture. The line
 * diagram says "this address is not a stop on the network", which over a
 * thrown error is a lie — the address was fine and the app broke on it.
 */

interface CrashedProps {
	error: unknown;
}

/**
 * The one line worth putting on screen, if there is one. A status text is
 * written for a person and can be shown; a thrown message is written for
 * whoever wrote the code, so it stays in development.
 */
function describe(error: unknown): string | undefined {
	if (isRouteErrorResponse(error)) return error.statusText || undefined;
	if (import.meta.env.DEV && error instanceof Error) return error.message;
	return undefined;
}

export function Crashed({ error }: CrashedProps) {
	const navigate = useNavigate();
	const detail = describe(error);
	const stack =
		import.meta.env.DEV && error instanceof Error ? error.stack : undefined;

	return (
		<Screen>
			<ScreenBody className="gap-3.5 pt-[max(1.5rem,env(safe-area-inset-top))]">
				<div className="eyebrow">Something went wrong</div>
				<h1 className="text-[2rem]">This page did not load.</h1>
				<p
					className="text-ink-dim text-sm leading-snug"
					data-testid="error-details"
				>
					The app ran into a problem opening it. Going back to the start usually
					clears it.
				</p>
				{detail && (
					<Surface className="flex flex-col gap-1.5">
						<div className="eyebrow">What failed</div>
						<div className="num break-words text-sm">{detail}</div>
					</Surface>
				)}
				{stack && (
					<pre className="num overflow-x-auto rounded-tile bg-surface-sunken p-3 text-[0.68rem] text-ink-dim leading-relaxed">
						<code>{stack}</code>
					</pre>
				)}
			</ScreenBody>
			<ScreenActions>
				<ActionButton
					beacon
					data-testid="back-to-start"
					onClick={() => void navigate("/")}
				>
					Back to the start
				</ActionButton>
			</ScreenActions>
		</Screen>
	);
}
