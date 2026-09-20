import { Stepper } from "@zero-lag/ui/components/stepper";

/** Pick an app, point it here, watch it arrive. */
export const TRACKING_STEPS = 3;

/**
 * How far into the flow this screen is.
 *
 * In its own file for the same reason the create wizard's is: three screens
 * that each name the length of the flow are three chances for the rail to
 * disagree with itself.
 */
export function StepRail({ step }: { step: number }) {
	return (
		<div className="px-4 pb-2.5">
			<Stepper
				count={TRACKING_STEPS}
				current={step}
				label="Background tracking"
			/>
		</div>
	);
}
