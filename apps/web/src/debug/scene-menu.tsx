import { useState } from "react";
import { useNavigate } from "react-router";
import { type DevSceneSummary, listDevScenes, spawnDevScene } from "../api";
import { saveSession } from "../session";

const GROUP_LABEL: Record<DevSceneSummary["group"], string> = {
	lobby: "Lobby",
	hiding: "Hiding",
	seeking: "Seeking",
};

const GROUPS: readonly DevSceneSummary["group"][] = [
	"lobby",
	"hiding",
	"seeking",
];

/**
 * DEV-only catalog of named games. Collapsed so the real doors stay the page.
 * Vite drops this module from production because the start route only imports
 * it behind `import.meta.env.DEV`.
 */
export function SceneMenu() {
	const navigate = useNavigate();
	const [scenes, setScenes] = useState<DevSceneSummary[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState<string | null>(null);

	async function load(): Promise<void> {
		if (scenes || error) return;
		try {
			setScenes(await listDevScenes());
		} catch {
			setError("Could not load debug scenes.");
		}
	}

	async function spawn(id: string): Promise<void> {
		setPending(id);
		setError(null);
		try {
			const session = await spawnDevScene(id);
			saveSession(session);
			await navigate(session.path);
		} catch {
			setError("Could not open that scene.");
			setPending(null);
		}
	}

	return (
		<details
			className="rounded-tile border border-hairline-strong border-dashed bg-surface px-3 py-2.5"
			data-testid="debug-scenes"
			onToggle={(event) => {
				if (event.currentTarget.open) void load();
			}}
		>
			<summary className="cursor-pointer font-display font-extrabold text-[0.95rem] tracking-tight">
				Debug scenes
			</summary>
			<p className="eyebrow mt-1 text-ink-dim">
				Fresh game each tap. Other players are offline.
			</p>
			{error && <p className="mt-2 text-curse text-sm">{error}</p>}
			{scenes && (
				<div className="mt-3 space-y-3">
					{GROUPS.map((group) => {
						const items = scenes.filter((scene) => scene.group === group);
						if (items.length === 0) return null;
						return (
							<section key={group}>
								<h2 className="eyebrow mb-1.5">{GROUP_LABEL[group]}</h2>
								<ul className="space-y-1">
									{items.map((scene) => (
										<li key={scene.id}>
											<button
												className="flex w-full items-baseline justify-between gap-2 rounded-[11px] px-2 py-1.5 text-left transition-transform duration-[--dur-tap] ease-[--ease-pop] hover:bg-surface-raised active:scale-[0.98] disabled:opacity-45"
												data-testid={`debug-scene-${scene.id}`}
												disabled={pending !== null}
												onClick={() => void spawn(scene.id)}
												type="button"
											>
												<span className="min-w-0">
													<span className="block font-semibold text-sm leading-snug">
														{scene.label}
													</span>
													<span className="block text-[0.78rem] text-ink-dim leading-snug">
														{pending === scene.id ? "Opening…" : scene.hint}
													</span>
												</span>
											</button>
										</li>
									))}
								</ul>
							</section>
						);
					})}
				</div>
			)}
		</details>
	);
}
