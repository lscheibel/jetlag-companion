import { describe, expect, it } from "vitest";
import { canonicalJson, sha256Hex } from "./hash";

describe("sha256Hex", () => {
	// Hand-rolled crypto is only trustworthy against published vectors.
	it("matches the FIPS 180-2 vectors", () => {
		expect(sha256Hex("")).toBe(
			"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
		);
		expect(sha256Hex("abc")).toBe(
			"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
		);
		expect(
			sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
		).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
	});

	it("hashes inputs longer than one block", () => {
		expect(sha256Hex("a".repeat(1000000)).slice(0, 16)).toBe(
			"cdc76e5c9914fb92",
		);
	});

	it("handles multi-byte characters", () => {
		expect(sha256Hex("Höfe")).toBe(sha256Hex("Höfe"));
		expect(sha256Hex("Höfe")).not.toBe(sha256Hex("Hofe"));
	});
});

describe("canonicalJson", () => {
	it("is insensitive to key order", () => {
		expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
	});

	it("is sensitive to array order", () => {
		expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
	});

	it("sorts nested keys too", () => {
		expect(canonicalJson({ outer: { z: 1, a: 2 } })).toBe(
			'{"outer":{"a":2,"z":1}}',
		);
	});
});
