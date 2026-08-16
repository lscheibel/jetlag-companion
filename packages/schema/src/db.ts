import { zeroDrizzle } from "@rocicorp/zero/server/adapters/drizzle";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { drizzleSchema } from "./drizzle";
import { schema } from "./zero/schema";

/**
 * Server-only. Reachable at `@zero-lag/schema/db` and deliberately not from the
 * package root, so importing the Zero schema in the browser never drags `pg`
 * into the bundle.
 *
 * `zero-cache` needs a *direct* Postgres connection — no pgbouncer — and so
 * does this. m0-spec §3.
 */

export function createPool(connectionString: string): Pool {
	return new Pool({ connectionString });
}

export function createDb(pool: Pool) {
	return drizzle(pool, { schema: drizzleSchema });
}

export type Db = ReturnType<typeof createDb>;

export function createDbProvider(db: Db) {
	return zeroDrizzle(schema, db);
}

export type DbProvider = ReturnType<typeof createDbProvider>;

export { drizzleSchema };
