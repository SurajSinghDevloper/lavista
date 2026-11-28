import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { env } from "./env";

/**
 * Local-disk storage driver. Swap this module for S3/R2/GCS later –
 * the rest of the app only uses save / stream / remove with an opaque key.
 */

/** Extension whitelist → served content type. SVG/HTML are never allowed (XSS). */
export const ALLOWED_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
  dwg: "application/acad",
  dxf: "application/dxf",
  skp: "application/vnd.sketchup.skp",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
  rar: "application/vnd.rar",
  mp4: "video/mp4",
  mov: "video/quicktime",
  txt: "text/plain",
};

/** Types safe to show inline in the browser. */
export const INLINE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf", "video/mp4", "video/quicktime"]);

const root = () => path.resolve(/*turbopackIgnore: true*/ process.cwd(), env.uploadDir);

function resolveKey(key: string) {
  const full = path.resolve(/*turbopackIgnore: true*/ root(), key);
  if (!full.startsWith(root() + path.sep)) throw new Error("Invalid storage key");
  return full;
}

export function extensionOf(name: string) {
  return (name.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Light magic-byte check for common types so renamed executables are rejected. */
export function sniffOk(ext: string, head: Uint8Array) {
  const h = (n: number) => head[n];
  switch (ext) {
    case "jpg":
    case "jpeg":
      return h(0) === 0xff && h(1) === 0xd8;
    case "png":
      return h(0) === 0x89 && h(1) === 0x50 && h(2) === 0x4e && h(3) === 0x47;
    case "gif":
      return h(0) === 0x47 && h(1) === 0x49 && h(2) === 0x46;
    case "pdf":
      return h(0) === 0x25 && h(1) === 0x50 && h(2) === 0x44 && h(3) === 0x46;
    case "webp":
      return h(8) === 0x57 && h(9) === 0x45 && h(10) === 0x42 && h(11) === 0x50;
    case "zip":
    case "xlsx":
    case "docx":
    case "pptx":
      return h(0) === 0x50 && h(1) === 0x4b;
    default: {
      // reject Windows executables / scripts disguised under other names
      const mz = h(0) === 0x4d && h(1) === 0x5a;
      const html = new TextDecoder().decode(head.slice(0, 64)).trim().toLowerCase();
      return !mz && !html.startsWith("<!doctype html") && !html.startsWith("<html") && !html.startsWith("<script");
    }
  }
}

export async function saveFile(data: Uint8Array, ext: string, prefix = "") {
  const d = new Date();
  const key = `${prefix}${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${randomUUID()}.${ext}`;
  const full = resolveKey(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
  return key;
}

export async function fileStream(key: string) {
  const full = resolveKey(key);
  const s = await stat(full);
  const stream = Readable.toWeb(createReadStream(full)) as ReadableStream;
  return { stream, size: s.size };
}

export async function readFileBytes(key: string) {
  return new Uint8Array(await readFile(resolveKey(key)));
}

/** Image types we create small previews for (grids load these instead of 5–10 MB phone photos). */
export const THUMBNAIL_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

/** 480px WebP preview, auto-rotated from EXIF. Returns the storage key, or null if the image can't be decoded. */
type SharpFn = (typeof import("sharp"))["default"];
let sharpLoader: Promise<SharpFn | null> | null = null;
/**
 * sharp is a native module – load it lazily so that, if it is ever unavailable on a server,
 * uploads still work (grids simply show originals) instead of breaking unrelated API routes.
 */
function loadSharp() {
  sharpLoader ??= import("sharp")
    .then((m): SharpFn => m.default)
    .catch((e) => {
      console.error("[storage] image thumbnails disabled – sharp could not be loaded:", e instanceof Error ? e.message.split("\n")[0] : e);
      return null;
    });
  return sharpLoader;
}

export async function createThumbnail(data: Uint8Array): Promise<string | null> {
  const sharp = await loadSharp();
  if (!sharp) return null;
  try {
    const out = await sharp(data, { failOn: "none", limitInputPixels: 120_000_000 })
      .rotate()
      .resize(480, 480, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer();
    return await saveFile(new Uint8Array(out), "webp", "thumbs/");
  } catch {
    return null;
  }
}

export async function removeFile(key: string) {
  try {
    await unlink(resolveKey(key));
  } catch {
    /* already gone */
  }
}
