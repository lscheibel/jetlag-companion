/**
 * A correct-enough RFC 4180 line splitter, because this feed has bitten three
 * times now.
 *
 * `routes.txt` puts `route_long_name` first and quotes it, and two bus routes
 * carry a *short* name of `"197, 203"` — so a naive `split(",")` shifts every
 * later column on exactly those rows and reports a route type of `182`. The
 * bulk files never pass through here (Postgres `COPY` parses those), but
 * anything read in JavaScript does.
 */

export function splitCsvLine(line: string): string[] {
	const cells: string[] = [];
	let cell = "";
	let quoted = false;

	for (let i = 0; i < line.length; i++) {
		const char = line[i];
		if (quoted) {
			if (char === '"') {
				// A doubled quote inside a quoted field is one literal quote.
				if (line[i + 1] === '"') {
					cell += '"';
					i++;
				} else {
					quoted = false;
				}
			} else {
				cell += char;
			}
		} else if (char === '"') {
			quoted = true;
		} else if (char === ",") {
			cells.push(cell);
			cell = "";
		} else {
			cell += char;
		}
	}
	cells.push(cell);
	return cells;
}

/** Header-keyed rows. For the small files only — see the note above. */
export function parseCsv(text: string): Record<string, string>[] {
	const lines = text.replace(/\r\n/g, "\n").trimEnd().split("\n");
	const header = splitCsvLine(lines[0] ?? "");
	return lines.slice(1).map((line) => {
		const cells = splitCsvLine(line);
		const row: Record<string, string> = {};
		header.forEach((key, index) => {
			row[key] = cells[index] ?? "";
		});
		return row;
	});
}
