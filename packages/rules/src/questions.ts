import type { LngLat, Meters } from "@zero-lag/geo";
import type { ConstraintGeometry, ConstraintMode } from "./constraints";

/**
 * M0 models one question type. The shape is chosen so M6/M7 add types without
 * migrating. m0-spec §5.
 */
export type QuestionType = "radar";

export type RadarParams = { readonly radiusMeters: Meters };

export type QuestionShape = {
	readonly type: "radar";
	readonly params: RadarParams;
};

export type AnswerValue = { readonly kind: "boolean"; readonly value: boolean };

export type ConstraintShape = {
	readonly geometry: ConstraintGeometry;
	readonly mode: ConstraintMode;
};

export function radarGeometry(
	center: LngLat,
	radiusMeters: Meters,
): ConstraintGeometry {
	return { kind: "radius", centers: [center], radius: radiusMeters };
}

export type AnsweredQuestion = {
	readonly question: QuestionShape;
	/** Where the asking team stood. A radar is measured from there, not from a zone. */
	readonly askPosition: LngLat | null;
	readonly endPosition: LngLat | null;
	readonly value: AnswerValue;
};

/**
 * The constraint an answer implies — or `null` when it implies nothing.
 *
 * A null return is a normal outcome, not an error: a device with location
 * services off records `source: 'unavailable'` and still answers, and an
 * answer with no position behind it narrows no area. m0-spec §5.
 */
export function answerToConstraintGeometry(
	answered: AnsweredQuestion,
): ConstraintShape | null {
	switch (answered.question.type) {
		case "radar": {
			if (!answered.askPosition) return null;
			return {
				geometry: radarGeometry(
					answered.askPosition,
					answered.question.params.radiusMeters,
				),
				// "Yes, we are within R" keeps the disc; "no" carves it out.
				mode: answered.value.value ? "include" : "exclude",
			};
		}
	}
}
