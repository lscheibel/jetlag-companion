import { OgCard } from "../og/card";

/**
 * Where the link preview is drawn, and the only reason it is a route at all:
 * the card needs the app's real stylesheet, real variable fonts and real
 * `data-theme` on the document to look like the app rather than like an
 * approximation of it. A browser pointed at the dev server gets all three for
 * free, so `npm run generate:og` photographs this page.
 *
 * Ignored by `routes.ts` in a production build — see the comment there.
 */
export default function OgRoute() {
	return (
		<main className="flex min-h-dvh items-center justify-center bg-surface-sunken p-8">
			<OgCard />
		</main>
	);
}
