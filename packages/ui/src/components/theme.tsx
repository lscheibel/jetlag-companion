import {
	THEME_STORAGE_KEY,
	type ThemePreference,
	useTheme,
} from "../hooks/use-theme";
import { cn } from "../lib/utils";

/**
 * Applies the stored theme before the first paint.
 *
 * Without this, a phone set to dark opens every session on a white flash — which
 * outdoors at night is not a cosmetic problem. It has to be a blocking inline
 * script in the document head; there is no React-shaped way to run earlier than
 * React.
 */
export function ThemeScript() {
	const script = `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
	// biome-ignore lint/security/noDangerouslySetInnerHtml: a fixed string with no interpolated input, and it must run before hydration
	return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

const OPTIONS: readonly {
	value: ThemePreference;
	label: string;
	glyph: string;
}[] = [
	{ value: "light", label: "Light", glyph: "☀" },
	{ value: "system", label: "Auto", glyph: "◐" },
	{ value: "dark", label: "Dark", glyph: "☾" },
];

interface ThemeToggleProps {
	className?: string;
}

/**
 * Three targets, no menu. A theme switch that costs two taps and a menu is one
 * people give up on with one hand on a handrail.
 */
export function ThemeToggle({ className }: ThemeToggleProps) {
	const { preference, setPreference } = useTheme();

	return (
		<fieldset
			className={cn(
				"flex gap-1 rounded-chip border border-hairline bg-surface p-1",
				className,
			)}
			data-testid="theme-toggle"
		>
			<legend className="sr-only">Appearance</legend>
			{OPTIONS.map((option) => {
				const selected = option.value === preference;
				return (
					<label
						className={cn(
							"grid size-9 cursor-pointer place-items-center rounded-chip text-base",
							"transition-transform duration-[--dur-press] ease-[--ease-pop] active:scale-90",
							"has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
							selected ? "bg-action text-action-ink" : "text-ink-dim",
						)}
						data-testid={`theme-${option.value}`}
						key={option.value}
					>
						<input
							checked={selected}
							className="sr-only"
							name="appearance"
							onChange={() => setPreference(option.value)}
							type="radio"
							value={option.value}
						/>
						<span aria-hidden>{option.glyph}</span>
						<span className="sr-only">{option.label}</span>
					</label>
				);
			})}
		</fieldset>
	);
}
