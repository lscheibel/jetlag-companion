import { TabBar, type TabItem } from "@zero-lag/ui/components/tab-bar";
import { useLocation, useNavigate } from "react-router";

/**
 * The three places a game has, wired to the three routes that are places
 * rather than steps. m5-spec §11.
 */

const TABS: readonly TabItem[] = [
	{ id: "lobby", label: "Lobby", icon: "◈" },
	{ id: "rules", label: "Rules", icon: "✎" },
	{ id: "map", label: "Map", icon: "◍" },
];

interface GameTabsProps {
	code: string;
	/** The map is full-bleed and has no column to sit at the end of. */
	className?: string;
}

export function GameTabs({ code, className }: GameTabsProps) {
	const navigate = useNavigate();
	const { pathname } = useLocation();

	const current = pathname.endsWith("/rules")
		? "rules"
		: pathname.endsWith("/map")
			? "map"
			: "lobby";

	return (
		<TabBar
			className={className}
			current={current}
			items={TABS}
			onSelect={(id) =>
				void navigate(id === "lobby" ? `/g/${code}` : `/g/${code}/${id}`)
			}
		/>
	);
}
