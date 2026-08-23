import { env } from "@zero-lag/env/web";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function isLoopbackHost(hostname: string): boolean {
	return LOOPBACK.has(hostname);
}

/**
 * An HTTPS page cannot talk to `http://localhost:3000` — mixed content.
 * A phone cannot talk to `localhost` at all — that is the phone.
 * Vite proxies `/api` and `/zero-cache` on the page origin in both cases.
 * HTTP loopback (`HTTPS=0`) still uses the baked env URLs.
 *
 * Production has no Vite proxy and different hosts; baked `VITE_*` wins.
 */
export function usesViteProxy(
	page: Pick<Location, "hostname" | "origin">,
): boolean {
	if (page.origin.startsWith("https:")) return true;
	return !isLoopbackHost(page.hostname);
}

export function resolveServerUrl(
	page: Pick<Location, "hostname" | "origin">,
	configured: string,
): string {
	return usesViteProxy(page) ? page.origin : configured;
}

export function resolveZeroCacheUrl(
	page: Pick<Location, "hostname" | "origin">,
	configured: string,
): string {
	return usesViteProxy(page) ? `${page.origin}/zero-cache` : configured;
}

export function serverUrl(): string {
	if (!import.meta.env.DEV) return env.VITE_SERVER_URL;
	return resolveServerUrl(window.location, env.VITE_SERVER_URL);
}

export function zeroCacheUrl(): string {
	if (!import.meta.env.DEV) return env.VITE_ZERO_CACHE_URL;
	return resolveZeroCacheUrl(window.location, env.VITE_ZERO_CACHE_URL);
}
