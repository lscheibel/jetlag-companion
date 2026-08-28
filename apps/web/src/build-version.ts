import { env } from "@zero-lag/env/web";

/**
 * The commit this bundle was built from, or "dev" when it was not built by CI.
 *
 * Announced on the console at startup because the alternative is guesswork.
 * A stale service worker, a browser holding an immutably-cached asset and a
 * deployment that did not land all present as "the fix is not there", and the
 * only cheap way to tell them apart is for the page to say which build it is.
 */
export const BUILD_VERSION = env.VITE_BUILD_VERSION;

export function logBuildVersion(): void {
	const short =
		BUILD_VERSION.length > 12 ? BUILD_VERSION.slice(0, 12) : BUILD_VERSION;
	console.info(`%czero-lag%c build ${short}`, "font-weight:bold", "");
}
