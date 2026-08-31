import { ModeBadge } from "../setup/mode-badge";
import { POI_KIND_COLORS } from "./poi";
import { isStationType, type PoiTypeId } from "./poi-type";

/**
 * How a type of place introduces itself in a list: the signage letter for a
 * station type, the map's own dot colour for an amenity kind. Shared so the
 * layer picker and the point picker never disagree about what a museum looks
 * like.
 */
export function PoiTypeGlyph({ type }: { readonly type: PoiTypeId }) {
	if (isStationType(type)) return <ModeBadge modeId={type} />;
	return (
		<span
			aria-hidden
			className="size-3.5 shrink-0 rounded-full"
			style={{ backgroundColor: POI_KIND_COLORS[type] }}
		/>
	);
}
