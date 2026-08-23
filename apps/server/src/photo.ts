import { createHash } from "node:crypto";
import { link, mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
export const MAX_PHOTO_EDGE = 2048;

type PhotoContentType = "image/jpeg" | "image/png" | "image/webp";

export interface ProcessedPhoto {
	bytes: Buffer;
	sha256: string;
	contentType: PhotoContentType;
	byteSize: number;
	width: number;
	height: number;
}

export interface NewPhotoMetadata {
	id: string;
	gameId: string;
	sha256: string;
	contentType: PhotoContentType;
	byteSize: number;
	width: number;
	height: number;
	uploadedByPlayerId: string;
	uploadedAt: number;
}

export function newPhotoMetadata(
	ctx: { gameId: string; playerId: string },
	photo: ProcessedPhoto,
): NewPhotoMetadata {
	return {
		id: crypto.randomUUID(),
		gameId: ctx.gameId,
		sha256: photo.sha256,
		contentType: photo.contentType,
		byteSize: photo.byteSize,
		width: photo.width,
		height: photo.height,
		uploadedByPlayerId: ctx.playerId,
		uploadedAt: Date.now(),
	};
}

export class PhotoInputError extends Error {
	constructor(
		readonly code: "empty_file" | "file_too_large" | "unsupported_image",
		message: string,
	) {
		super(message);
		this.name = "PhotoInputError";
	}
}

/**
 * Decode before trusting the declared multipart content type. Sharp's default
 * output omits EXIF/IPTC/XMP; rotate() applies EXIF orientation before that
 * metadata is discarded.
 */
export async function processPhoto(input: Buffer): Promise<ProcessedPhoto> {
	if (input.byteLength === 0) {
		throw new PhotoInputError("empty_file", "the photo is empty");
	}
	if (input.byteLength > MAX_PHOTO_BYTES) {
		throw new PhotoInputError(
			"file_too_large",
			"photos must be 20 MB or smaller",
		);
	}

	let metadata: sharp.Metadata;
	try {
		metadata = await sharp(input).metadata();
	} catch {
		throw unsupportedImage();
	}

	const output = outputFormat(metadata);
	let pipeline = sharp(input, { failOn: "warning" }).rotate().resize({
		width: MAX_PHOTO_EDGE,
		height: MAX_PHOTO_EDGE,
		fit: "inside",
		withoutEnlargement: true,
	});

	switch (output) {
		case "jpeg":
			pipeline = pipeline.jpeg({ quality: 85 });
			break;
		case "png":
			pipeline = pipeline.png({ compressionLevel: 9 });
			break;
		case "webp":
			pipeline = pipeline.webp({ quality: 85 });
			break;
	}

	try {
		const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
		const contentType = contentTypeFor(info.format);
		return {
			bytes: data,
			sha256: createHash("sha256").update(data).digest("hex"),
			contentType,
			byteSize: data.byteLength,
			width: info.width,
			height: info.height,
		};
	} catch {
		throw unsupportedImage();
	}
}

function outputFormat(metadata: sharp.Metadata): "jpeg" | "png" | "webp" {
	switch (metadata.format) {
		case "jpeg":
		case "png":
		case "webp":
			return metadata.format;
		case "heif":
			// libvips reports both HEIC and AVIF as HEIF. M5 accepts only HEIC.
			if (metadata.compression === "hevc") return "jpeg";
			throw unsupportedImage();
		default:
			throw unsupportedImage();
	}
}

function contentTypeFor(format: string): PhotoContentType {
	switch (format) {
		case "jpeg":
			return "image/jpeg";
		case "png":
			return "image/png";
		case "webp":
			return "image/webp";
		default:
			throw unsupportedImage();
	}
}

function unsupportedImage(): PhotoInputError {
	return new PhotoInputError(
		"unsupported_image",
		"photos must be JPEG, PNG, WebP or HEIC",
	);
}

export function photoBlobPath(photosPath: string, sha256: string): string {
	if (!/^[a-f0-9]{64}$/.test(sha256)) {
		throw new Error("invalid photo digest");
	}
	return join(photosPath, sha256);
}

/**
 * Publish with link(2), so readers see either the whole processed image or no
 * image. EEXIST is success: identical processed bytes intentionally share one
 * content-addressed file.
 */
export async function writePhotoBlob(
	photosPath: string,
	photo: Pick<ProcessedPhoto, "bytes" | "sha256">,
): Promise<{ created: boolean; path: string }> {
	await mkdir(photosPath, { recursive: true });
	const path = photoBlobPath(photosPath, photo.sha256);
	const temporaryPath = join(
		photosPath,
		`.${photo.sha256}.${crypto.randomUUID()}.tmp`,
	);

	await writeFile(temporaryPath, photo.bytes, { flag: "wx" });
	try {
		await link(temporaryPath, path);
		return { created: true, path };
	} catch (error) {
		if (!isNodeError(error, "EEXIST")) throw error;
		return { created: false, path };
	} finally {
		await rm(temporaryPath, { force: true });
	}
}

export function readPhotoBlob(
	photosPath: string,
	sha256: string,
): Promise<Buffer> {
	return readFile(photoBlobPath(photosPath, sha256));
}

/**
 * The caller supplies the authoritative metadata check. It must serialize that
 * check with uploads of the same digest (the server uses a Postgres advisory
 * lock) so a new row cannot race the unlink.
 */
export async function removePhotoBlobIfUnreferenced(
	photosPath: string,
	sha256: string,
	isReferenced: () => Promise<boolean>,
): Promise<boolean> {
	if (await isReferenced()) return false;
	try {
		await unlink(photoBlobPath(photosPath, sha256));
		return true;
	} catch (error) {
		if (isNodeError(error, "ENOENT")) return false;
		throw error;
	}
}

export function isNodeError(
	error: unknown,
	code: string,
): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error && error.code === code;
}
