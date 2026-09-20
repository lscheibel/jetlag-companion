import { Outlet } from "react-router";
import { useGameShell } from "../game/shell";
import { TrackingProvider } from "../tracking/wizard";

/**
 * Background tracking: three screens, then a standing answer. m15-spec §6.
 *
 * It is a flow rather than a sheet because it is three decisions with an order
 * — which app, where its address goes, and whether the first ping arrived —
 * and this app's other flows are all built the same way, with a back control
 * in the frame and a rail saying how far in you are.
 *
 * It lives under `/g/:code` because it is reached from the map's locate
 * control and goes back there, and because the token is issued with the game's
 * bearer. What the token *grants* belongs to the device rather than to this
 * game, which is m15-spec §3's whole argument and the reason the chosen app is
 * remembered on the phone instead of against the player.
 */
export default function TrackingLayout() {
	const shell = useGameShell();

	return (
		<TrackingProvider session={shell.session}>
			<Outlet context={shell} />
		</TrackingProvider>
	);
}
