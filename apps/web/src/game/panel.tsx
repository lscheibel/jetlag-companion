import { Surface } from "@zero-lag/ui/components/surface";
import type { ReactNode } from "react";

interface PanelProps {
	title: string;
	testId: string;
	children: ReactNode;
}

/** A titled block on a screen that is a list of them. Card plus an eyebrow. */
export function Panel({ title, testId, children }: PanelProps) {
	return (
		<Surface className="flex flex-col gap-2" data-testid={testId}>
			<h2 className="eyebrow">{title}</h2>
			{children}
		</Surface>
	);
}
