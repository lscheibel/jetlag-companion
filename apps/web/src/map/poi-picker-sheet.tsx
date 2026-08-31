import { type ModeId, POI_KINDS, type PoiKind } from "@zero-lag/catalog";
import { Checkbox } from "@zero-lag/ui/components/checkbox";
import { Sheet } from "@zero-lag/ui/components/sheet";
import {
	type PoiLayerState,
	poiModeOn,
	togglePoiKind,
	togglePoiMode,
} from "./poi";
import { poiTypeLabel } from "./poi-type";
import { PoiTypeGlyph } from "./poi-type-glyph";

interface PoiPickerSheetProps {
	readonly open: boolean;
	readonly onClose: () => void;
	readonly layers: PoiLayerState;
	readonly onChange: (next: PoiLayerState) => void;
	/** The station types this board carries, in signage order. */
	readonly modes: readonly ModeId[];
}

/**
 * What to plot: station types plus the OSM amenity kinds. Local to this phone
 * — a view filter, not a house rule.
 *
 * The stations are listed one type at a time rather than as a single "transit
 * stops" row, because a board with 4,000 bus stops on it is a different map
 * from the same board showing only the U-Bahn, and picking between them is
 * exactly what this sheet is for. Only the types the board actually carries
 * appear: a mode nobody can catch here is not a decision worth offering.
 */
export function PoiPickerSheet({
	open,
	onClose,
	layers,
	onChange,
	modes,
}: PoiPickerSheetProps) {
	return (
		<Sheet
			onClose={onClose}
			open={open}
			testId="poi-picker-sheet"
			title="Points of interest"
		>
			<div className="flex flex-col gap-2">
				{modes.map((modeId) => (
					<ModeRow
						checked={poiModeOn(layers, modeId)}
						key={modeId}
						modeId={modeId}
						onToggle={() => onChange(togglePoiMode(layers, modeId, modes))}
					/>
				))}
				{POI_KINDS.map((kind) => (
					<KindRow
						checked={layers.kinds.includes(kind)}
						kind={kind}
						key={kind}
						onToggle={() => onChange(togglePoiKind(layers, kind))}
					/>
				))}
			</div>
		</Sheet>
	);
}

function ModeRow({
	modeId,
	checked,
	onToggle,
}: {
	readonly modeId: ModeId;
	readonly checked: boolean;
	readonly onToggle: () => void;
}) {
	return (
		<Checkbox
			checked={checked}
			label={poiTypeLabel(modeId)}
			leading={<PoiTypeGlyph type={modeId} />}
			onChange={onToggle}
			testId={`poi-layer-mode-${modeId}`}
		/>
	);
}

function KindRow({
	kind,
	checked,
	onToggle,
}: {
	readonly kind: PoiKind;
	readonly checked: boolean;
	readonly onToggle: () => void;
}) {
	return (
		<Checkbox
			checked={checked}
			label={poiTypeLabel(kind)}
			leading={<PoiTypeGlyph type={kind} />}
			onChange={onToggle}
			testId={`poi-layer-${kind}`}
		/>
	);
}
