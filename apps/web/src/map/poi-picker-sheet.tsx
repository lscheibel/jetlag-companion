import { POI_KIND_LABELS, POI_KINDS, type PoiKind } from "@zero-lag/catalog";
import { Checkbox } from "@zero-lag/ui/components/checkbox";
import { Sheet } from "@zero-lag/ui/components/sheet";
import { POI_KIND_COLORS, type PoiLayerState, togglePoiKind } from "./poi";

interface PoiPickerSheetProps {
	readonly open: boolean;
	readonly onClose: () => void;
	readonly layers: PoiLayerState;
	readonly onChange: (next: PoiLayerState) => void;
}

/**
 * What to plot: transit stops plus the OSM amenity kinds. Local to this phone
 * — a view filter, not a house rule.
 */
export function PoiPickerSheet({
	open,
	onClose,
	layers,
	onChange,
}: PoiPickerSheetProps) {
	return (
		<Sheet
			onClose={onClose}
			open={open}
			testId="poi-picker-sheet"
			title="Points of interest"
		>
			<div className="flex flex-col gap-2">
				<Checkbox
					checked={layers.transit}
					label="Transit stops"
					onChange={() => onChange({ ...layers, transit: !layers.transit })}
					testId="poi-layer-transit"
				/>
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
			label={POI_KIND_LABELS[kind]}
			leading={<KindSwatch kind={kind} />}
			onChange={onToggle}
			testId={`poi-layer-${kind}`}
		/>
	);
}

function KindSwatch({ kind }: { readonly kind: PoiKind }) {
	return (
		<span
			aria-hidden
			className="size-3.5 shrink-0 rounded-full"
			style={{ backgroundColor: POI_KIND_COLORS[kind] }}
		/>
	);
}
