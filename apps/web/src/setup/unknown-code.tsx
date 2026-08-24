import { ActionButton } from "@zero-lag/ui/components/action-button";
import {
	Screen,
	ScreenActions,
	ScreenBody,
	ScreenHeader,
} from "@zero-lag/ui/components/screen";
import { Surface } from "@zero-lag/ui/components/surface";

/**
 * A code that resolved to nothing — mistyped, or opened from a link to a game
 * that has since ended.
 *
 * It says which code it tried, because the usual cause is one wrong character
 * and the usual fix is reading it again off somebody's screen.
 */

interface UnknownCodeProps {
	code: string;
	problem: string;
	onBack: () => void;
	onRetry: () => void;
}

export function UnknownCode({
	code,
	problem,
	onBack,
	onRetry,
}: UnknownCodeProps) {
	return (
		<Screen>
			<ScreenHeader onBack={onBack} title="That code did not work" />
			<ScreenBody>
				<Surface className="flex flex-col gap-2" data-testid="join-error">
					<div className="num font-semibold text-lg tracking-[0.14em]">
						{code}
					</div>
					<p className="text-ink-dim text-sm leading-snug">{problem}</p>
				</Surface>
			</ScreenBody>
			<ScreenActions note="Codes have no I, O, zero or one in them.">
				<ActionButton beacon data-testid="try-another-code" onClick={onRetry}>
					Type it again
				</ActionButton>
			</ScreenActions>
		</Screen>
	);
}
