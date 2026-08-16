import { mustGetMutator, mustGetQuery } from "@rocicorp/zero";
import { handleMutateRequest, handleQueryRequest } from "@rocicorp/zero/server";
import { mutators, queries, schema } from "@zero-lag/schema";
import { Hono } from "hono";
import { contextFromRequest } from "../auth";
import { dbProvider } from "../db";

/**
 * The two endpoints `zero-cache` calls back into.
 *
 * Clients never send ZQL. They name a query, `zero-cache` asks us what that
 * name means, and we answer with the authoritative ZQL built against a context
 * the client cannot forge. That indirection is the read half of the visibility
 * rule in §8, and it is why the filters live in `packages/schema/queries.ts`.
 */

export const zero = new Hono();

zero.post("/query", async (c) => {
	const request = c.req.raw;
	const ctx = await contextFromRequest(request);
	if (!ctx) {
		// 401 puts the client into `needs-auth`, which prompts a token refresh.
		// A 500 would put it into `error`, where it stops retrying entirely.
		return c.json({ error: "unauthenticated" }, 401);
	}

	const result = await handleQueryRequest({
		handler: (name, args) => mustGetQuery(queries, name).fn({ args, ctx }),
		schema,
		request,
		userID: ctx.playerId,
	});

	return c.json(result);
});

zero.post("/mutate", async (c) => {
	const request = c.req.raw;
	const ctx = await contextFromRequest(request);
	if (!ctx) {
		return c.json({ error: "unauthenticated" }, 401);
	}

	const result = await handleMutateRequest({
		dbProvider,
		handler: (transact) =>
			transact((tx, name, args) =>
				mustGetMutator(mutators, name).fn({ args, tx, ctx }),
			),
		request,
		userID: ctx.playerId,
	});

	return c.json(result);
});
