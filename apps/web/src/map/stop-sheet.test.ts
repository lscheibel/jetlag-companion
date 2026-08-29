import { describe, expect, it } from "vitest";
import { stationNameCharacterCount } from "./stop-sheet";

describe("stationNameCharacterCount", () => {
	it("counts a name with no gaps as itself", () => {
		expect(stationNameCharacterCount("Alexanderplatz")).toBe(14);
	});

	it("drops spaces and nothing else", () => {
		expect(stationNameCharacterCount("Potsdamer Platz")).toBe(14);
		expect(stationNameCharacterCount("Zoologischer Garten")).toBe(18);
	});

	it("counts umlauts, eszett and hyphens as characters", () => {
		expect(stationNameCharacterCount("Friedrichstraße")).toBe(15);
		expect(stationNameCharacterCount("Schönhauser Allee")).toBe(16);
		expect(stationNameCharacterCount("Berlin-Gesundbrunnen")).toBe(20);
	});

	it("drops every kind of whitespace, including runs and edges", () => {
		expect(stationNameCharacterCount("  Ostkreuz  ")).toBe(8);
		expect(stationNameCharacterCount("Warschauer\tStraße")).toBe(16);
		expect(stationNameCharacterCount("Südkreuz\n")).toBe(8);
	});
});
