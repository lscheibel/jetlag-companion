import { useEffect, useState } from "react";
import { EphemeralChannel, type EphemeralState } from "../ephemeral";

const OFFLINE: EphemeralState = {
	connected: false,
	entries: [],
	clockOffsetMs: null,
};

/**
 * The channel's lifetime is the effect's lifetime.
 *
 * Creating it outside and closing it in cleanup looks equivalent and is not: a
 * closed channel stays closed, so the second mount of a StrictMode pair — or
 * any remount at all — would attach to a corpse.
 */
export function useEphemeralChannel(token: string) {
	const [channel, setChannel] = useState<EphemeralChannel | null>(null);
	const [state, setState] = useState<EphemeralState>(OFFLINE);

	useEffect(() => {
		const created = new EphemeralChannel(token);
		const unsubscribe = created.subscribe(setState);
		created.connect();
		setChannel(created);

		return () => {
			unsubscribe();
			created.close();
			setChannel(null);
			setState(OFFLINE);
		};
	}, [token]);

	return { channel, state };
}
