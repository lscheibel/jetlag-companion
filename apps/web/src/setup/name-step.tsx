import { ActionButton } from "@zero-lag/ui/components/action-button";
import { Checkbox } from "@zero-lag/ui/components/checkbox";
import { Field } from "@zero-lag/ui/components/field";
import {
	Screen,
	ScreenActions,
	ScreenBody,
	ScreenHeader,
} from "@zero-lag/ui/components/screen";
import { Stepper } from "@zero-lag/ui/components/stepper";
import { type FormEvent, type ReactNode, useState } from "react";
import { setupFailureMessage } from "./join-code";

/**
 * "What should we call you?" — the one screen both doors end on.
 *
 * Creating and joining ask for a name in the same shape and for the same
 * reason. Joining is still one field; creating adds a disclaimer and a pledge
 * that the host owns the physical game, because that is the door that would
 * otherwise look like a replacement for the box.
 */

interface NameStepProps {
	title: ReactNode;
	/** Small line above the title: which game this is, when it is known. */
	eyebrow?: ReactNode;
	/** Why this is safe to answer quickly. Reassurance, not a warning. */
	hint: ReactNode;
	/**
	 * What this app is not. Creating is the only door that needs it: joining
	 * someone else's game has already been through this gate.
	 */
	disclaimer?: ReactNode;
	/**
	 * A required checkbox above Continue. Creating asks the host to swear they
	 * own the physical game; joining does not.
	 */
	pledge?: ReactNode;
	submitLabel: string;
	submitTestId: string;
	errorTestId: string;
	/** Where this sits in a longer flow. Omitted when there is no flow. */
	steps?: { count: number; current: number; label: string };
	onBack: () => void;
	/** Throws to report a failure the player should read. */
	onSubmit: (displayName: string) => Promise<void>;
	/** Anything that belongs above the field: what you are joining. */
	children?: ReactNode;
}

export function NameStep({
	title,
	eyebrow,
	hint,
	disclaimer,
	pledge,
	submitLabel,
	submitTestId,
	errorTestId,
	steps,
	onBack,
	onSubmit,
	children,
}: NameStepProps) {
	const [displayName, setDisplayName] = useState("");
	const [ownsCopy, setOwnsCopy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const name = displayName.trim();
	const canSubmit = name.length > 0 && !busy && (!pledge || ownsCopy);

	function submit(event: FormEvent) {
		event.preventDefault();
		if (!canSubmit) return;
		setBusy(true);
		setError(null);
		void (async () => {
			try {
				await onSubmit(name);
			} catch (cause) {
				setError(setupFailureMessage(cause));
			} finally {
				setBusy(false);
			}
		})();
	}

	return (
		<Screen>
			<ScreenHeader eyebrow={eyebrow} onBack={onBack} title={title} />
			{steps && (
				<div className="px-4 pb-2.5">
					<Stepper
						count={steps.count}
						current={steps.current}
						label={steps.label}
					/>
				</div>
			)}

			{/* The form wraps the body *and* the action, so the keyboard's own go
			    key submits the step: a submit button outside its form is not the
			    form's default button, and Enter does nothing. */}
			<form className="flex flex-1 flex-col" onSubmit={submit}>
				<ScreenBody>
					{children}
					<Field
						// The keyboard is up when this opens: one field, one job.
						autoFocus
						autoComplete="nickname"
						data-testid="display-name"
						enterKeyHint="go"
						label="Your name"
						maxLength={40}
						onChange={(event) => setDisplayName(event.target.value)}
						size="display"
						value={displayName}
					/>
					<p className="px-1 text-ink-dim text-xs leading-snug">{hint}</p>
					{disclaimer && (
						<p className="px-1 text-ink-dim text-xs leading-snug">
							{disclaimer}
						</p>
					)}
				</ScreenBody>

				<ScreenActions
					note={
						error && (
							<span className="text-danger" data-testid={errorTestId}>
								{error}
							</span>
						)
					}
				>
					{pledge && (
						<Checkbox
							checked={ownsCopy}
							className="opacity-100 [&_[data-state=off]]:border-ink-dim"
							label={pledge}
							onChange={(event) => setOwnsCopy(event.currentTarget.checked)}
							testId="own-copy"
						/>
					)}
					<ActionButton
						beacon
						data-testid={submitTestId}
						disabled={!canSubmit}
						type="submit"
					>
						{submitLabel}
					</ActionButton>
				</ScreenActions>
			</form>
		</Screen>
	);
}
