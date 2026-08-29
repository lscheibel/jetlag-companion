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
