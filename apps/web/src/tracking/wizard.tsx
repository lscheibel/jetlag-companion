import type { DevicePlatform } from "@zero-lag/platform";
import { webPlatform } from "@zero-lag/platform/web";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";
import type { Session } from "../session";
import type { TrackerApp } from "./api";
import { trackerAppsFor } from "./api";
import { readChosenAppId, writeChosenAppId } from "./chosen-app";
import { type TrackingState, useTracking } from "./use-tracking";

/**
 * What the background-tracking flow is holding across its three screens.
 * m15-spec §6.
 *
 * Two things outlive a step and neither belongs to the game: the device's
 * token, which the server owns, and which app this phone uses, which the phone
 * owns. Both are read once at the top so that going back a step does not
 * re-ask the server and re-parse a user agent.
 *
 * The token is deliberately *not* issued here. It is issued by the address
 * screen, because that is the first screen where having one changes what a
 * player sees — the old sheet issued it behind a button whose only visible
 * effect was more instructions.
 */

export interface TrackingWizard {
	readonly state: TrackingState;
	/** Local clock, read when `state` last arrived — the other half of the age sum. */
	readonly readAt: number;
	readonly busy: boolean;
	/** What this phone looks like to a user-agent parse — `unknown` off a desktop. */
	readonly platform: DevicePlatform;
	/** The apps worth offering this phone, best first. Never empty. */
	readonly apps: readonly TrackerApp[];
	/** What this phone picked last time, or null the first time through. */
	readonly app: TrackerApp | null;
	choose: (app: TrackerApp) => void;
	/** Issue a token if there is none. A no-op once there is. */
	ensureToken: () => void;
	disable: () => void;
}

const Context = createContext<TrackingWizard | null>(null);

export function TrackingProvider({
	session,
	children,
}: {
	session: Session;
	children: ReactNode;
}) {
	// Polling runs for as long as the flow is open, because the thing being
	// waited for arrives from a third-party app rather than from anything here.
	const tracking = useTracking(session, true);

	/**
	 * Read once. The phone does not become a different phone mid-flow, and
	 * re-reading would be a user-agent parse per render.
	 */
	const [platform] = useState(() => webPlatform.device.platform());
	const apps = useMemo(() => trackerAppsFor(platform), [platform]);
	const [appId, setAppId] = useState(readChosenAppId);

	// Derived rather than stored: a remembered id that names no app this phone
	// can use — a catalogue entry that has since been dropped — is the same
	// thing as not having chosen, and answers itself during render.
	const app = apps.find((candidate) => candidate.id === appId) ?? null;

	const choose = useCallback((next: TrackerApp) => {
		setAppId(next.id);
		writeChosenAppId(next.id);
	}, []);

	const { state, enable } = tracking;
	const ensureToken = useCallback(() => {
		// Only when there is none: the same call rotates an existing token, which
		// would silently break a URL already pasted into a tracker app.
		if (state.kind === "off") enable();
	}, [state.kind, enable]);

	const value = useMemo(
		() => ({
			state: tracking.state,
			readAt: tracking.readAt,
			busy: tracking.busy,
			platform,
			apps,
			app,
			choose,
			ensureToken,
			disable: tracking.disable,
		}),
		[tracking, platform, apps, app, choose, ensureToken],
	);

	return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useTrackingWizard(): TrackingWizard {
	const wizard = useContext(Context);
	if (!wizard) throw new Error("useTrackingWizard outside TrackingProvider");
	return wizard;
}
