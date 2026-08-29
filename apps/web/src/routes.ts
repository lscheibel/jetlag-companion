import type { RouteConfig } from "@react-router/dev/routes";
import { flatRoutes } from "@react-router/fs-routes";

/**
 * `og.tsx` is an authoring surface, not a screen: it exists so a browser can
 * photograph the link-preview card against the app's own stylesheet, and it is
 * never reached by a player. Kept out of the production bundle rather than
 * merely unlinked, because an unlinked route is still a route — a URL anyone
 * can find and a chunk everyone downloads the manifest for.
 *
 * Matched against the absolute file path, which is what `flatRoutes` hands to
 * minimatch.
 */
export default flatRoutes({
	ignoredRouteFiles:
		process.env.NODE_ENV === "production" ? ["**/routes/og.tsx"] : [],
}) satisfies RouteConfig;
