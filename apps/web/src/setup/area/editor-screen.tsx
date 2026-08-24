import { ActionButton } from "@zero-lag/ui/components/action-button";
import {
	Screen,
	ScreenActions,
	ScreenBody,
	ScreenHeader,
} from "@zero-lag/ui/components/screen";
import type { ReactNode } from "react";
import { useAreaToolNav } from "./tool-nav";
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
}: EditorScreenProps) {
	const editor = useAreaEditor();
	const nav = useAreaToolNav();

	return (
		<Screen>
			<ScreenHeader
				eyebrow="Setting the area"
				onBack={nav.back}
				title={title}
			/>
			<ScreenBody className={bodyClassName}>{children}</ScreenBody>
			<ScreenActions note={note}>
				<ActionButton
					beacon
					data-testid={actionTestId}
					disabled={actionDisabled || editor.busy || !editor.ready}
					hint={actionHint}
					onClick={onAction}
				>
					{actionLabel}
				</ActionButton>
				{secondary && (
					<ActionButton
						data-testid={secondary.testId}
						onClick={secondary.onClick}
						size="compact"
						tone="secondary"
					>
						{secondary.label}
					</ActionButton>
				)}
			</ScreenActions>
		</Screen>
	);
}
