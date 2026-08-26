import { ActionButton } from "@zero-lag/ui/components/action-button";
import {
	Screen,
	ScreenActions,
	ScreenBody,
	ScreenHeader,
} from "@zero-lag/ui/components/screen";
import type { ReactNode } from "react";
import { useAreaToolNav } from "./tool-nav";
import { AddCutToggle } from "./tool-strip";
import { useAreaEditor } from "./use-editor";

interface EditorScreenProps {
	title: string;
	children: ReactNode;
	actionLabel: string;
	onAction: () => void;
	actionDisabled?: boolean;
	actionTestId?: string;
	actionHint?: ReactNode;
	note?: ReactNode;
	bodyClassName?: string;
	secondary?: {
		label: string;
		onClick: () => void;
		testId?: string;
	};
	/** Put the gray action above the primary (file picker: pick, then add). */
	secondaryFirst?: boolean;
	/** Add vs take out, directly above the commit. Pieces has no commit of that kind. */
	showAddCut?: boolean;
}

/**
 * A tool inside the editor. Back is one level up: the picker if this tool was
 * opened from "Where are you playing?", otherwise the editor home.
 */
export function EditorScreen({
	title,
	children,
	actionLabel,
	onAction,
	actionDisabled = false,
	actionTestId,
	actionHint,
	note,
	bodyClassName,
	secondary,
	secondaryFirst = false,
	showAddCut = false,
}: EditorScreenProps) {
	const editor = useAreaEditor();
	const nav = useAreaToolNav();
	const secondaryButton = secondary ? (
		<ActionButton
			data-testid={secondary.testId}
			onClick={secondary.onClick}
			tone="secondary"
		>
			{secondary.label}
		</ActionButton>
	) : null;

	return (
		<Screen>
			<ScreenHeader
				eyebrow="Setting the area"
				onBack={nav.back}
				title={title}
			/>
			<ScreenBody className={bodyClassName}>{children}</ScreenBody>
			<ScreenActions note={note}>
				{secondaryFirst && secondaryButton}
				{showAddCut && <AddCutToggle />}
				<ActionButton
					beacon
					data-testid={actionTestId}
					disabled={actionDisabled || editor.busy || !editor.ready}
					hint={actionHint}
					onClick={onAction}
				>
					{actionLabel}
				</ActionButton>
				{!secondaryFirst && secondaryButton}
			</ScreenActions>
		</Screen>
	);
}
