import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	MAX_PHOTO_EDGE,
	processPhoto,
	removePhotoBlobIfUnreferenced,
	writePhotoBlob,
} from "./photo";

async function jpeg(options: {
	width: number;
	height: number;
	gps?: boolean;
}): Promise<Buffer> {
	const sharp = (await import("sharp")).default;
	let pipeline = sharp({
		create: {
			width: options.width,
			height: options.height,
			channels: 3,
			background: { r: 180, g: 40, b: 20 },
		},
	});
	if (options.gps) {
		pipeline = pipeline.withExif({
			IFD3: {
				GPSLatitudeRef: "N",
				GPSLatitude: "52/1 31/1 11/1",
				GPSLongitudeRef: "E",
				GPSLongitude: "13/1 24/1 52/1",
			},
		});
	}
	return pipeline.jpeg().toBuffer();
}

describe("processPhoto", () => {
	it("strips GPS EXIF from a JPEG", async () => {
		const input = await jpeg({ width: 80, height: 60, gps: true });
		const sharp = (await import("sharp")).default;
		expect(input.includes(Buffer.from([0x25, 0x88]))).toBe(true);

		const processed = await processPhoto(input);
		const outMeta = await sharp(processed.bytes).metadata();
		expect(outMeta.exif).toBeUndefined();
		expect(processed.bytes.includes(Buffer.from([0x25, 0x88]))).toBe(false);
		expect(processed.contentType).toBe("image/jpeg");
		expect(processed.width).toBe(80);
		expect(processed.height).toBe(60);
	});

	it("caps the long edge and keeps the aspect ratio", async () => {
		const processed = await processPhoto(
			await jpeg({ width: 4_096, height: 2_048 }),
		);
		expect(Math.max(processed.width, processed.height)).toBe(MAX_PHOTO_EDGE);
		expect(processed.width / processed.height).toBeCloseTo(2, 5);
	});

	it("rejects an empty buffer and an oversized payload", async () => {
		await expect(processPhoto(Buffer.alloc(0))).rejects.toMatchObject({
			code: "empty_file",
		});
		await expect(
			processPhoto(Buffer.alloc(20 * 1024 * 1024 + 1)),
		).rejects.toMatchObject({ code: "file_too_large" });
	});

	it("rejects a non-image", async () => {
		await expect(
			processPhoto(Buffer.from("not an image")),
		).rejects.toMatchObject({ code: "unsupported_image" });
	});
});

describe("content-addressed photo files", () => {
	let dir = "";

	afterEach(async () => {
		if (dir) await rm(dir, { recursive: true, force: true });
	});

	it("writes one file for two identical uploads and keeps it while a row remains", async () => {
		dir = await mkdtemp(join(tmpdir(), "zero-lag-photos-"));
		const processed = await processPhoto(await jpeg({ width: 32, height: 32 }));

		const first = await writePhotoBlob(dir, processed);
		const second = await writePhotoBlob(dir, processed);
		expect(first.created).toBe(true);
		expect(second.created).toBe(false);
		expect(second.path).toBe(first.path);
		expect(await readFile(first.path)).toEqual(processed.bytes);

		expect(
			await removePhotoBlobIfUnreferenced(
				dir,
				processed.sha256,
				async () => true,
			),
		).toBe(false);
		expect(await readFile(first.path)).toEqual(processed.bytes);

		expect(
			await removePhotoBlobIfUnreferenced(
				dir,
				processed.sha256,
				async () => false,
			),
		).toBe(true);
		await expect(readFile(first.path)).rejects.toMatchObject({
			code: "ENOENT",
		});
	});
});
