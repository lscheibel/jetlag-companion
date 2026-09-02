import { readFileSync, writeFileSync } from "node:fs";
import { build, DARK_SPEC, LIGHT_SPEC, railExpressions } from "./build.mjs";

/** The app's map module. These two files are generated; edit this tool. */
const OUT_DIR = new URL("../../apps/web/src/map/", import.meta.url);

const TYPES = {
	TRANSIT_COLOR: "DataDrivenPropertyValueSpecification<string>",
	RAIL_WIDTH: "DataDrivenPropertyValueSpecification<number>",
	TRANSIT_WIDTH: "DataDrivenPropertyValueSpecification<number>",
};

const DOCS = {
	TRANSIT_COLOR: `/**
 * The transit network, coloured by what kind of line it is. \`subclass\` is the
 * tiles' own word for it, and these are the signage colours the city uses:
 * U-Bahn blue, S-Bahn green, tram amber. Anything else — a funicular, a
 * monorail — falls through to plain rail.
 */`,
	RAIL_WIDTH: `/**
 * Heavy rail, thin where a whole city fits on the screen and full width where a
 * street does.
 */`,
	TRANSIT_WIDTH: `/**
 * Rapid transit at full width, street trams at two thirds of it: a tram shares
 * the road it is drawn over, and at equal weight the pair reads as one striped
 * road rather than as a line and a street.
 */`,
};

const emit = (spec, headerFile, out, name) => {
	const style = build(spec, true);
	const expr = railExpressions(spec.palette);
	const byValue = new Map();
	for (const [key, value] of Object.entries(spec.palette)) {
		if (!byValue.has(value)) byValue.set(value, key);
	}
	const render = (v, indent = "\t") => {
		let text = JSON.stringify(v, null, "\t");
		for (const [value, key] of byValue)
			text = text.replaceAll(`"${value}"`, `PALETTE.${key}`);
		for (const key of Object.keys(DOCS))
			text = text.replaceAll(`"@@${key}@@"`, key);
		return text.replace(/\n/g, `\n${indent}`).replace(/^/, "");
	};

	const palette = Object.entries(spec.palette)
		.map(([key, value]) => {
			const note = spec.notes[key];
			return `${note ? `${note}\n` : ""}\t${key}: "${value}",`;
		})
		.join("\n");

	const shared = Object.keys(DOCS)
		.map(
			(key) =>
				`${DOCS[key]}\nconst ${key}: ${TYPES[key]} = ${render(expr[key], "")};\n`,
		)
		.join("\n");

	writeFileSync(
		new URL(out, OUT_DIR),
		`${readFileSync(new URL(`./headers/${headerFile}`, import.meta.url), "utf8")}
const PALETTE = {
${palette}
} as const;

${shared}
export const ${name} = {
	version: 8,
	sprite: ${JSON.stringify(style.sprite)},
	glyphs: ${JSON.stringify(style.glyphs)},
	sources: ${render(style.sources)},
	layers: ${render(style.layers)},
} satisfies StyleSpecification;
`,
	);
	console.log(`wrote apps/web/src/map/${out} — ${style.layers.length} layers`);
};

emit(DARK_SPEC, "dark.ts.txt", "dark-style.ts", "DARK_MAP_STYLE");
emit(LIGHT_SPEC, "light.ts.txt", "light-style.ts", "LIGHT_MAP_STYLE");
