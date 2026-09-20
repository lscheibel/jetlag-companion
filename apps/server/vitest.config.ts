import { configDefaults, defineConfig } from "vitest/config";

/**
 * `dist/` is build output, not a place to look for tests.
 *
 * `tsdown` leaves a compiled copy of every `*.test.ts` in there, and vitest will
 * happily run it — against the compiled source from whenever that build was
 * taken. A stale one then reports a second, green suite that says nothing about
 * the code in `src/`, which is worse than no suite at all: it makes the totals
 * look right while half of them are answering last week's question.
 *
 * It needs saying explicitly because vitest 4 cut `**\/dist\/**` from the
 * default exclude; vitest 3 shipped it, so this was free until the upgrade.
 */
export default defineConfig({
	test: {
		exclude: [...configDefaults.exclude, "**/dist/**"],
	},
});
