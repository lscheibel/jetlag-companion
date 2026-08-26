import { ActionButton } from "@zero-lag/ui/components/action-button";
import { InlineNotice } from "@zero-lag/ui/components/notice";
import { useLobbyActions } from "./actions";
import { useHosts } from "./use-is-host";

/**
 * A game with no host at all. m1-spec §6.
 *
 * The last host stepped down, or their phone died. Neither is a failure and
 * neither needs recovering from: the hat is claimable by anyone, so the lobby
 * asks and the next person to look at their screen puts it on.
 *
 * A warning notice rather than a card, because it is a standing condition
 * sitting beside the thing it is about — and the way to make it go away is the
 * button in it, not a dismiss.
 */
export function HostBanner() {
	const hosts = useHosts();
	const { claimHost } = useLobbyActions();

	if (hosts.length > 0) return null;

	return (
		<div className="flex flex-col gap-2" data-testid="no-host-banner">
			<InlineNotice title="Nobody is host." tone="warn">
				Somebody has to run the round.
			</InlineNotice>
			<ActionButton
				data-testid="claim-host-banner"
				onClick={claimHost}
				size="comfortable"
				tone="secondary"
			>
				Take it
			</ActionButton>
		</div>
	);
}
