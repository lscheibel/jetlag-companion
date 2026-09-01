import type { LngLat } from "@zero-lag/geo";
import { webPlatform } from "@zero-lag/platform/web";
import { useState } from "react";
import { formatCoordinates } from "./toolkit";

interface CoordinateCopyProps {
	readonly point: LngLat;
	readonly testId?: string;
}

/**
 * A coordinate, and a way to take it with you. Every sheet that names a place
 * on the map — a station, an amenity, a player, your own fix — carries this
 * line, so a number read off the map is never a number retyped by hand.
 *
 * Where the clipboard is out of reach the text stays selectable and says so,
 * rather than offering a button that cannot do anything.
 */
export function CoordinateCopy({ point, testId }: CoordinateCopyProps) {
	const [copied, setCopied] = useState<"idle" | "yes" | "no">("idle");
	const text = formatCoordinates(point);
	const available = webPlatform.clipboard.capability().available;
	return (
		<div className="flex items-center gap-2" data-testid={testId}>
			<span className="select-all">{text}</span>
			{available ? (
				<button
					className="min-h-11 rounded-control border border-hairline px-2"
					onClick={() =>
						void webPlatform.clipboard
							.write(text)
							.then((success) => setCopied(success ? "yes" : "no"))
					}
					type="button"
				>
					{copied === "yes"
						? "Copied"
						: copied === "no"
							? "Copy failed"
							: "Copy"}
				</button>
			) : (
				<span>Select and copy</span>
			)}
		</div>
	);
}
