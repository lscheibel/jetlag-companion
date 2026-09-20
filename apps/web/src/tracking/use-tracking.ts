import { useCallback, useEffect, useState } from "react";
import type { Session } from "../session";
import {
	createTracking,
	fetchTracking,
	revokeTracking,
	type TrackingIdentity,
} from "./api";

/**
 * How often the sheet re-asks whether a ping has arrived. m15-spec §6.
 *
 * This exists for one moment: a player has just tapped through to OwnTracks,
 * come back, and wants to know whether it worked. Answering that with a live
 * "last ping 3 s ago" is the difference between a feature people trust and a
 * URL they hope about. It polls only while the sheet is open.
 */
const POLL_INTERVAL_MS = 4_000;

export type TrackingState =
	| { readonly kind: "loading" }
	| { readonly kind: "off" }
	| { readonly kind: "on"; readonly identity: TrackingIdentity }
	| { readonly kind: "failed" };

export interface Tracking {
	readonly state: TrackingState;
	/** Local clock, read when `state` last arrived — the other half of the age sum. */
	readonly readAt: number;
	readonly busy: boolean;
	enable: () => void;
	disable: () => void;
}

/**
 * The device's standing permission to report its position, as a screen sees it.
 *
 * A hook rather than shell state because exactly one sheet reads it, and a
 * device token has nothing to do with the game session that happens to be
 * carrying the request.
 */
export function useTracking(session: Session, open: boolean): Tracking {
	const [state, setState] = useState<TrackingState>({ kind: "loading" });
	const [readAt, setReadAt] = useState(() => Date.now());
	const [busy, setBusy] = useState(false);

	const settle = useCallback((identity: TrackingIdentity | null) => {
		setState(identity ? { kind: "on", identity } : { kind: "off" });
		setReadAt(Date.now());
	}, []);

	// Synchronising with a server that a *third-party app* is also writing to,
	// which is what an effect is actually for.
	useEffect(() => {
		if (!open) return;
		let live = true;

		async function read() {
			try {
				const identity = await fetchTracking(session);
				if (live) settle(identity);
			} catch {
				if (live) setState({ kind: "failed" });
			}
		}

		void read();
		const timer = setInterval(() => void read(), POLL_INTERVAL_MS);
		return () => {
			live = false;
			clearInterval(timer);
		};
	}, [open, session, settle]);

	const enable = useCallback(() => {
		setBusy(true);
		createTracking(session)
			.then(settle)
			.catch(() => setState({ kind: "failed" }))
			.finally(() => setBusy(false));
	}, [session, settle]);

	const disable = useCallback(() => {
		setBusy(true);
		revokeTracking(session)
			.then(settle)
			.catch(() => setState({ kind: "failed" }))
			.finally(() => setBusy(false));
	}, [session, settle]);

	return { state, readAt, busy, enable, disable };
}
