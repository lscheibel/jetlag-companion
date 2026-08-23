import { useQuery } from "@rocicorp/zero/react";
import { queries } from "@zero-lag/schema";
import { useMemo } from "react";
import { type SearchArea, survivingSearchArea } from "./search-area";

export function useSearchArea(hiderTeamId: string | null): SearchArea {
	const [games] = useQuery(queries.game());
	const [constraints] = useQuery(queries.constraints());
	const seed = games[0]?.mapConfig?.validHidingArea ?? null;
	return useMemo(
		() => survivingSearchArea(seed, constraints, hiderTeamId),
		[seed, constraints, hiderTeamId],
	);
}
