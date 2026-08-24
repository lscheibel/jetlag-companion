import { ActionButton } from "@zero-lag/ui/components/action-button";
import {
	Screen,
	ScreenActions,
	ScreenBody,
	ScreenHeader,
} from "@zero-lag/ui/components/screen";
import { Stepper } from "@zero-lag/ui/components/stepper";
import type { ReactNode } from "react";

/**
 * The frame the create-a-game screens share.
 *
 * Every one of them is a header that can go back, a rail saying how far in you
 * are, one decision, and a single action in the bottom third. Writing that
 * five times would be five chances for the rail to disagree with itself about
 * how long the flow is.
 */

/** Name, area, transit, size, review. */
export const SETUP_STEPS = 5;

interface WizardStepProps {
	title: ReactNode;
	eyebrow?: ReactNode;
	/** Zero-based: name is 0, review is 4. */
	step: number;
	onBack: () => void;
	onContinue: () => void;
	continueLabel?: string;
	continueTestId?: string;
	busy?: boolean;
	/** Continue is present but not yet a decision — pick something first. */
	continueDisabled?: boolean;
	/** A line above the action: what happens, or what is in the way. */
	note?: ReactNode;
	bodyClassName?: string;
	children: ReactNode;
}

export function WizardStep({
	title,
	eyebrow,
	step,
	onBack,
	onContinue,
	continueLabel = "Continue",
	continueTestId,
	busy = false,
	continueDisabled = false,
	note,
	bodyClassName,
	children,
}: WizardStepProps) {
	return (
		<Screen>
			<ScreenHeader eyebrow={eyebrow} onBack={onBack} title={title} />
			<div className="px-4 pb-2.5">
				<Stepper count={SETUP_STEPS} current={step} label="Create game" />
			</div>
			<ScreenBody className={bodyClassName}>{children}</ScreenBody>
			<ScreenActions note={note}>
				<ActionButton
					beacon
					data-testid={continueTestId}
					disabled={busy || continueDisabled}
					onClick={onContinue}
				>
					{continueLabel}
				</ActionButton>
			</ScreenActions>
		</Screen>
	);
}
