import qr from "qrcode-generator";
import { useMemo } from "react";

/**
 * Rendered on the device, from a library, with no network call. m1-spec §8.
 *
 * A game is set up in a station hall, a basement bar or a car park with one bar
 * of signal, and a QR that is an `<img>` pointing at a third-party generator is
 * a QR that fails in exactly the places this app is for. It also means the join
 * code never leaves the phone to reach a stranger's server.
 *
 * SVG rather than canvas: it scales to whatever size the sharing phone is held
 * at, and it prints.
 */
interface QrCodeProps {
	value: string;
	/** Rendered size in CSS pixels. The module grid is resolution-independent. */
	size?: number;
}

export function QrCode({ value, size = 220 }: QrCodeProps) {
	const path = useMemo(() => {
		// Type 0 picks the smallest version that fits; correction level M leaves
		// room for a thumb over one corner without leaving room for nothing else.
		const code = qr(0, "M");
		code.addData(value);
		code.make();

		const count = code.getModuleCount();
		const segments: string[] = [];
		for (let row = 0; row < count; row++) {
			for (let column = 0; column < count; column++) {
				if (code.isDark(row, column)) {
					segments.push(`M${column} ${row}h1v1h-1z`);
				}
			}
		}
		return { d: segments.join(""), count };
	}, [value]);

	// One quiet-module border on each side: below four the scanner struggles,
	// and on a phone screen four is most of the code.
	const extent = path.count + 2;

	return (
		<svg
			aria-label="Join code"
			className="rounded bg-white p-2"
			data-testid="join-qr"
			height={size}
			role="img"
			viewBox={`-1 -1 ${extent} ${extent}`}
			width={size}
			xmlns="http://www.w3.org/2000/svg"
		>
			<path d={path.d} fill="#000000" shapeRendering="crispEdges" />
		</svg>
	);
}
