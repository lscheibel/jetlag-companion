import { mustGetMutator, mustGetQuery } from "@rocicorp/zero";
import { handleMutateRequest, handleQueryRequest } from "@rocicorp/zero/server";
import { env } from "@zero-lag/env/server";
import { mutators, queries, schema, zql } from "@zero-lag/schema";
import { Hono } from "hono";
import { z } from "zod";
import { contextFromRequest } from "../auth";
import { db, dbProvider } from "../db";
import { deletePhotoBlobIfUnreferenced } from "../photo-db";

/**
 * The two endpoints `zero-cache` calls back into.
 *
 * Clients never send ZQL. They name a query, `zero-cache` asks us what that
 * name means, and we answer with the authoritative ZQL built against a context
 * the client cannot forge. That indirection is the read half of the visibility
 * rule in §8, and it is why the filters live in `packages/schema/queries.ts`.
 */

export const zero = new Hono();

const unmarkFoundArgs = z.object({
	roundId: z.string(),
	hiderTeamId: z.string(),
});

const markFoundArgs = unmarkFoundArgs.extend({
	photoId: z.string().optional(),
});

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
		handler: async (transact) => {
			const deletedPhotoDigests = new Set<string>();
			const mutationResult = await transact(async (tx, name, args) => {
				if (name === "round.unmarkFound" || name === "round.markFound") {
					const parsed =
						name === "round.unmarkFound"
							? unmarkFoundArgs.safeParse(args)
							: markFoundArgs.safeParse(args);
					if (parsed.success) {
						const outcome = await tx.run(
							zql.hiderOutcome
								.where("roundId", parsed.data.roundId)
								.where("hiderTeamId", parsed.data.hiderTeamId)
								.related("photo")
								.one(),
						);
						const replacing =
							name === "round.markFound" &&
							"photoId" in parsed.data &&
							parsed.data.photoId !== undefined &&
							outcome?.photoId !== parsed.data.photoId;
						if (
							outcome?.photo?.gameId === ctx.gameId &&
							(name === "round.unmarkFound" || replacing)
						) {
							deletedPhotoDigests.add(outcome.photo.sha256);
						}
					}
				}

				await mustGetMutator(mutators, name).fn({ args, tx, ctx });
			});

			// transact() has committed at this point. Deleting before it returns
			// could leave a rolled-back photo row pointing at missing bytes.
			if (!("error" in mutationResult.result)) {
				for (const digest of deletedPhotoDigests) {
					try {
						await deletePhotoBlobIfUnreferenced(db, env.PHOTOS_PATH, digest);
					} catch (error) {
						console.error("failed to delete unreferenced photo bytes", error);
					}
				}
			}

			return mutationResult;
		},
		request,
		userID: ctx.playerId,
	});

	return c.json(result);
});
