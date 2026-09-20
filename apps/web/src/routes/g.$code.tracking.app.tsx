import type { DevicePlatform } from "@zero-lag/platform";
import { Door } from "@zero-lag/ui/components/door";
import {
	Screen,
	ScreenBody,
	ScreenHeader,
} from "@zero-lag/ui/components/screen";
import { useNavigate } from "react-router";
import { useGameShell } from "../game/shell";
import { StepRail } from "../tracking/step-rail";
import { TrackerGlyph } from "../tracking/tracker-glyph";
import { useTrackingWizard } from "../tracking/wizard";

/**
 * Step one: which app. m15-spec §6.
 *
 * A door apiece rather than a picker, because this is a choice between paths
 * and the second line is what makes it without a tap. OwnTracks leads and
 * carries the beacon for one concrete reason rather than out of preference: it
 * configures itself from a link, so its setup is one tap on the phone already
 * holding this screen.
 *
 * Apps that cannot do the job on this phone are **absent, not disabled**.
 * OsmAnd's online tracking setting does not exist on iOS and GPSLogger has no
 * iOS build, so offering either would be offering an app that cannot work —
 * which is different from a question this game does not carry, where the
 * question board lifts the row and still opens it.
 */
export default function TrackingApp() {
	const navigate = useNavigate();
	const { session } = useGameShell();
	const { apps, platform, choose } = useTrackingWizard();

	return (
		<Screen data-testid="tracking-app-step">
			<ScreenHeader
				eyebrow="Background tracking"
				onBack={() => void navigate(`/g/${session.code}/map`)}
				title="Which app do you use?"
			/>
			<StepRail step={0} />
			<ScreenBody>
				<p className="text-ink-dim text-sm leading-snug">
					Worth setting up if you are seeking. Your team keeps seeing where you
					are with the phone in your pocket, which is where it spends most of a
					round on the move.
				</p>

				{apps.map((app, index) => (
					<Door
						beacon={index === 0}
						chevron
						data-testid={`tracking-pick-${app.id}`}
						glyph={<TrackerGlyph app={app} size="lg" />}
						hint={app.summary}
						key={app.id}
						onClick={() => {
							choose(app);
							void navigate(`/g/${session.code}/tracking/address`);
						}}
						tone={index === 0 ? "primary" : "secondary"}
					>
						{app.name}
					</Door>
				))}

				<p className="px-1 text-ink-faint text-xs leading-snug">
					{listNote(platform)}
				</p>
			</ScreenBody>
		</Screen>
	);
}

/**
 * What every app on the list has in common, and why the list is as short as it
 * is.
 *
 * The second half is said out loud because a two-entry list looks like an
 * oversight otherwise, and because a player who has heard of GPSLogger and
 * cannot see it should learn that it has no iPhone build here rather than in
 * the App Store.
 */
function listNote(platform: DevicePlatform): string {
	if (platform === "ios") {
		return "The named apps are free and open source. Only ones that can report in the background on an iPhone are listed.";
	}
	if (platform === "android") {
		return "The named apps are free and open source.";
	}
	return "The named apps are free and open source. This page cannot tell which phone you are holding, so every app is listed — OwnTracks is the one that works on both.";
}
