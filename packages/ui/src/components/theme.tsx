import {
	THEME_STORAGE_KEY,
	type ThemePreference,
	useTheme,
} from "../hooks/use-theme";
import { cn } from "../lib/utils";
import { Icon, type IconName } from "./icon";
import { SegmentedControl, type SegmentOption } from "./segmented-control";

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

const GLYPHS: Record<ThemePreference, IconName> = {
	light: "sun",
	system: "circle-half",
	dark: "moon",
};

const OPTIONS: readonly SegmentOption<ThemePreference>[] = (
	["light", "system", "dark"] as const
).map((value) => ({
	value,
	label: <Icon name={GLYPHS[value]} size="sm" />,
	srLabel: value === "system" ? "Follow the system" : value,
}));

interface ThemeToggleProps {
	className?: string;
}

/**
 * Three targets, no menu — the one shipped instance of `SegmentedControl`.
 * A theme switch that costs two taps and a menu is one people give up on with
 * one hand on a handrail.
 */
export function ThemeToggle({ className }: ThemeToggleProps) {
	const { preference, setPreference } = useTheme();

	return (
		<SegmentedControl
			className={cn("max-w-44", className)}
			label="Appearance"
			onChange={setPreference}
			options={OPTIONS}
			testId="theme-toggle"
			value={preference}
		/>
	);
}
