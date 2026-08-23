import { useCallback, useEffect, useState } from "react";

/**
 * Light and dark, plus following the phone.
 *
 * Three states rather than two, because "follow the system" is the setting most
 * people are actually on, and a toggle that silently pins one of them is a
 * toggle that surprises somebody at sunset. The document carries an explicit
 * choice as `data-theme`; system leaves the attribute off entirely, which is
 * what the stylesheet's media query is waiting for.
 */

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "zero-lag:theme";

function isPreference(value: string | null): value is ThemePreference {
	return value === "system" || value === "light" || value === "dark";
}

export function readPreference(): ThemePreference {
	if (typeof localStorage === "undefined") return "system";
	const stored = localStorage.getItem(THEME_STORAGE_KEY);
	return isPreference(stored) ? stored : "system";
}

export function applyPreference(preference: ThemePreference): void {
	const root = document.documentElement;
	if (preference === "system") root.removeAttribute("data-theme");
	else root.setAttribute("data-theme", preference);
}

function systemTheme(): ResolvedTheme {
	if (typeof matchMedia === "undefined") return "light";
	return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

interface UseTheme {
	preference: ThemePreference;
	/** What is actually on screen once "system" is resolved. */
	resolved: ResolvedTheme;
	setPreference: (preference: ThemePreference) => void;
}

export function useTheme(): UseTheme {
	const [preference, setStored] = useState<ThemePreference>(readPreference);
	const [system, setSystem] = useState<ResolvedTheme>(systemTheme);

	// Subscribing to an external system — the OS appearance setting — which is
	// what an effect is for. The resolved value below is derived, not stored.
	useEffect(() => {
		if (typeof matchMedia === "undefined") return;
		const query = matchMedia("(prefers-color-scheme: dark)");
		const onChange = (event: MediaQueryListEvent) => {
			setSystem(event.matches ? "dark" : "light");
		};
		query.addEventListener("change", onChange);
		return () => query.removeEventListener("change", onChange);
	}, []);

	const setPreference = useCallback((next: ThemePreference) => {
		setStored(next);
		applyPreference(next);
		if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
		else localStorage.setItem(THEME_STORAGE_KEY, next);
	}, []);

	return {
		preference,
		resolved: preference === "system" ? system : preference,
		setPreference,
	};
}
