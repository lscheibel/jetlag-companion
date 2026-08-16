import type { DeviceId } from "@zero-lag/schema";

/**
 * Identity is a device plus a chosen display name. m0-spec §4.
 *
 * The device id is generated here and never leaves localStorage; the token the
 * server hands back is scoped to exactly one game.
 */

const DEVICE_KEY = "zero-lag.deviceId";
const SESSION_KEY = "zero-lag.session";

export type Session = {
	readonly gameId: string;
	readonly code: string;
	readonly playerId: string;
	readonly token: string;
	readonly deviceId: DeviceId;
};

export function deviceId(): DeviceId {
	const stored = localStorage.getItem(DEVICE_KEY);
	if (stored) return stored;
	const created = crypto.randomUUID();
	localStorage.setItem(DEVICE_KEY, created);
	return created;
}

export function loadSession(): Session | null {
	const raw = localStorage.getItem(SESSION_KEY);
	if (!raw) return null;
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!isSession(parsed)) return null;
		return parsed;
	} catch {
		return null;
	}
}

export function saveSession(session: Session): void {
	localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
	localStorage.removeItem(SESSION_KEY);
}

function isSession(value: unknown): value is Session {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value as Record<string, unknown>;
	return (
		typeof candidate.gameId === "string" &&
		typeof candidate.code === "string" &&
		typeof candidate.playerId === "string" &&
		typeof candidate.token === "string" &&
		typeof candidate.deviceId === "string"
	);
}
