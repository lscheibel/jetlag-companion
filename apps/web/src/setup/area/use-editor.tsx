import { useQuery } from "@rocicorp/zero/react";
import {
	foldPieces,
	nameFromPieces,
	piecesFromSelection,
	suggestScalePreset,
} from "@zero-lag/catalog";
import {
	isEmptyRegion,
	type LngLat,
	type MultiPolygon,
	multiPolygonBBox,
	multiPolygonToRegion,
	type Region,
	regionArea,
	regionContains,
	regionToMultiPolygon,
	subtractRegions,
	unionRegions,
} from "@zero-lag/geo";
import {
	type AreaPiece,
	type AreaPieceSource,
	queries,
} from "@zero-lag/schema";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { useNavigate } from "react-router";
import { applyMap, type CatalogStopRow } from "../../builder/api";
import { useGameShell } from "../../game/shell";
import { useSetup } from "../wizard";
import { useCatalogStops } from "./use-catalog-stops";

export type EditorCamera = {
	readonly center: LngLat;
	readonly zoom: number;
	readonly bearing: number;
	readonly pitch: number;
};

export interface AreaEditor {
	readonly pieces: readonly AreaPiece[];
	readonly cut: boolean;
	readonly fold: Region;
	readonly foldMulti: MultiPolygon;
	readonly squareMeters: number;
	readonly name: string;
	readonly empty: boolean;
	readonly stopsInside: number;
	readonly insideStops: readonly CatalogStopRow[];
	/** Null while every mode in the area counts. */
	readonly inPlayModeIds: readonly string[] | null;
	readonly catalogStops: readonly CatalogStopRow[];
	readonly ready: boolean;
	readonly busy: boolean;
	readonly problem: string | null;
	readonly code: string;
	setCut: (cut: boolean) => void;
	addGeometry: (input: {
		source: AreaPieceSource;
		name: string;
		geometry: MultiPolygon;
	}) => void;
	removePiece: (id: string) => void;
	movePiece: (id: string, direction: -1 | 1) => void;
	setPieceOp: (id: string, op: "add" | "subtract") => void;
	wouldBecome: (
		geometry: MultiPolygon,
		op: "add" | "subtract",
	) => { squareMeters: number };
	/** True while the pieces differ from the last applied board. */
	readonly dirty: boolean;
	readonly camera: EditorCamera | null;
	setCamera: (camera: EditorCamera) => void;
	/** Apply if needed, then leave the editor. Pass a path to go somewhere else. */
	applyArea: (next?: string) => void;
}

const AreaEditorContext = createContext<AreaEditor | null>(null);

export function useAreaEditor(): AreaEditor {
	const value = useContext(AreaEditorContext);
	if (!value) throw new Error("useAreaEditor outside AreaEditorProvider");
	return value;
}

export function AreaEditorProvider({ children }: { children: ReactNode }) {
	const navigate = useNavigate();
	const { session } = useGameShell();
	const setup = useSetup();
	const [games] = useQuery(queries.game());
	const config = games[0]?.mapConfig ?? null;

	const [pieces, setPieces] = useState<AreaPiece[] | null>(null);
	const [appliedSignature, setAppliedSignature] = useState<string | null>(null);
	const [cut, setCut] = useState(false);
	const [busy, setBusy] = useState(false);
	const [problem, setProblem] = useState<string | null>(null);
	const [pendingHash, setPendingHash] = useState<string | null>(null);
	const [afterApply, setAfterApply] = useState<string | null>(null);
	const [camera, setCamera] = useState<EditorCamera | null>(null);

	useEffect(() => {
		if (pieces || !config) return;
		const loaded = piecesFromSelection(
			config.selection,
			config.name,
			crypto.randomUUID(),
		);
		setPieces(loaded);
		setAppliedSignature(pieceSignature(loaded));
	}, [config, pieces]);

	const list = pieces ?? [];
	const fold = useMemo(() => foldPieces(list), [list]);
	const foldMulti = useMemo(() => regionToMultiPolygon(fold), [fold]);
	const squareMeters = useMemo(() => regionArea(fold), [fold]);
	const name = useMemo(() => nameFromPieces(list), [list]);
	const empty = isEmptyRegion(fold);
	const ready = pieces !== null;

	const requestBounds = useMemo(() => multiPolygonBBox(foldMulti), [foldMulti]);

	const catalog = useCatalogStops(session, requestBounds);
	const insideStops = useMemo(
		() =>
			catalog.stops.filter((stop) =>
				regionContains(fold, [stop.lng, stop.lat]),
			),
		[catalog.stops, fold],
	);
	const stopsInside = insideStops.length;
	const inPlayModeIds = setup.selectedModes ?? config?.modeIds ?? null;

	useEffect(() => {
		if (!pendingHash || !config) return;
		if (config.contentHash !== pendingHash) return;
		setPendingHash(null);
		setBusy(false);
		if (pieces) setAppliedSignature(pieceSignature(pieces));
		void navigate(afterApply ?? `/g/${session.code}/setup/area`);
	}, [pendingHash, config, navigate, session.code, afterApply, pieces]);

	const wouldBecome = useCallback(
		(
			geometry: MultiPolygon,
			op: "add" | "subtract",
		): { squareMeters: number } => {
			const next =
				op === "add"
					? unionRegions(fold, multiPolygonToRegion(geometry))
					: subtractRegions(fold, multiPolygonToRegion(geometry));
			return { squareMeters: regionArea(next) };
		},
		[fold],
	);

	const value = useMemo<AreaEditor>(() => {
		return {
			pieces: list,
			cut,
			fold,
			foldMulti,
			squareMeters,
			name,
			empty,
			stopsInside,
			insideStops,
			inPlayModeIds,
			catalogStops: catalog.stops,
			ready,
			busy,
			problem,
			code: session.code,
			setCut,
			addGeometry: (input) => {
				setPieces((current) =>
					current
						? [
								...current,
								{
									id: crypto.randomUUID(),
									op: cut ? "subtract" : "add",
									source: input.source,
									name: input.name.slice(0, 80),
									geometry: input.geometry,
								},
							]
						: current,
				);
				setCut(false);
			},
			removePiece: (id) =>
				setPieces((current) =>
					current ? current.filter((piece) => piece.id !== id) : current,
				),
			setPieceOp: (id, op) =>
				setPieces((current) =>
					current
						? current.map((piece) =>
								piece.id === id ? { ...piece, op } : piece,
							)
						: current,
				),
			movePiece: (id, direction) =>
				setPieces((current) => {
					if (!current) return current;
					const index = current.findIndex((piece) => piece.id === id);
					const next = index + direction;
					if (index < 0 || next < 0 || next >= current.length) return current;
					const copy = [...current];
					const [moved] = copy.splice(index, 1);
					if (!moved) return current;
					copy.splice(next, 0, moved);
					return copy;
				}),
			dirty:
				appliedSignature !== null && pieceSignature(list) !== appliedSignature,
			camera,
			setCamera,
			wouldBecome,
			applyArea: (next = `/g/${session.code}/setup/area`) => {
				if (!pieces || empty || busy) return;
				if (
					appliedSignature !== null &&
					pieceSignature(list) === appliedSignature
				) {
					void navigate(next);
					return;
				}
				setBusy(true);
				setProblem(null);
				setAfterApply(next);
				const bbox = multiPolygonBBox(foldMulti);
				const scalePreset = bbox ? suggestScalePreset(bbox) : "city";
				void (async () => {
					try {
						const result = await applyMap(session, {
							name,
							scalePreset,
							pieces,
							modeIds: setup.selectedModes ?? config?.modeIds ?? undefined,
						});
						setPendingHash(result.contentHash);
					} catch (cause) {
						setBusy(false);
						setProblem(
							cause instanceof Error && cause.message === "empty_area"
								? "That area has nothing in it. Add something back."
								: "Could not save the area. Check your signal and try again.",
						);
					}
				})();
			},
		};
	}, [
		list,
		pieces,
		ready,
		cut,
		fold,
		foldMulti,
		squareMeters,
		name,
		empty,
		stopsInside,
		insideStops,
		inPlayModeIds,
		catalog.stops,
		busy,
		problem,
		session,
		setup.selectedModes,
		config?.modeIds,
		appliedSignature,
		navigate,
		wouldBecome,
		camera,
	]);

	return (
		<AreaEditorContext.Provider value={value}>
			{children}
		</AreaEditorContext.Provider>
	);
}

function pieceSignature(pieces: readonly AreaPiece[]): string {
	return pieces
		.map((piece) => `${piece.id}:${piece.op}:${piece.name}`)
		.join("|");
}
