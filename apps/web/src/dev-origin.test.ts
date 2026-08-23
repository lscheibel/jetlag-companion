import { describe, expect, it } from "vitest";
import {
	isLoopbackHost,
	resolveServerUrl,
	resolveZeroCacheUrl,
	usesViteProxy,
} from "./dev-origin";

const CONFIGURED_SERVER = "http://localhost:3000";
const CONFIGURED_ZERO = "http://localhost:4848";

describe("isLoopbackHost", () => {
	it("recognises the names a browser uses for this machine", () => {
		expect(isLoopbackHost("localhost")).toBe(true);
		expect(isLoopbackHost("127.0.0.1")).toBe(true);
		expect(isLoopbackHost("::1")).toBe(true);
		expect(isLoopbackHost("[::1]")).toBe(true);
	});

	it("does not treat a LAN address or a tunnel as loopback", () => {
		expect(isLoopbackHost("192.168.1.20")).toBe(false);
		expect(isLoopbackHost("10.0.0.4")).toBe(false);
		expect(isLoopbackHost("macbook.local")).toBe(false);
		expect(isLoopbackHost("random.trycloudflare.com")).toBe(false);
	});
});

describe("usesViteProxy", () => {
	it("is off only for HTTP loopback, where mixed content is not a problem", () => {
		expect(
			usesViteProxy({
				hostname: "localhost",
				origin: "http://localhost:5173",
			}),
		).toBe(false);
	});

	it("is on for HTTPS, including localhost, so the page is not mixed content", () => {
		expect(
			usesViteProxy({
				hostname: "localhost",
				origin: "https://localhost:5173",
			}),
		).toBe(true);
	});

	it("is on for a phone or a tunnel, which cannot use this machine's localhost", () => {
		expect(
			usesViteProxy({
				hostname: "192.168.1.20",
				origin: "https://192.168.1.20:5173",
			}),
		).toBe(true);
		expect(
			usesViteProxy({
				hostname: "192.168.1.20",
				origin: "http://192.168.1.20:5173",
			}),
		).toBe(true);
	});
});

describe("resolveServerUrl", () => {
	it("keeps the baked URL on HTTP loopback", () => {
		expect(
			resolveServerUrl(
				{ hostname: "localhost", origin: "http://localhost:5173" },
				CONFIGURED_SERVER,
			),
		).toBe(CONFIGURED_SERVER);
	});

	it("uses the page origin on HTTPS localhost and on a phone", () => {
		expect(
			resolveServerUrl(
				{ hostname: "localhost", origin: "https://localhost:5173" },
				CONFIGURED_SERVER,
			),
		).toBe("https://localhost:5173");
		expect(
			resolveServerUrl(
				{ hostname: "192.168.1.20", origin: "https://192.168.1.20:5173" },
				CONFIGURED_SERVER,
			),
		).toBe("https://192.168.1.20:5173");
	});
});

describe("resolveZeroCacheUrl", () => {
	it("keeps the baked URL on HTTP loopback", () => {
		expect(
			resolveZeroCacheUrl(
				{ hostname: "localhost", origin: "http://localhost:5173" },
				CONFIGURED_ZERO,
			),
		).toBe(CONFIGURED_ZERO);
	});

	it("points at the Vite proxy prefix when the page cannot talk to :4848", () => {
		expect(
			resolveZeroCacheUrl(
				{ hostname: "localhost", origin: "https://localhost:5173" },
				CONFIGURED_ZERO,
			),
		).toBe("https://localhost:5173/zero-cache");
		expect(
			resolveZeroCacheUrl(
				{ hostname: "192.168.1.20", origin: "https://192.168.1.20:5173" },
				CONFIGURED_ZERO,
			),
		).toBe("https://192.168.1.20:5173/zero-cache");
	});
});
