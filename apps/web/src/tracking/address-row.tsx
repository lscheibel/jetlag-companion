import { webPlatform } from "@zero-lag/platform/web";
import { ActionButton } from "@zero-lag/ui/components/action-button";
import { Icon } from "@zero-lag/ui/components/icon";
import { useState } from "react";
import { pointsAtThisComputer, type TrackerApp, trackerAddress } from "./api";

/**
 * The one string this whole flow exists to hand over. m15-spec §4, §6.
 *
 * It is **per app**: OwnTracks and Overland take the bare endpoint, OsmAnd
 * substitutes positional placeholders and GPSLogger named ones. Handing an app
 * the wrong one fails silently — it uploads something unreadable and the player
 * sees an empty map — so there is no shared address and no adapt-it-yourself
 * explanation.
 *
 * Both halves of the handover — where in that app the address goes, and the
 * address itself — are one raised card, because they are useless apart and
 * they are the only thing on this screen a player has to act on.
 *
 * The address is shown **whole**. It is long, and an elided token would be a
 * string nobody can check against what they pasted; the box scrolls instead.
 * The loopback warning lives here rather than at the top of the screen because
 * it is a fact about *this string*, and a warning that has drifted away from
 * the thing it is about reads as general chatter.
 */

interface AddressRowProps {
	app: TrackerApp;
	token: string;
}

export function AddressRow({ app, token }: AddressRowProps) {
	const address = trackerAddress(app, token);
	// The address that was copied, not a flag: switching app changes the address
	// under a tick that would otherwise still be claiming the new one is copied.
	const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
	const copied = copiedAddress === address;

	return (
		<div className="flex flex-col gap-3 rounded-tile border border-hairline bg-surface p-3.5">
			<p className="eyebrow flex items-center gap-2">
				<span aria-hidden className="h-1.5 w-6 rounded-full bg-action" />
				Where it goes
			</p>

			<p className="text-sm leading-snug">
				In {app.name}, open <span className="font-semibold">{app.where}</span>{" "}
				and paste this address.
			</p>

			{/*
			 * The button sets the height and the address fits itself to it. The
			 * address is a wrapping string of unbounded length — an OsmAnd URL
			 * carries six placeholders after the token — so letting it size the
			 * row means a block that grows past the fold on one app and not on
			 * another. It is absolutely positioned inside a stretched cell,
			 * which leaves the button as the only thing in the row with a
			 * height of its own.
			 */}
			<div className="flex items-stretch gap-2">
				<div className="relative min-w-0 flex-1">
					<p
						className="absolute inset-0 overflow-y-auto break-all rounded-control bg-surface-sunken p-3 font-mono text-xs leading-relaxed"
						data-testid={`tracking-url-${app.id}`}
					>
						{address}
					</p>
				</div>
				<ActionButton
					aria-label={copied ? "Address copied" : "Copy address"}
					data-testid={`tracking-copy-${app.id}`}
					inline
					onClick={() =>
						void webPlatform.clipboard
							.write(address)
							.then((ok) => setCopiedAddress(ok ? address : null))
					}
					tone="secondary"
				>
					<Icon name={copied ? "check" : "copy"} size="md" />
				</ActionButton>
			</div>

			{pointsAtThisComputer(address) && (
				<p
					className="rounded-control border-danger border-l-2 bg-surface-sunken p-3 text-sm leading-snug"
					data-testid="tracking-loopback"
				>
					This link points at <strong>this computer</strong>, so a tracker app
					on a phone cannot reach it — on the phone, <code>localhost</code> is
					the phone. Open this page on the machine's network address instead,
					and the link will follow.
				</p>
			)}
		</div>
	);
}
