import { env } from "@zero-lag/env/web";
import { ThemeScript } from "@zero-lag/ui/components/theme";
import {
	isRouteErrorResponse,
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
} from "react-router";

import "./index.css";
import type { Route } from "./+types/root";
import { logBuildVersion } from "./build-version";
import { Crashed } from "./error/crashed";
import { NotFound } from "./error/not-found";
import { Wordmark } from "./setup/wordmark";

// Module scope, so it runs once when the bundle loads rather than on a render.
logBuildVersion();

/**
 * Where this bundle is being served from. `og:image` has to be absolute — a
 * crawler reads it out of a document it fetched from an address it does not
 * tell us, and resolves nothing relative — and a static build has no request
 * to read the host off.
 *
 * Derived from the API's origin rather than baked in separately, because the
 * two are the same host by deployment design: the API is served from /api on
 * the web app's own origin, which is what `APP_ORIGIN` in infra/deploy sets
 * both the bundle's server URL and the server's `CORS_ORIGIN` from. Deriving
 * it means a domain move carries the preview along for free — `VITE_SERVER_URL`
 * must be updated for the app to work at all, and an app pointed at the wrong
 * API is broken in a way somebody notices within a minute, whereas a stale
 * `og:image` is broken in a way nobody notices at all.
 *
 * The assumption this rests on, stated plainly so it can be checked: the API
 * shares the web app's origin. zero-cache already has a host of its own, so
 * this is not unthinkable for the API too. If it ever moves, the preview image
 * silently points at a host that does not serve it, and this has to become its
 * own build argument again.
 *
 * In development the value is `http://localhost:3000` — the API, not the dev
 * server. Harmless: nothing crawls a dev server.
 */
function publicOrigin(): string {
	return new URL(env.VITE_SERVER_URL).origin;
}

const TITLE = "Jet Lag: The Game Companion";
const DESCRIPTION =
	"Draw the area, run the round, keep every phone on one map. A companion app for Jet Lag: Hide + Seek.";

/**
 * The link preview, and the document title with it.
 *
 * On the root route rather than on `j.$code`, where a join link actually lands,
 * because there is no server render: `react-router build` prerenders this head
 * once into `index.html`, and Caddy answers every path with that same file. A
 * `meta` export on any other route is written by JavaScript, and no crawler
 * runs any. So these tags are static and describe the app, not the game — the
 * one thing that is true of every URL a person can share.
 *
 * No `og:url`. It normally names the canonical address of the page, but one
 * document is serving all of them here, and a hardcoded value would tell the
 * handful of clients that follow it that /j/ABC123 was really the front door.
 *
 * The image is committed, drawn by `og/card.tsx` — see there.
 */
export function meta(): Route.MetaDescriptors {
	const image = `${publicOrigin()}/og.png`;
	return [
		{ title: TITLE },
		{ name: "description", content: DESCRIPTION },
		{ property: "og:type", content: "website" },
		{ property: "og:site_name", content: TITLE },
		{ property: "og:title", content: TITLE },
		{ property: "og:description", content: DESCRIPTION },
		{ property: "og:image", content: image },
		{ property: "og:image:width", content: "2400" },
		{ property: "og:image:height", content: "1260" },
		{ property: "og:image:alt", content: TITLE },
		{ name: "twitter:card", content: "summary_large_image" },
		{ name: "twitter:image", content: image },
	];
}

/**
 * The icon set, hand-written rather than injected.
 *
 * `vite-plugin-pwa` normally writes these tags itself, and with
 * `pwaAssets.config` enabled it knows exactly which files were generated. But
 * it injects through `transformIndexHtml`, and in SPA mode there is no
 * index.html to transform — `react-router build` prerenders the document from
 * `Layout` below. The plugin still emits the assets and the service worker;
 * only the tags are lost. That is why the built head carries no `rel="icon"`
 * at all today, and every browser has been finding /favicon.ico by the
 * root-path convention alone — which works for that one file and nothing else.
 *
 * The 2023 set: the .ico for browsers that read nothing better, the SVG for
 * everything current, and the touch icon for an iOS home screen. The
 * filenames belong to pwa-assets.config.ts — after `npm run
 * generate-pwa-assets`, check what it wrote against this list.
 */
export function links(): Route.LinkDescriptors {
	return [
		{ rel: "icon", href: "/favicon.ico", sizes: "48x48" },
		{ rel: "icon", href: "/favicon.svg", sizes: "any", type: "image/svg+xml" },
		{ rel: "apple-touch-icon", href: "/apple-touch-icon-180x180.png" },
	];
}

export function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<meta
					content="width=device-width, initial-scale=1, viewport-fit=cover"
					name="viewport"
				/>
				<ThemeScript />
				<Meta />
				<Links />
			</head>
			<body>
				{children}
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

export default function App() {
	return <Outlet />;
}

/**
 * What is on screen while a route resolves something on a cold start. SPA mode
 * allows this on the root route only, and today exactly one kind of arrival
 * reaches it: a link or a scanned QR code, whose join code is being looked up
 * before there is anything to ask. A blank frame is what that would open on
 * otherwise, which on a platform reads as an app that failed to start.
 */
export function HydrateFallback() {
	return (
		<main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-ground text-ink">
			<Wordmark className="text-4xl" />
			<p className="eyebrow">One moment…</p>
		</main>
	);
}

/**
 * Two screens behind one export, because the boundary catches two unrelated
 * things: an address no route claims, and the app breaking on an address that
 * was fine. They read differently and are owed different pictures — see the
 * comment in error/crashed.tsx.
 */
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
	return isRouteErrorResponse(error) && error.status === 404 ? (
		<NotFound />
	) : (
		<Crashed error={error} />
	);
}
