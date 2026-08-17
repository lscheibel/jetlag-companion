import type { MutatorResult } from "@rocicorp/zero";
import { useCallback, useState } from "react";
import { z } from "zod";

/**
 * A mutator refusal, on its way to a sentence.
 *
 * Refusals are not a security boundary — build plan, principle 2. One means
 * somebody's screen was out of date, so the notice says what happened and
 * nothing more: no retry, no escalation, no accusation.
 */
const rejection = z.union([
	z.object({ code: z.literal("not_permitted"), reason: z.string() }),
	z.object({
		code: z.literal("game_state_invalid"),
		expected: z.string(),
		actual: z.string(),
	}),
]);

export type LobbyRejection = z.infer<typeof rejection>;

export function rejectionMessage(value: LobbyRejection): string {
	return value.code === "not_permitted"
		? `Not your call — ${value.reason}.`
		: `Too late — that needs ${value.expected}, and ${value.actual}.`;
}

/**
 * `zero.mutate(…)` resolves rather than throws, and it resolves twice: once for
 * the optimistic pass and once for the server's. Whichever refuses first is the
 * one worth showing.
 */
export function useRejections() {
	const [current, setCurrent] = useState<LobbyRejection | null>(null);

	const submit = useCallback((result: MutatorResult) => {
		void (async () => {
			for (const outcome of await Promise.all([result.client, result.server])) {
				if (outcome.type !== "error" || outcome.error.type !== "app") continue;
				const parsed = rejection.safeParse(outcome.error.details);
				if (parsed.success) {
					setCurrent(parsed.data);
					return;
				}
			}
		})();
	}, []);

	const dismiss = useCallback(() => setCurrent(null), []);

	return { rejection: current, submit, dismiss };
}
