const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|heic|heif|bmp|avif)$/i;

const EXT_TO_CONTENT_TYPE: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  bmp: "image/bmp",
  avif: "image/avif",
};

/**
 * Client-side: mobile (esp. iOS) often sends empty MIME, `application/octet-stream`,
 * or HEIC/HEIF variants that fail a strict `image/*` check.
 */
export function isLikelyImageFile(file: File): boolean {
  const t = (file.type || "").trim().toLowerCase();
  if (t.startsWith("image/")) return true;
  if (t.includes("heic") || t.includes("heif")) return true;
  if (t === "application/x-apple-heic" || t === "application/x-apple-heif") return true;
  if (t === "application/octet-stream" || t === "binary/octet-stream") return true;

  const name = file.name || "";
  if (IMAGE_EXT_RE.test(name)) return true;

  // No reliable MIME from picker; still under broadcast cap — allow upload as generic media
  if (!t && file.size > 0 && file.size <= 5 * 1024 * 1024) return true;

  return false;
}

export function guessContentTypeFromFilename(filename: string): string {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  return EXT_TO_CONTENT_TYPE[ext] || "image/jpeg";
}

/** Storage object key extension when the browser omits a useful filename. */
export function inferStorageExtension(file: File): string {
  const name = file.name || "";
  const parts = name.split(".");
  if (parts.length > 1) {
    const ext = (parts.pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (ext.length > 0 && ext.length <= 8) return ext;
  }
  const t = (file.type || "").trim().toLowerCase();
  if (t.includes("heic")) return "heic";
  if (t.includes("heif")) return "heif";
  if (t === "image/jpeg" || t === "image/jpg") return "jpg";
  if (t === "image/png") return "png";
  if (t === "image/webp") return "webp";
  if (t === "image/gif") return "gif";
  if (t === "" || t === "application/octet-stream" || t === "binary/octet-stream") {
    return "heic";
  }
  return "jpg";
}

/**
 * Prefer real `image/*` from the browser; otherwise infer from extension (HEIC, etc.).
 */
export function resolveUploadContentType(file: File, ext: string): string {
  const t = (file.type || "").trim().toLowerCase();
  if (t.startsWith("image/")) return file.type.trim();
  if (t === "application/x-apple-heic") return "image/heic";
  if (t === "application/x-apple-heif") return "image/heif";
  const e = ext.toLowerCase();
  return EXT_TO_CONTENT_TYPE[e] || "application/octet-stream";
}
