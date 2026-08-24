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
import { Wordmark } from "./setup/wordmark";

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

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
	let message = "Oops!";
	let details = "An unexpected error occurred.";
	let stack: string | undefined;

	if (isRouteErrorResponse(error)) {
		message = error.status === 404 ? "404" : "Error";
		details =
			error.status === 404
				? "The requested page could not be found."
				: error.statusText || details;
	} else if (import.meta.env.DEV && error instanceof Error) {
		details = error.message;
		stack = error.stack;
	}

	return (
		<main className="container mx-auto p-4 pt-16">
			<h1>{message}</h1>
			<p data-testid="error-details">{details}</p>
			{stack && (
				<pre className="w-full overflow-x-auto p-4">
					<code>{stack}</code>
				</pre>
			)}
		</main>
	);
}
