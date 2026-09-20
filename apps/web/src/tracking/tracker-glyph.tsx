import { ICON_PX, Icon, type IconSize } from "@zero-lag/ui/components/icon";
import { cn } from "@zero-lag/ui/lib/utils";
import type { TrackerApp } from "./api";

/**
 * An app's own mark, where it has one. m15-spec §6.
 *
 * These are here rather than in the kit's icon registry on purpose. That
 * registry is one set at one weight — a closed vocabulary the whole app draws
 * from — and a third-party logo is not vocabulary: it is a picture of somebody
 * else's product, and the reason to show it is that a player is about to go
 * looking for exactly that tile in a store. So the brand marks live beside the
 * catalogue that describes these apps, and the two without one fall back to a
 * Phosphor glyph from the registry.
 *
 * They are drawn in `currentColor`, like everything else in the app: OwnTracks
 * ships its mark in white for a coloured tile, which would be invisible on the
 * light theme's surfaces and on the yellow of a primary door.
 */

interface TrackerGlyphProps {
	app: TrackerApp;
	size?: IconSize;
	className?: string;
}

export function TrackerGlyph({
	app,
	size = "sm",
	className,
}: TrackerGlyphProps) {
	const brand = BRAND[app.id];
	if (!brand)
		return <Icon className={className} name={app.glyph} size={size} />;

	return (
		/* Decorative, like every glyph in this app: it never travels without the
		   app's name beside it, and a title would announce that name twice. */
		// biome-ignore lint/a11y/noSvgWithoutTitle: decorative; its label is beside it
		<svg
			aria-hidden
			className={cn("shrink-0", className)}
			fill="none"
			height={ICON_PX[size]}
			viewBox={brand.viewBox}
			width={ICON_PX[size]}
			xmlns="http://www.w3.org/2000/svg"
		>
			<path d={brand.path} fill="currentColor" />
		</svg>
	);
}

const BRAND: Record<string, { viewBox: string; path: string } | undefined> = {
	owntracks: {
		viewBox: "0 0 112 112",
		path: "M56 0a42.5 42.5 0 0 1 32.94 69.35l.06-.02L56 112 23 69.33l.06.02A42.5 42.5 0 0 1 56 0m.5 10a32.5 32.5 0 0 0-6.49 64.35v-23.8h-12.8L56 24.75l18.79 25.78h-12.8v24A32.5 32.5 0 0 0 56.5 10",
	},
	osmand: {
		viewBox: "0 0 24 24",
		path: "M12 0C6.11 0 1.332 4.777 1.332 10.668a10.67 10.67 0 0 0 6.52 9.828c1.927.836 2.667 1.282 3.26 2.467q.085.172.152.326c.189.422.318.711.736.711s.546-.289.736-.71q.069-.155.153-.327c.593-1.186 1.28-1.63 3.26-2.467a10.67 10.67 0 0 0 6.519-9.828C22.668 4.777 17.89 0 12 0m-.443 4.758a5.926 5.926 0 0 1 6.369 5.91 5.926 5.926 0 0 1-11.852 0 5.926 5.926 0 0 1 5.483-5.91",
	},
	traccar: {
		viewBox: "0 0 24 24",
		path: "M6.0011 1.6096C.2624 4.9226-1.7038 12.2603 1.6096 17.9989c3.313 5.7387 10.6507 7.7049 16.3893 4.3916 5.7387-3.313 7.7049-10.6507 4.3916-16.3894C19.0775.2624 11.7398-1.704 6.0011 1.6096m.7057 1.2224c5.0637-2.9233 11.538-1.1884 14.4616 3.8748 2.9232 5.0636 1.1884 11.5379-3.8748 14.4616-5.0636 2.9232-11.538 1.1884-14.4616-3.8748C-.0912 12.2299 1.6436 5.7556 6.7068 2.832m3.9141 14.3151a3.7678 3.7678 0 1 1-3.768-6.5262l1.884 3.2631Zm5.7255-11.3953-1.1763 1.495c.6649.5112 1.2792 1.1559 1.7246 1.9274s.6967 1.6258.8069 2.4573l1.8828-.2712c-.1405-1.074-.4828-2.1316-1.0581-3.128-.5753-.9965-1.3201-1.8218-2.1799-2.4805M14.074 8.7632l-1.1763 1.4949c.2745.216.5484.479.7338.8.1853.321.2761.6897.3259 1.0355l1.8828-.2713c-.0802-.5881-.2619-1.1608-.5769-1.7064-.3154-.5455-.7201-.9896-1.1892-1.353Zm-3.8317 3.708a.942.942 0 1 0 1.884 0 .942.942 0 1 0-1.884 0",
	},
};
