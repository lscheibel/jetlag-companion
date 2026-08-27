import { webPlatform } from "@zero-lag/platform/web";
import { ActionButton } from "@zero-lag/ui/components/action-button";
import { Sheet } from "@zero-lag/ui/components/sheet";
import { useState } from "react";
import { QrCode } from "./qr-code";

/**
 * Asking people in. m1-spec §8.
 *
 * QR first, code second, link third — in the order they actually get used.
 * Reading six characters aloud across a station hall is the fallback, not the
 * plan.
 *
 * **Sharing is not a host action.** Anyone in the lobby can open this: the
 * person whose phone is nearest the newcomer should be doing it, and that is
 * rarely the host.
 */

interface InviteSheetProps {
	code: string;
	open: boolean;
	onClose: () => void;
}

export function InviteSheet({ code, open, onClose }: InviteSheetProps) {
	const [copied, setCopied] = useState(false);
	const link = `${window.location.origin}/j/${code}`;
	// Most desktop browsers have no share sheet, which is why copying sits
	// beside it rather than behind it.
	const canShare = webPlatform.share.capability().available;

	function copy() {
		// The browser can refuse, and a button that lies about having copied is
		// worse than one that admits it did not.
		void webPlatform.clipboard.write(link).then(setCopied);
	}

	return (
		<Sheet
			className="bg-sheet-fill"
			onClose={onClose}
			open={open}
			testId="invite-sheet"
			title="Ask people in"
		>
			<div className="mx-auto aspect-square w-full max-w-72 rounded-tile bg-white p-4">
				<QrCode value={link} />
			</div>

			<div>
				<p className="mb-1.5 text-center text-ink-dim text-sm leading-snug">
					This is the game's code. They can join with it.
				</p>
				<p
					// Large enough to read across a train carriage, which is the actual
					// distance this gets read at.
					className="num text-center font-bold text-4xl tracking-[0.16em]"
					data-testid="game-code"
				>
					{code}
				</p>
			</div>

			<div className="mt-5 flex gap-2.5">
				<ActionButton
					className="flex-1"
					data-testid="copy-link"
					onClick={copy}
					size="comfortable"
					tone="secondary"
				>
					{copied ? "Link copied" : "Copy link"}
				</ActionButton>
				{canShare && (
					<ActionButton
						className="flex-1"
						data-testid="share-link"
						onClick={() =>
							void webPlatform.share.open({ url: link, title: "Zero Lag" })
						}
						size="comfortable"
					>
						Share
					</ActionButton>
				)}
			</div>
		</Sheet>
	);
}
