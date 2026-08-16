import { env } from "@zero-lag/env/server";
import {
	createDb,
	createDbProvider,
	createPool,
	drizzleSchema,
} from "@zero-lag/schema/db";

export const pool = createPool(env.DATABASE_URL);
export const db = createDb(pool);
export const dbProvider = createDbProvider(db);
export { drizzleSchema };

declare module "@rocicorp/zero" {
	interface DefaultTypes {
		dbProvider: typeof dbProvider;
	}
}
