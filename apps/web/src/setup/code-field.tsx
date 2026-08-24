import { cn } from "@zero-lag/ui/lib/utils";
import { type ReactNode, useId } from "react";
import { JOIN_CODE_LENGTH, normalizeJoinCode } from "./join-code";

/**
 * The join code, as one big box per character.
 *
 * A single text field would be smaller, and unreadable: a half-typed code has
 * to stay legible at arm's length on a platform, and a box that is still empty
 * has to say so without being read. The real input is a normal `<input>` lying
 * invisibly over the boxes, so the phone's keyboard, autofill and paste all
 * work exactly as they do everywhere else — only the drawing is ours.
 */

interface CodeFieldProps {
	value: string;
	onChange: (value: string) => void;
	label: ReactNode;
	/** What to fix, in the player's words. */
	problem?: ReactNode;
}

export function CodeField({ value, onChange, label, problem }: CodeFieldProps) {
	const id = useId();
	const noteId = problem ? `${id}-note` : undefined;

	return (
		<div className="flex flex-col gap-2">
			<label className="eyebrow" htmlFor={id}>
				{label}
			</label>

			<div className="relative">
				<input
					aria-describedby={noteId}
					aria-invalid={problem ? true : undefined}
					autoCapitalize="characters"
					autoComplete="off"
					autoCorrect="off"
					// The keyboard is the first thing this screen needs; the code is
					// the only thing on it.
					// biome-ignore lint/a11y/noAutofocus: a single-field step, opened on purpose
					autoFocus
					className="peer absolute inset-0 z-10 h-full w-full cursor-text opacity-0 outline-none"
					data-testid="join-code"
					id={id}
					inputMode="text"
					maxLength={JOIN_CODE_LENGTH}
					onChange={(event) => onChange(normalizeJoinCode(event.target.value))}
					spellCheck={false}
					type="text"
					value={value}
				/>
				<div
					aria-hidden
					className={cn(
						"grid gap-1.5 rounded-[20px]",
						"peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-focus peer-focus-visible:outline-offset-4",
					)}
					style={{
						gridTemplateColumns: `repeat(${JOIN_CODE_LENGTH}, minmax(0, 1fr))`,
					}}
				>
					{Array.from({ length: JOIN_CODE_LENGTH }, (_, index) => {
						const character = value[index];
						// The box the next character lands in, which is where the caret
						// would be if the platform were drawing one.
						const live = index === value.length;
						return (
							<div
								className={cn(
									"grid aspect-square place-items-center rounded-[18px] border-2 bg-surface",
									"font-bold font-mono text-2xl",
									character
										? "zl-pop border-hairline-strong text-ink"
										: "border-hairline-strong border-dashed text-ink-faint",
									problem && "border-danger",
									live && !problem && "border-action",
								)}
								// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length positions, not a list
								key={index}
							>
								{character ?? (live ? <Caret /> : "")}
							</div>
						);
					})}
				</div>
			</div>

			{problem && (
				<p className="px-1 text-danger text-xs leading-snug" id={noteId}>
					{problem}
				</p>
			)}
		</div>
	);
}

function Caret() {
	return <span className="zl-caret block h-7 w-0.5 rounded-full bg-action" />;
}
