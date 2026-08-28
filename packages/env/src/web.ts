import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	clientPrefix: "VITE_",
	client: {
		VITE_SERVER_URL: z.url(),
		VITE_ZERO_CACHE_URL: z.url(),
		/**
		 * Baked in at image build time from the commit SHA, so that what a
		 * browser is running can be read off the console rather than inferred
		 * from whether a bug reproduces. Defaults rather than being required:
		 * a dev server has no build to identify.
		 */
		VITE_BUILD_VERSION: z.string().default("dev"),
	},
	runtimeEnv: import.meta.env,
	emptyStringAsUndefined: true,
});
