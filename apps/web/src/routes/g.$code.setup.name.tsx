import { useQuery, useZero } from "@rocicorp/zero/react";
import { mutators, queries } from "@zero-lag/schema";
import { ActionButton } from "@zero-lag/ui/components/action-button";
import { Field } from "@zero-lag/ui/components/field";
import {
	Screen,
	ScreenActions,
	ScreenBody,
	ScreenHeader,
} from "@zero-lag/ui/components/screen";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { useGameShell } from "../game/shell";

/**
 * The name step, reopened from the review.
 *
 * The first time round it runs before the game exists, over HTTP, on `/new`.
 * By the time anyone comes back to it there is a player row to rename, so this
 * is a different write to the same question — and the review's "Change" is
 * expected to land on the screen that set the thing, not on a sheet.
 */
export default function SetupName() {
	const navigate = useNavigate();
	const zero = useZero();
	const { session } = useGameShell();
	const [players] = useQuery(queries.players());

	const current =
		players.find((player) => player.id === session.playerId)?.displayName ?? "";
	const [displayName, setDisplayName] = useState<string | null>(null);
	const value = displayName ?? current;
	const name = value.trim();

	const back = () => void navigate(`/g/${session.code}/setup/review`);

	function save(event: FormEvent) {
		event.preventDefault();
		if (name.length === 0) return;
		if (name !== current) {
			zero.mutate(
				mutators.player.rename({
					eventId: crypto.randomUUID(),
					displayName: name,
				}),
			);
		}
		back();
	}

	return (
		<Screen>
			<ScreenHeader
				eyebrow="Creating a game"
				onBack={back}
				title="What should we call you?"
			/>
			<form className="flex flex-1 flex-col" onSubmit={save}>
				<ScreenBody>
					<Field
						// biome-ignore lint/a11y/noAutofocus: a single-field step, opened on purpose
						autoFocus
						autoComplete="nickname"
						data-testid="display-name"
						enterKeyHint="done"
						label="Your name"
						maxLength={40}
						onChange={(event) => setDisplayName(event.target.value)}
						size="display"
						value={value}
					/>
					<p className="px-1 text-ink-dim text-xs leading-snug">
						You'll be running this game. You can hand that over to somebody else
						at any point.
					</p>
				</ScreenBody>
				<ScreenActions>
					<ActionButton
						beacon
						data-testid="save-name"
						disabled={name.length === 0}
						type="submit"
					>
						Save
					</ActionButton>
				</ScreenActions>
			</form>
		</Screen>
	);
}
