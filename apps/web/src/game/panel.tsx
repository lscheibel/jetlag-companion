import type { ReactNode } from "react";

interface PanelProps {
	title: string;
	testId: string;
	children: ReactNode;
}

export function Panel({ title, testId, children }: PanelProps) {
	return (
		<section className="space-y-2 rounded border p-3" data-testid={testId}>
			<h2 className="font-medium text-sm uppercase tracking-wide">{title}</h2>
			{children}
		</section>
	);
}
