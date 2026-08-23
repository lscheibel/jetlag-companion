import { describe, expect, it } from "vitest";
import { parseCsv, splitCsvLine } from "./csv";

describe("splitCsvLine", () => {
	it("splits plain cells", () => {
		expect(splitCsvLine("a,b,c")).toEqual(["a", "b", "c"]);
	});

	/** The exact row that broke two earlier counts of this feed. */
	it("keeps a comma inside a quoted cell", () => {
		expect(splitCsvLine(',"197, 203",182,3,19479,,')).toEqual([
			"",
			"197, 203",
			"182",
			"3",
			"19479",
			"",
			"",
		]);
	});

	it("unescapes a doubled quote", () => {
		expect(splitCsvLine('a,"say ""hi""",b')).toEqual(["a", 'say "hi"', "b"]);
	});

	it("keeps trailing empty cells", () => {
		expect(splitCsvLine("a,,")).toEqual(["a", "", ""]);
	});
});

describe("parseCsv", () => {
	it("keys rows by header", () => {
		expect(parseCsv('id,name\n1,Alex\n2,"Berlin, Hbf"')).toEqual([
			{ id: "1", name: "Alex" },
			{ id: "2", name: "Berlin, Hbf" },
		]);
	});

	it("survives CRLF", () => {
		expect(parseCsv("id\r\n1\r\n")).toEqual([{ id: "1" }]);
	});
});
