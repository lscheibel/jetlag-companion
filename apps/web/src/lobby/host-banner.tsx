import { useLobbyActions } from "./actions";
import { useHosts } from "./use-is-host";

/**
 * A game with no host at all. m1-spec §6.
 *
 * The last host stepped down, or their phone died. Neither is a failure and
 * neither needs recovering from: the hat is claimable by anyone, so the lobby
 * asks and the next person to look at their screen puts it on.
 */
export function HostBanner() {
	const hosts = useHosts();
	const { claimHost } = useLobbyActions();

	if (hosts.length > 0) return null;

	return (
		<div
			className="flex items-center gap-3 rounded border border-amber-500 p-3"
			data-testid="no-host-banner"
		>
			<span className="text-sm">Nobody is host.</span>
			<button
				className="ml-auto min-h-11 rounded border px-3"
				data-testid="claim-host-banner"
				onClick={claimHost}
				type="button"
			>
				Take it
			</button>
		</div>
	);
}
