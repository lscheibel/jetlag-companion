/**
 * The six question families, as the rulebook in `docs/questions` states them.
 *
 * Data, not screens: every string here is something the rulebook says, and the
 * only reason a sentence is split into parts is that a blank has to be drawn
 * differently from the words around it. M6 will ask these questions; today the
 * board that reads this file only shows a seeker what there is to ask.
 *
 * Two things are modelled rather than written out per screen:
 *
 * - **Board size.** A question the game's size does not carry is not missing
 *   and not broken — it belongs to a bigger board, and it says which. Every
 *   option therefore lists the sizes it exists on rather than being filtered
 *   out of a list somewhere.
 * - **The blank.** A family is one sentence with one or two holes in it, and
 *   picking an option fills them. That is the whole interaction, so the
 *   sentence is a structure and not a template string.
 */

/**
 * The three sizes a game is played at, in the terms the host chose during
 * setup. Mirrors `GameSize` in the web app, which is where a scale preset is
 * turned back into one of these.
 */
export type BoardSize = "small" | "medium" | "large";

export const BOARD_SIZES = ["small", "medium", "large"] as const;

export type QuestionFamilyId =
	| "radar"
	| "matching"
	| "measuring"
	| "thermometer"
	| "photo"
	| "tentacle";

/** Every size, for the questions no size rule touches. */
const ANY: readonly BoardSize[] = BOARD_SIZES;
const MEDIUM_UP: readonly BoardSize[] = ["medium", "large"];
const LARGE_ONLY: readonly BoardSize[] = ["large"];

/**
 * A hole in a family's sentence.
 *
 * `subject` is what the seeker picks. `radius` is the second hole tentacle
 * has, which the picked subject settles rather than the seeker: the museums
 * are within 2 km and the zoos within 25, and that is a fact about the subject.
 */
export type SentenceSlot = "subject" | "radius";

export type SentencePart =
	| { readonly kind: "text"; readonly text: string }
	| { readonly kind: "slot"; readonly slot: SentenceSlot };

/** One filled sentence, ready to draw: text runs and settled or empty blanks. */
export type ReadPart =
	| { readonly kind: "text"; readonly text: string }
	| { readonly kind: "filled"; readonly text: string; readonly picked: boolean }
	| { readonly kind: "blank" };

export interface QuestionOption {
	/** Unique inside its family. */
	readonly id: string;
	readonly label: string;
	/**
	 * How the option reads inside the sentence, in lower case.
	 *
	 * Absent where the option is not a word but a number the seekers agree on —
	 * radar's free distance — and the blank then stays a blank.
	 */
	readonly reads?: string;
	/** What this subject settles the family's other blank to. Tentacle only. */
	readonly radius?: string;
	/** An example or a condition, under the label on the board. */
	readonly tagline?: string;
	/**
	 * The other words for it: what the rulebook calls it, what another country
	 * calls it, what somebody would type looking for it. Never shown — search
	 * reads it so that "movie theater" finds the cinema and "grocery store"
	 * finds the supermarket aisle.
	 */
	readonly aka?: string;
	/** The one line of rulebook with a trap in it. Shown on the card. */
	readonly rule?: string;
	/**
	 * The seeker types this one rather than picking it.
	 *
	 * Exactly one option in the rulebook works this way — radar's "any distance
	 * the seekers like" — so this is a flag on that option rather than a kind of
	 * board. Everything else is a fixed rung or a named subject.
	 */
	readonly custom?: "distanceMeters";
	/** The board sizes this option exists on. */
	readonly sizes: readonly BoardSize[];
}

export interface QuestionGroup {
	/** Absent where a family is one undivided list. */
	readonly title?: string;
	readonly options: readonly QuestionOption[];
}

export interface QuestionFamily {
	readonly id: QuestionFamilyId;
	readonly name: string;
	/** The sentence with `___` in it, for the picker row. */
	readonly shorthand: string;
	/** Other words for the family itself. Search only, like the options'. */
	readonly aka?: string;
	readonly sentence: readonly SentencePart[];
	/** What comes back, in the answerer's words. */
	readonly answer: string;
	/** How long the hider has, per board size. */
	readonly minutes: Readonly<Record<BoardSize, number>>;
	readonly draw: number;
	readonly keep: number;
	/** The board sizes this family exists on. */
	readonly sizes: readonly BoardSize[];
	/** Rules that hold for every question in the family. */
	readonly rules: readonly string[];
	/** A family that is asked in two sends, with a journey between them. */
	readonly steps?: readonly string[];
	/** One sentence of mental model, where a family needs one. */
	readonly note?: string;
	readonly groups: readonly QuestionGroup[];
}

/**
 * Rules that hold for matching and measuring alike: both name a feature on the
 * map, and both are measured the same way. m0-spec's null answer lives here —
 * it counts as answered and the hider still draws.
 */
const MAP_FEATURE_RULES: readonly string[] = [
	"Anything outside the game area does not exist. If nothing of that kind is inside it, the answer is a null answer — it still counts, and the hider still draws.",
	"Distance to a place is measured to its icon on the map, even where that gives an odd result.",
	"Where a category is fuzzy, the seekers asking say what they mean.",
];

const ICON_QUIRK =
	"Whatever the mapping app calls one, measured from its icon — so you can stand inside a huge one and still be nearer a small one's icon.";

const GOLF_RULE =
	"Outdoor courses only: no mini golf and no driving ranges. Say what you count when you ask.";

const CONSULATE_RULE = "Honorary consulates do not count.";

const AIRPORT_RULE =
	"Commercial if flights to or from it show up on Google Flights.";

const RADAR: QuestionFamily = {
	id: "radar",
	name: "Radar",
	aka: "circle distance radius how far near",
	shorthand: "Are you within ___ of me?",
	sentence: [
		{ kind: "text", text: "Are you within " },
		{ kind: "slot", slot: "subject" },
		{ kind: "text", text: " of me?" },
	],
	answer: "Yes or no",
	minutes: { small: 5, medium: 5, large: 5 },
	draw: 2,
	keep: 1,
	sizes: ANY,
	rules: [
		"A radar asks where the hider is standing, not where their zone is. If the circle covers part of the zone but not the spot they are standing in when they answer, the answer is no.",
		"Easiest way to measure it: long-press in your mapping app and use the measure tool.",
	],
	groups: [
		{
			options: [
				{ id: "500m", label: "500 m", reads: "500 m", sizes: ANY },
				{ id: "1km", label: "1 km", reads: "1 km", sizes: ANY },
				{ id: "2km", label: "2 km", reads: "2 km", sizes: ANY },
				{ id: "5km", label: "5 km", reads: "5 km", sizes: ANY },
				{ id: "10km", label: "10 km", reads: "10 km", sizes: ANY },
				{ id: "15km", label: "15 km", reads: "15 km", sizes: ANY },
				{ id: "40km", label: "40 km", reads: "40 km", sizes: ANY },
				{ id: "80km", label: "80 km", reads: "80 km", sizes: ANY },
				{ id: "160km", label: "160 km", reads: "160 km", sizes: ANY },
				{
					id: "free",
					label: "A distance you choose",
					aka: "custom own any distance metres meters",
					custom: "distanceMeters",
					rule: "Any distance the seekers like — the number goes into the question, so both teams measure the same circle.",
					sizes: ANY,
				},
			],
		},
	],
};

const MATCHING: QuestionFamily = {
	id: "matching",
	name: "Matching",
	aka: "same as mine nearest match",
	shorthand: "Is your nearest ___ the same as mine?",
	sentence: [
		{ kind: "text", text: "Is your nearest " },
		{ kind: "slot", slot: "subject" },
		{ kind: "text", text: " the same as mine?" },
	],
	answer: "Yes or no",
	minutes: { small: 5, medium: 5, large: 5 },
	draw: 3,
	keep: 1,
	sizes: ANY,
	rules: MAP_FEATURE_RULES,
	groups: [
		{
			title: "Getting around",
			options: [
				{
					id: "airport",
					label: "Airport",
					aka: "commercial airport flights airfield",
					reads: "airport",
					rule: AIRPORT_RULE,
					sizes: ANY,
				},
				{
					id: "transit-line",
					label: "Transit line",
					aka: "u-bahn s-bahn metro subway tram bus line route",
					reads: "transit line",
					tagline: "While you ride",
					rule: "Ask only from a vehicle that is moving. Yes needs a scheduled stop at their station — an express running through it does not count.",
					sizes: ANY,
				},
				{
					id: "station-name-length",
					label: "Length of the station name",
					aka: "letters characters name length spelling",
					reads: "station name length",
					rule: "Count the characters as the mapping app writes them, spaces and hyphens included. If the name carries the word “station”, that counts too.",
					sizes: ANY,
				},
				{
					id: "street",
					label: "Street or path",
					aka: "road lane avenue footpath",
					reads: "street or path",
					rule: "A street ends where its name changes — including Jet Lag St. East becoming Jet Lag St. West. An unnamed one runs from one intersection to the next.",
					sizes: ANY,
				},
			],
		},
		{
			title: "Where on the map",
			options: [
				{
					id: "division-1",
					label: "Top-level division",
					aka: "state canton prefecture province region bundesland stadtstaat land",
					reads: "top-level division",
					tagline: "Bundesland — states, cantons, prefectures",
					rule: "A city that is also a state is its own top-level division: Berlin, Hamburg and Bremen are Bundesländer as well as cities.",
					sizes: ANY,
				},
				{
					id: "division-2",
					label: "Second-level division",
					aka: "county district kreis landkreis regierungsbezirk subprefecture",
					reads: "second-level division",
					tagline: "Landkreis — counties, subprefectures",
					sizes: ANY,
				},
				{
					id: "division-3",
					label: "Third-level division",
					aka: "municipality town city gemeinde stadt commune",
					reads: "third-level division",
					tagline: "Gemeinde or Stadt — usually the municipality",
					rule: "Municipal borders can be fuzzy — the seekers asking resolve anything unclear.",
					sizes: ANY,
				},
				{
					id: "division-4",
					label: "Fourth-level division",
					aka: "borough ward bezirk ortsteil stadtteil kiez neighbourhood neighborhood",
					reads: "fourth-level division",
					tagline: "Bezirk or Ortsteil — boroughs, city districts, wards",
					rule: "Does not exist everywhere. Many large cities have one — Berlin has both Bezirke and the finer Ortsteile — and many places have none.",
					sizes: ANY,
				},
			],
		},
		{
			title: "Out in the open",
			options: [
				{
					id: "mountain",
					label: "Mountain",
					reads: "mountain",
					rule: "Whatever the mapping app classifies as a mountain, measured from its icon.",
					sizes: ANY,
				},
				{
					id: "landmass",
					label: "Landmass",
					aka: "island mainland continent",
					reads: "landmass",
					rule: "Continuous land, not cut by a waterway. A landmass entirely enclosed by yours still counts as a match.",
					sizes: ANY,
				},
				{
					id: "park",
					label: "Park",
					reads: "park",
					rule: ICON_QUIRK,
					sizes: ANY,
				},
			],
		},
		{
			title: "Places",
			options: [
				{
					id: "amusement-park",
					label: "Amusement park",
					reads: "amusement park",
					sizes: ANY,
				},
				{ id: "zoo", label: "Zoo", reads: "zoo", sizes: ANY },
				{ id: "aquarium", label: "Aquarium", reads: "aquarium", sizes: ANY },
				{
					id: "golf-course",
					label: "Golf course",
					reads: "golf course",
					rule: GOLF_RULE,
					sizes: ANY,
				},
				{ id: "museum", label: "Museum", reads: "museum", sizes: ANY },
				{
					id: "cinema",
					label: "Cinema",
					aka: "movie theater movie theatre pictures",
					reads: "cinema",
					sizes: ANY,
				},
			],
		},
		{
			title: "Public services",
			options: [
				{ id: "hospital", label: "Hospital", reads: "hospital", sizes: ANY },
				{ id: "library", label: "Library", reads: "library", sizes: ANY },
				{
					id: "consulate",
					label: "Foreign consulate",
					aka: "embassy diplomatic mission",
					reads: "foreign consulate",
					rule: CONSULATE_RULE,
					sizes: ANY,
				},
			],
		},
	],
};

const MEASURING: QuestionFamily = {
	id: "measuring",
	name: "Measuring",
	aka: "closer further farther nearer distance",
	shorthand: "Closer to it than me, or further?",
	sentence: [
		{ kind: "text", text: "Are you closer to " },
		{ kind: "slot", slot: "subject" },
		{ kind: "text", text: " than me, or further?" },
	],
	answer: "Closer or further",
	minutes: { small: 5, medium: 5, large: 5 },
	draw: 3,
	keep: 1,
	sizes: ANY,
	rules: MAP_FEATURE_RULES,
	groups: [
		{
			title: "Getting around",
			options: [
				{
					id: "airport",
					label: "Airport",
					aka: "commercial airport flights airfield",
					reads: "an airport",
					rule: AIRPORT_RULE,
					sizes: ANY,
				},
				{
					id: "rail-station",
					label: "Rail station",
					aka: "train station u-bahn s-bahn metro subway platform",
					reads: "a rail station",
					rule: "Light rail, heavy rail, metro and subway stations all count.",
					sizes: ANY,
				},
				{
					id: "high-speed-line",
					label: "High-speed line",
					aka: "ice tgv shinkansen bullet train fast rail",
					reads: "a high-speed line",
					rule: "Use the local definition where there is one. Otherwise the EU standard: about 250 km/h on purpose-built line, about 200 km/h on line upgraded for it.",
					sizes: ANY,
				},
			],
		},
		{
			title: "Borders",
			options: [
				{
					id: "border-country",
					label: "Country border",
					aka: "international border frontier",
					reads: "a country border",
					rule: "Enclaves count.",
					sizes: ANY,
				},
				{
					id: "border-division-1",
					label: "Top-level division border",
					aka: "state border canton border prefecture border",
					reads: "a top-level division border",
					tagline: "Between Bundesländer, states, cantons",
					sizes: ANY,
				},
				{
					id: "border-division-2",
					label: "Second-level division border",
					aka: "county border district border",
					reads: "a second-level division border",
					tagline: "Between Landkreise, counties, districts",
					sizes: ANY,
				},
			],
		},
		{
			title: "Out in the open",
			options: [
				{
					id: "sea-level",
					label: "Sea level",
					aka: "altitude elevation height above sea",
					reads: "sea level",
					tagline: "Your altitude",
					rule: "This is a question about your altitude. Your phone's compass app gives a reading, and it is sometimes wrong — do not treat it as gospel.",
					sizes: ANY,
				},
				{
					id: "water",
					label: "Water",
					aka: "lake river sea canal body of water",
					reads: "a body of water",
					rule: "Any body of water named in your mapping app. Swimming pools do not count.",
					sizes: ANY,
				},
				{
					id: "coastline",
					label: "Coastline",
					aka: "coast shore beach seaside",
					reads: "the coastline",
					rule: "Any point where land meets the ocean, a great lake, or water joined to one of those by a channel that never narrows below 2 km.",
					sizes: ANY,
				},
				{
					id: "mountain",
					label: "Mountain",
					reads: "a mountain",
					rule: "Whatever the mapping app classifies as a mountain, measured from its icon.",
					sizes: ANY,
				},
				{
					id: "park",
					label: "Park",
					reads: "a park",
					rule: ICON_QUIRK,
					sizes: ANY,
				},
			],
		},
		{
			title: "Places",
			options: [
				{
					id: "amusement-park",
					label: "Amusement park",
					reads: "an amusement park",
					sizes: ANY,
				},
				{ id: "zoo", label: "Zoo", reads: "a zoo", sizes: ANY },
				{ id: "aquarium", label: "Aquarium", reads: "an aquarium", sizes: ANY },
				{
					id: "golf-course",
					label: "Golf course",
					reads: "a golf course",
					rule: GOLF_RULE,
					sizes: ANY,
				},
				{ id: "museum", label: "Museum", reads: "a museum", sizes: ANY },
				{
					id: "cinema",
					label: "Cinema",
					aka: "movie theater movie theatre pictures",
					reads: "a cinema",
					sizes: ANY,
				},
			],
		},
		{
			title: "Public services",
			options: [
				{ id: "hospital", label: "Hospital", reads: "a hospital", sizes: ANY },
				{ id: "library", label: "Library", reads: "a library", sizes: ANY },
				{
					id: "consulate",
					label: "Foreign consulate",
					aka: "embassy diplomatic mission",
					reads: "a foreign consulate",
					rule: CONSULATE_RULE,
					sizes: ANY,
				},
			],
		},
	],
};

const THERMOMETER: QuestionFamily = {
	id: "thermometer",
	name: "Thermometer",
	aka: "hotter colder warmer travel move direction",
	shorthand: "Move, then hotter or colder?",
	sentence: [
		{ kind: "text", text: "After travelling " },
		{ kind: "slot", slot: "subject" },
		{ kind: "text", text: ", am I hotter or colder?" },
	],
	answer: "Hotter or colder",
	minutes: { small: 5, medium: 5, large: 5 },
	draw: 2,
	keep: 1,
	sizes: ANY,
	rules: [
		"Hotter if where you ended up is nearer the hider than where you started; colder if it is not.",
		"The distance is measured as the crow flies, however far you actually travelled.",
	],
	steps: [
		"Tell the hider a thermometer is starting, and send where you are now.",
		"Travel at least the stated distance, then send where you ended up.",
	],
	groups: [
		{
			options: [
				{ id: "1km", label: "1 km", reads: "1 km", sizes: ANY },
				{ id: "5km", label: "5 km", reads: "5 km", sizes: ANY },
				{ id: "15km", label: "15 km", reads: "15 km", sizes: MEDIUM_UP },
				{ id: "75km", label: "75 km", reads: "75 km", sizes: LARGE_ONLY },
			],
		},
	],
};

const FRAMING_2M =
	"A 2 × 2 m area holding three distinct things — enough that somebody standing on that spot could match your photo and rule everywhere else out.";

const STATION_FRAMING =
	"Shoot from directly outside a station entrance; with several, pick whichever you like. Roof and both sides in frame, top in the upper third.";

const PHOTO: QuestionFamily = {
	id: "photo",
	name: "Photo",
	aka: "picture camera image shot",
	shorthand: "Send me a photo of ___.",
	sentence: [
		{ kind: "text", text: "Send me a photo of " },
		{ kind: "slot", slot: "subject" },
		{ kind: "text", text: "." },
	],
	answer: "A photo, or “I cannot answer”",
	minutes: { small: 10, medium: 10, large: 20 },
	draw: 1,
	keep: 1,
	sizes: ANY,
	rules: [
		"Every photo comes in the phone's normal aspect ratio.",
		"Seekers may not use Street View to read a photo or identify a station from it.",
		"“I cannot answer” is the honest answer when the subject is nowhere in the hiding zone.",
	],
	groups: [
		{
			options: [
				{
					id: "building-from-station",
					label: "A building visible from a transit station",
					reads: "a building visible from a transit station",
					rule: STATION_FRAMING,
					sizes: ANY,
				},
				{
					id: "widest-street",
					label: "The widest street",
					aka: "road avenue boulevard",
					reads: "the widest street",
					rule: "Both sides of the street in frame. No background needed.",
					sizes: ANY,
				},
				{
					id: "tree",
					label: "A tree",
					reads: "a tree",
					rule: "The whole tree in frame.",
					sizes: ANY,
				},
				{
					id: "tallest-structure",
					label: "The tallest structure in your sightline",
					reads: "the tallest structure in your sightline",
					rule: "Judged from where you stand, not by real height: a near block that looms larger than a far skyscraper is the right subject. Top and both sides in frame, top in the upper third.",
					sizes: ANY,
				},
				{
					id: "you",
					label: "You",
					aka: "selfie yourself portrait",
					reads: "you",
					rule: "Selfie mode, phone perpendicular to the ground, arm fully extended, default lens, no zoom.",
					sizes: ANY,
				},
				{
					id: "sky",
					label: "The sky",
					reads: "the sky",
					rule: "Phone flat on the ground shooting straight up, default lens, no zoom.",
					sizes: ANY,
				},
				{
					id: "tallest-building-from-station",
					label: "The tallest building visible from a transit station",
					reads: "the tallest building visible from a transit station",
					rule: `${STATION_FRAMING} The station building itself does not count, unless an unrelated tall building sits on top of it.`,
					sizes: MEDIUM_UP,
				},
				{
					id: "trace-street",
					label: "The nearest street or path, traced",
					reads: "the nearest street or path, traced",
					rule: "The street has to be visible in your mapping app; trace it from one intersection to the next.",
					sizes: MEDIUM_UP,
				},
				{
					id: "two-buildings",
					label: "Two buildings",
					reads: "two buildings",
					rule: "The bottom of the buildings and up to four storeys in frame.",
					sizes: MEDIUM_UP,
				},
				{
					id: "restaurant",
					label: "A restaurant, through the window",
					aka: "cafe diner bar interior",
					reads: "a restaurant interior",
					rule: "No zoom, and shot through the window from outside.",
					sizes: MEDIUM_UP,
				},
				{
					id: "park",
					label: "A park",
					reads: "a park",
					rule: "No zoom, phone perpendicular to the ground, standing at least 2 m clear of anything.",
					sizes: MEDIUM_UP,
				},
				{
					id: "supermarket-aisle",
					label: "A supermarket aisle",
					aka: "grocery store shop aisle",
					reads: "a supermarket aisle",
					rule: "No zoom. Stand at the end of the aisle and shoot straight down it.",
					sizes: MEDIUM_UP,
				},
				{
					id: "place-of-worship",
					label: "A place of worship",
					reads: "a place of worship",
					tagline: "2 × 2 m, three distinct things",
					rule: FRAMING_2M,
					sizes: MEDIUM_UP,
				},
				{
					id: "train-platform",
					label: "A train platform",
					reads: "a train platform",
					tagline: "2 × 2 m, three distinct things",
					rule: FRAMING_2M,
					sizes: MEDIUM_UP,
				},
				{
					id: "streets-traced",
					label: "1 km of streets, traced",
					reads: "1 km of streets, traced",
					tagline: "Five turns, no doubling back",
					rule: "Continuous, five turns, never doubling back, sent oriented north–south. Every street has to appear in the mapping app.",
					sizes: LARGE_ONLY,
				},
				{
					id: "tallest-mountain",
					label: "The tallest mountain from a transit station",
					reads: "the tallest mountain visible from a transit station",
					rule: "Tallest from your sightline, not the tallest there is. 3× zoom at most, summit in the upper third.",
					sizes: LARGE_ONLY,
				},
				{
					id: "biggest-water",
					label: "The biggest water in your zone",
					reads: "the biggest body of water in your zone",
					rule: "3× zoom at most, both shores or the horizon in frame. Water seen from the zone but not touching it does not count.",
					sizes: LARGE_ONLY,
				},
				{
					id: "five-buildings",
					label: "Five buildings",
					reads: "five buildings",
					rule: "The bottom of the buildings and up to four storeys in frame.",
					sizes: LARGE_ONLY,
				},
			],
		},
	],
};

const TENTACLE: QuestionFamily = {
	id: "tentacle",
	name: "Tentacle",
	aka: "nearest which one reach",
	shorthand: "Which ___ are you nearest to?",
	sentence: [
		{ kind: "text", text: "Within " },
		{ kind: "slot", slot: "radius" },
		{ kind: "text", text: " of me, which " },
		{ kind: "slot", slot: "subject" },
		{ kind: "text", text: " are you nearest to?" },
	],
	answer: "A name, or out of range",
	minutes: { small: 5, medium: 5, large: 5 },
	draw: 4,
	keep: 2,
	sizes: MEDIUM_UP,
	rules: [
		"Inside the radius the hider names the one they are nearest to. Outside it they say they are out of range — which still counts as answered, and still pays them.",
		"Whatever the mapping app categorises as one. The seekers asking resolve anything unclear.",
	],
	note: "Every one of them in range is a tentacle reaching out from you. One of them touches the hider and reports back.",
	groups: [
		{
			options: [
				{
					id: "museums",
					label: "Museums",
					reads: "museum",
					radius: "2 km",
					sizes: MEDIUM_UP,
				},
				{
					id: "libraries",
					label: "Libraries",
					reads: "library",
					radius: "2 km",
					sizes: MEDIUM_UP,
				},
				{
					id: "cinemas",
					label: "Cinemas",
					aka: "movie theaters movie theatres",
					reads: "cinema",
					radius: "2 km",
					sizes: MEDIUM_UP,
				},
				{
					id: "hospitals",
					label: "Hospitals",
					reads: "hospital",
					radius: "2 km",
					sizes: MEDIUM_UP,
				},
				{
					id: "metro-lines",
					label: "Metro lines",
					aka: "u-bahn subway underground tube lines",
					reads: "metro line",
					radius: "25 km",
					rule: "The coloured lines in your mapping app.",
					sizes: LARGE_ONLY,
				},
				{
					id: "zoos",
					label: "Zoos",
					reads: "zoo",
					radius: "25 km",
					sizes: LARGE_ONLY,
				},
				{
					id: "aquariums",
					label: "Aquariums",
					reads: "aquarium",
					radius: "25 km",
					sizes: LARGE_ONLY,
				},
				{
					id: "amusement-parks",
					label: "Amusement parks",
					reads: "amusement park",
					radius: "25 km",
					sizes: LARGE_ONLY,
				},
			],
		},
	],
};

/** In the order a seeker meets them: cheapest and bluntest first. */
export const QUESTION_FAMILIES: readonly QuestionFamily[] = [
	RADAR,
	MATCHING,
	MEASURING,
	THERMOMETER,
	PHOTO,
	TENTACLE,
];

export function questionFamily(id: QuestionFamilyId): QuestionFamily {
	const family = QUESTION_FAMILIES.find((candidate) => candidate.id === id);
	if (!family) throw new Error(`Unknown question family: ${id}`);
	return family;
}

export function isOnBoard(
	item: { readonly sizes: readonly BoardSize[] },
	size: BoardSize,
): boolean {
	return item.sizes.includes(size);
}

/**
 * Where something belongs, when it does not belong here — the line under the
 * dashed rule. Null when it is on this board and needs no explaining.
 */
export function sizeNote(
	item: { readonly sizes: readonly BoardSize[] },
	size: BoardSize,
): string | null {
	if (isOnBoard(item, size)) return null;
	const smallest = BOARD_SIZES.find((candidate) =>
		item.sizes.includes(candidate),
	);
	if (!smallest) return "Not in this game";
	if (item.sizes.length === 1) return `${NAMES[smallest]} boards only`;
	return `${NAMES[smallest]} boards and up`;
}

const NAMES: Readonly<Record<BoardSize, string>> = {
	small: "Small",
	medium: "Medium",
	large: "Large",
};

/** The smallest board something exists on: where it belongs, in one word. */
export function smallestBoardSize(item: {
	readonly sizes: readonly BoardSize[];
}): BoardSize {
	return (
		BOARD_SIZES.find((candidate) => item.sizes.includes(candidate)) ?? "large"
	);
}

export function boardSizeName(size: BoardSize): string {
	return NAMES[size];
}

/** Every option of a family, flattened out of its groups. */
export function familyOptions(
	family: QuestionFamily,
): readonly QuestionOption[] {
	return family.groups.flatMap((group) => group.options);
}

/**
 * The sentence with the picked option in it.
 *
 * An option the seeker fills in reads back what they typed, and stays a blank
 * until they have typed something — picking "a distance you choose" is not
 * yet a distance.
 *
 * A slot nobody has settled stays a blank — except tentacle's radius, which
 * the board can answer before anything is picked: every subject this board
 * carries is at the same distance, so the sentence can say so.
 */
export function readSentence(
	family: QuestionFamily,
	option: QuestionOption | null,
	size: BoardSize,
	/** What the seeker typed, where the picked option is one they fill in. */
	typed?: string,
): readonly ReadPart[] {
	const fallbackRadius = familyOptions(family).find(
		(candidate) => isOnBoard(candidate, size) && candidate.radius,
	)?.radius;

	return family.sentence.map((part): ReadPart => {
		if (part.kind === "text") return part;
		if (part.slot === "subject") {
			const reads = option?.custom ? typed : option?.reads;
			return reads
				? { kind: "filled", text: reads, picked: true }
				: { kind: "blank" };
		}
		const radius = option?.radius ?? fallbackRadius;
		if (!radius) return { kind: "blank" };
		return {
			kind: "filled",
			text: radius,
			picked: option?.radius !== undefined,
		};
	});
}

/** The sentence as one line of plain text — for search, and for a label. */
export function sentenceText(parts: readonly ReadPart[]): string {
	return parts
		.map((part) => (part.kind === "blank" ? "____" : part.text))
		.join("");
}

/** How many distinct questions a board of this size can ask. */
export function questionCount(size: BoardSize): number {
	return QUESTION_FAMILIES.filter((family) => isOnBoard(family, size)).reduce(
		(total, family) =>
			total +
			familyOptions(family).filter((option) => isOnBoard(option, size)).length,
		0,
	);
}
