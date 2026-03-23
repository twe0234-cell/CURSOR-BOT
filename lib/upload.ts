const IMAGE_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp", "svg", "avif", "tiff", "tif",
]);

/**
 * Detect whether a File is an image.
 * Mobile browsers (especially iOS Safari) sometimes report an empty `file.type`,
 * so we fall back to the file extension when the MIME type is missing.
 */
export function isImageFile(file: File | Blob): boolean {
  if (file instanceof File) {
    if (file.type && file.type.startsWith("image/")) return true;
    const ext = file.name?.split(".").pop()?.toLowerCase();
    if (ext && IMAGE_EXTENSIONS.has(ext)) return true;
  } else {
    if (file.type && file.type.startsWith("image/")) return true;
  }
  return false;
}

/**
 * Resolve the MIME type for a file, falling back to extension-based detection
 * when the browser doesn't provide a type (common on mobile).
 */
export function resolveContentType(file: File | Blob): string {
  if (file.type) return file.type;
  if (file instanceof File && file.name) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    const map: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      heic: "image/heic",
      heif: "image/heif",
      bmp: "image/bmp",
      svg: "image/svg+xml",
      avif: "image/avif",
      tiff: "image/tiff",
      tif: "image/tiff",
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
    if (ext && map[ext]) return map[ext];
  }
  return "application/octet-stream";
}

export const IMAGE_SIZE_LIMIT_BYTES = 5 * 1024 * 1024; // 5 MB
export const DOC_SIZE_LIMIT_BYTES = 10 * 1024 * 1024; // 10 MB
