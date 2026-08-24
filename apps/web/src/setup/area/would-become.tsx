import type { MultiPolygon } from "@zero-lag/geo";
import { useDeferredValue, useMemo } from "react";
import { formatArea } from "../../builder/use-builder";
import { useAreaEditor } from "./use-editor";

interface WouldBecomeProps {
	readonly geometry: MultiPolygon | null;
	readonly op: "add" | "subtract";
}

/**
 * Area-after-this-piece, off the urgent path. Unioning the fold (and counting
 * ground) is too much work to do on every radius drag; a deferred child lets
 * the map keep the handles moving and catches the number up a frame later.
 */
export function WouldBecome({ geometry, op }: WouldBecomeProps) {
	const { wouldBecome } = useAreaEditor();
	const deferred = useDeferredValue(geometry);
	const pending = deferred !== geometry;
	const preview = useMemo(
		() => (deferred ? wouldBecome(deferred, op) : null),
		[deferred, wouldBecome, op],
	);

	if (!preview) return null;
	return (
		<span className={pending ? "opacity-55" : undefined}>
			Would become {formatArea(preview.squareMeters)}
		</span>
	);
}
