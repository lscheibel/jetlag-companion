import type { Transition, Variants } from "motion/react";

/**
 * Shared transitions for Motion, matching the easings in styles/motion.css.
 *
 * Components import these rather than writing spring configs inline, for the
 * same reason colours come from tokens: a screenful of separately tuned
 * animations reads as noise, and the fix is one vocabulary rather than fifteen
 * tasteful decisions.
 */

/** Overshoot. Presses, pops, a card landing in a hand. */
export const pop: Transition = {
	type: "spring",
	stiffness: 520,
	damping: 28,
	mass: 0.7,
};

/** Decisive, no bounce. Entrances, exits, anything carrying information. */
export const glide: Transition = {
	type: "spring",
	stiffness: 320,
	damping: 34,
	mass: 0.9,
};

/** A sheet arriving from the bottom edge; slower, because it covers content. */
export const sheetSpring: Transition = {
	type: "spring",
	stiffness: 260,
	damping: 30,
	mass: 1,
};

/** Immediate feedback under a thumb. Never a spring — a press is not playful. */
export const press: Transition = { duration: 0.12, ease: [0.2, 0.9, 0.25, 1] };

/**
 * Entrances for a list whose items arrive together. The container staggers,
 * each child rises. Used by team lists, question catalogs, constraint lists —
 * anywhere a screen fills with rows that were fetched as a set.
 */
export const listContainer: Variants = {
	hidden: {},
	shown: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

export const listItem: Variants = {
	hidden: { opacity: 0, y: 14 },
	shown: { opacity: 1, y: 0, transition: glide },
};

/** A panel or sheet that slides up from the bottom of the screen. */
export const riseFromBottom: Variants = {
	hidden: { y: "100%" },
	shown: { y: 0, transition: sheetSpring },
	leaving: {
		y: "100%",
		transition: { duration: 0.2, ease: [0.6, 0, 0.9, 0.3] },
	},
};

/** A scrim behind a sheet. Fades only — a blurring scrim costs frames. */
export const scrimFade: Variants = {
	hidden: { opacity: 0 },
	shown: { opacity: 1, transition: { duration: 0.2 } },
	leaving: { opacity: 0, transition: { duration: 0.15 } },
};

/** Something arriving that the player did not ask for: a notice, a toast. */
export const noticeArrive: Variants = {
	hidden: { opacity: 0, y: 18, scale: 0.98 },
	shown: { opacity: 1, y: 0, scale: 1, transition: pop },
	leaving: { opacity: 0, y: 10, transition: { duration: 0.16 } },
};

/**
 * The stand-in when the player has asked for reduced motion: things appear
 * where they belong instead of travelling there. One shared set rather than a
 * transformer over the others, so what a reduced-motion player sees is written
 * down and reviewable rather than derived.
 */
export const fadeOnly: Variants = {
	hidden: { opacity: 0 },
	shown: { opacity: 1, transition: { duration: 0.12 } },
	leaving: { opacity: 0, transition: { duration: 0.1 } },
};
