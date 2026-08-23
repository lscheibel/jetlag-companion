import { useQuery, useZero } from "@rocicorp/zero/react";
import { mutators, queries } from "@zero-lag/schema";
import { useState } from "react";
import { uploadPhoto } from "../api";
import type { MyRole } from "./use-role";

interface FoundSheetProps {
	role: MyRole;
	token: string;
}

export function FoundSheet({ role, token }: FoundSheetProps) {
	const zero = useZero();
	const [rounds] = useQuery(queries.rounds());
	const [teams] = useQuery(queries.teams());
	const [outcomes] = useQuery(queries.hiderOutcomes());
	const [hiderId, setHiderId] = useState("");
	const [seekerId, setSeekerId] = useState("");
	const [uploading, setUploading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const round = rounds.find((candidate) => candidate.id === role.roundId);
	if (round?.status !== "seeking") return null;

	const hiderRoles = round.roles.filter(
		(assignment) => assignment.role === "hider",
	);
	const seekerRoles = round.roles.filter(
		(assignment) => assignment.role === "seeker",
	);
	const selectedHiderId = hiderId || (hiderRoles[0]?.teamId ?? "");
	const ownSeeker = seekerRoles.find(
		(assignment) => assignment.teamId === role.teamId,
	);
	const selectedSeekerId =
		seekerId || ownSeeker?.teamId || (seekerRoles[0]?.teamId ?? "");
	const outcome = outcomes.find(
		(value) =>
			value.roundId === round.id && value.hiderTeamId === selectedHiderId,
	);

	const mark = (photoId?: string) => {
		if (!selectedHiderId || !selectedSeekerId) return;
		void zero.mutate(
			mutators.round.markFound({
				eventId: crypto.randomUUID(),
				roundId: round.id,
				hiderTeamId: selectedHiderId,
				seekerTeamId: selectedSeekerId,
				...(photoId ? { photoId } : {}),
			}),
		);
	};

	async function attach(file: File) {
		setUploading(true);
		setError(null);
		try {
			const uploaded = await uploadPhoto(file, token);
			mark(uploaded.id);
		} catch {
			setError("The photo could not be uploaded. The found mark is saved.");
		} finally {
			setUploading(false);
		}
	}

	return (
		<section
			className="space-y-2 rounded-xl border bg-surface/95 p-3 shadow-lg"
			data-testid="found-sheet"
		>
			<h2 className="font-medium">Found a hider</h2>
			<div className="pointer-events-auto grid grid-cols-2 gap-2">
				<label className="text-sm">
					Hider team
					<select
						className="mt-1 min-h-11 w-full rounded border bg-surface px-2"
						data-testid="found-hider-team"
						onChange={(event) => setHiderId(event.target.value)}
						value={selectedHiderId}
					>
						{hiderRoles.map((assignment) => (
							<option key={assignment.teamId} value={assignment.teamId}>
								{teams.find((team) => team.id === assignment.teamId)?.name ??
									"Hider"}
							</option>
						))}
					</select>
				</label>
				<label className="text-sm">
					Seeker team
					<select
						className="mt-1 min-h-11 w-full rounded border bg-surface px-2"
						data-testid="found-seeker-team"
						onChange={(event) => setSeekerId(event.target.value)}
						value={selectedSeekerId}
					>
						{seekerRoles.map((assignment) => (
							<option key={assignment.teamId} value={assignment.teamId}>
								{teams.find((team) => team.id === assignment.teamId)?.name ??
									"Seeker"}
							</option>
						))}
					</select>
				</label>
			</div>
			{outcome?.foundAt ? (
				<div className="pointer-events-auto flex flex-wrap gap-2">
					<label className="flex min-h-11 cursor-pointer items-center rounded border px-3 text-sm">
						{uploading
							? "Uploading…"
							: outcome.photoId
								? "Replace photo"
								: "Add optional photo"}
						<input
							accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
							capture="environment"
							className="sr-only"
							data-testid="found-photo"
							disabled={uploading}
							onChange={(event) => {
								const file = event.target.files?.[0];
								if (file) void attach(file);
							}}
							type="file"
						/>
					</label>
					<button
						className="min-h-11 rounded border px-3 text-sm"
						data-testid="unmark-found"
						onClick={() =>
							void zero.mutate(
								mutators.round.unmarkFound({
									eventId: crypto.randomUUID(),
									roundId: round.id,
									hiderTeamId: selectedHiderId,
								}),
							)
						}
						type="button"
					>
						Undo found
					</button>
				</div>
			) : (
				<button
					className="pointer-events-auto min-h-11 w-full rounded border px-4 font-semibold"
					data-testid="mark-found"
					disabled={!selectedHiderId || !selectedSeekerId}
					onClick={() => mark()}
					type="button"
				>
					Mark found now
				</button>
			)}
			{error && (
				<p className="text-danger text-sm" role="alert">
					{error}
				</p>
			)}
		</section>
	);
}
