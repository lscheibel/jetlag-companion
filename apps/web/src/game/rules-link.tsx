import { RulesContents } from "../lobby/rules-card";
import { useIsHost } from "../lobby/use-is-host";

interface RulesLinkProps {
	playerId: string;
}

export function RulesLink({ playerId }: RulesLinkProps) {
	const amHost = useIsHost(playerId);
	return (
		<details className="relative z-50" data-testid="rules-menu">
			<summary className="min-h-11 cursor-pointer list-none rounded border bg-background px-3 py-2 text-sm">
				Rules
			</summary>
			<div className="absolute top-12 right-0 w-[min(24rem,calc(100vw-2rem))] space-y-2 rounded border bg-background p-3 shadow-xl">
				<h2 className="font-medium">House rules</h2>
				<RulesContents amHost={amHost} />
			</div>
		</details>
	);
}
