import { useQuery, useZero } from "@rocicorp/zero/react";
import { mutators, queries } from "@zero-lag/schema";
import { useState } from "react";
import { Panel } from "../game/panel";

interface RulesCardProps {
	amHost: boolean;
}

export function RulesCard({ amHost }: RulesCardProps) {
	return (
		<Panel testId="rules-card" title="House rules">
			<RulesContents amHost={amHost} />
		</Panel>
	);
}

export function RulesContents({ amHost }: RulesCardProps) {
	const zero = useZero();
	const [rows] = useQuery(queries.houseRules());
	const rules = rows[0];
	const [draft, setDraft] = useState<string | null>(null);
	const value = draft ?? rules?.text ?? "";

	function save() {
		void zero.mutate(
			mutators.rules.update({
				eventId: crypto.randomUUID(),
				text: value,
			}),
		);
		setDraft(null);
	}

	if (!amHost) {
		return (
			<p className="whitespace-pre-wrap text-sm" data-testid="rules-text">
				{rules?.text || "No house rules yet."}
			</p>
		);
	}

	return (
		<div className="space-y-2">
			<textarea
				className="min-h-28 w-full rounded border bg-surface p-2 text-base"
				data-testid="rules-input"
				onChange={(event) => setDraft(event.target.value)}
				placeholder="No image searching train stations…"
				value={value}
			/>
			<button
				className="min-h-11 rounded border px-4 font-medium"
				data-testid="save-rules"
				onClick={save}
				type="button"
			>
				Save rules
			</button>
		</div>
	);
}
