import { webPlatform } from "@zero-lag/platform/web";
import { useState } from "react";
import { QrCode } from "./qr-code";

/**
 * Three doors, one code. m1-spec §8.
 *
 * **Sharing is not a host action.** Anyone in the lobby can show the QR or send
 * the link — the person whose phone is nearest the newcomer is the one who
 * should be doing it, and that is rarely the host.
 */
interface ShareCardProps {
	code: string;
}

export function ShareCard({ code }: ShareCardProps) {
	const [showQr, setShowQr] = useState(false);
	const [copied, setCopied] = useState(false);
	const link = `${window.location.origin}/j/${code}`;

	function copy() {
		// The browser can refuse, and a button that lies about having copied is
		// worse than one that admits it did not.
		void webPlatform.clipboard.write(link).then(setCopied);
	}

	return (
		<section className="space-y-3 rounded border p-4">
			<p
				// Large enough to read across a train carriage, which is the actual
				// distance this number gets read at.
				className="text-center font-mono text-4xl tracking-[0.3em]"
				data-testid="game-code"
			>
				{code}
			</p>

			<div className="flex gap-2">
				<button
					className="min-h-11 flex-1 rounded border px-3"
					data-testid="copy-link"
					onClick={copy}
					type="button"
				>
					{copied ? "Link copied" : "Copy link"}
				</button>
				<button
					className="min-h-11 flex-1 rounded border px-3"
					data-testid="show-qr"
					onClick={() => setShowQr((shown) => !shown)}
					type="button"
				>
					{showQr ? "Hide QR" : "Show QR"}
				</button>
			</div>

			{showQr && (
				<div className="flex justify-center">
					<QrCode value={link} />
				</div>
			)}
		</section>
	);
}
