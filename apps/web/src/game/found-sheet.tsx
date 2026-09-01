import { useQuery, useZero } from "@rocicorp/zero/react";
import { mutators, queries } from "@zero-lag/schema";
import { ActionButton } from "@zero-lag/ui/components/action-button";
import { Sheet } from "@zero-lag/ui/components/sheet";
import { Surface } from "@zero-lag/ui/components/surface";
import { useState } from "react";
import { uploadPhoto } from "../api";
import { COMPACT_SECONDARY } from "../map/map-bar";
import type { MyRole } from "./use-role";

interface SeekerActionsSheetProps {
	readonly open: boolean;
	readonly found: boolean;
	readonly canAsk?: boolean;
	readonly canMarkFound?: boolean;
	readonly onClose: () => void;
	readonly onFoundThem: () => void;
	readonly onUndoFound: () => void;
	readonly onNarrowDown: () => void;
	readonly onAsk: () => void;
}

/** Found them first; ask is last, and opens the question board. */
export function SeekerActionsSheet({
	open,
	found,
	canAsk = true,
	canMarkFound = true,
	onClose,
	onFoundThem,
	onUndoFound,
	onNarrowDown,
	onAsk,
}: SeekerActionsSheetProps) {
	return (
		<Sheet
			onClose={onClose}
			open={open}
			testId="seeker-actions"
			title="What now?"
		>
			{canMarkFound &&
				(found ? (
					<ActionButton
						data-testid="unmark-found"
						onClick={onUndoFound}
						tone="secondary"
					>
						Undo found
					</ActionButton>
				) : (
					<ActionButton
						data-testid="found-them"
						onClick={onFoundThem}
						tone="secondary"
					>
						Found them!
					</ActionButton>
				))}
			<ActionButton
				data-testid="narrow-it-down"
				onClick={onNarrowDown}
				tone="secondary"
			>
				Narrow it down
			</ActionButton>
			<ActionButton
				data-testid="ask-question"
				disabled={!canAsk}
				onClick={onAsk}
			>
				Ask a question
			</ActionButton>
		</Sheet>
	);
}

interface FoundCardProps {
	readonly role: MyRole;
	readonly token: string;
	readonly hiderTeamId: string | null;
	readonly onCancel: () => void;
}

/** Confirm a find, with an optional photo. */
export function FoundCard({
	role,
	token,
	hiderTeamId,
	onCancel,
}: FoundCardProps) {
	const zero = useZero();
	const [rounds] = useQuery(queries.rounds());
	const [uploading, setUploading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [file, setFile] = useState<File | null>(null);

	const round = rounds.find((candidate) => candidate.id === role.roundId);
	const seekerTeamId = role.teamId;
	const canConfirm =
		round?.status === "seeking" &&
		hiderTeamId !== null &&
		seekerTeamId !== null &&
		!uploading;

	async function confirm() {
		if (!round || !hiderTeamId || !seekerTeamId) return;
		setUploading(true);
		setError(null);
		let photoId: string | undefined;
		if (file) {
			try {
				photoId = (await uploadPhoto(file, token)).id;
			} catch {
				setError("The photo could not be uploaded. The found mark is saved.");
			}
		}
		void zero.mutate(
			mutators.round.markFound({
				eventId: crypto.randomUUID(),
				roundId: round.id,
				hiderTeamId,
				seekerTeamId,
				...(photoId ? { photoId } : {}),
			}),
		);
		setUploading(false);
		onCancel();
	}

	return (
		<Surface
			className="pointer-events-auto w-full px-3 py-2.5"
			data-testid="found-sheet"
			raised
		>
			<span className="eyebrow block">Found them</span>
			<p className="font-medium text-sm leading-snug">
				Optionally attach a photo. Coordinates are stripped before it is stored.
			</p>
			<label className="mt-2 flex min-h-11 cursor-pointer items-center justify-center rounded-control border-2 border-hairline-strong border-dashed px-3 text-sm">
				{file ? file.name : "Attach a photo (optional)"}
				<input
					accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
					capture="environment"
					className="sr-only"
					data-testid="found-photo"
					disabled={uploading}
					onChange={(event) => {
						setFile(event.target.files?.[0] ?? null);
					}}
					type="file"
				/>
			</label>
			{error && (
				<p className="mt-2 text-danger text-sm" role="alert">
					{error}
				</p>
			)}
			<div className="mt-2 flex items-stretch gap-2">
				<ActionButton
					className={COMPACT_SECONDARY}
					data-testid="found-cancel"
					inline
					onClick={onCancel}
					size="comfortable"
					tone="secondary"
					type="button"
				>
					Cancel
				</ActionButton>
				<ActionButton
					className="w-auto min-w-0 flex-1"
					data-testid="mark-found"
					disabled={!canConfirm}
					onClick={() => void confirm()}
					size="comfortable"
				>
					{uploading ? "Saving…" : "Confirm"}
				</ActionButton>
			</div>
		</Surface>
	);
}
