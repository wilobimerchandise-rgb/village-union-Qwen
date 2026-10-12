const MAGIC_BYTES: Record<string, string[]> = {
  "image/jpeg": ["ffd8ff"],
  "image/png": ["89504e47"],
  "image/webp": ["52494646"],
  "application/pdf": ["25504446"],
};

export function verifyMagicBytes(bytes: Uint8Array, declaredType: string): boolean {
  const hex = Array.from(bytes.slice(0, 12))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const expected = MAGIC_BYTES[declaredType];
  if (!expected) return false;

  if (declaredType === "image/webp") {
    return hex.startsWith("52494646") && hex.slice(16, 24) === "57454250";
  }

  return expected.some((prefix) => hex.startsWith(prefix));
}

export async function computeSHA256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function compressImage(
  file: File,
  maxWidth = 1200,
  quality = 0.85
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, maxWidth / bitmap.width);
  const width = Math.round(bitmap.width * ratio);
  const height = Math.round(bitmap.height * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;

  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b || file), "image/webp", quality);
  });

  return new File([blob], file.name.replace(/\.\w+$/, ".webp"), { type: "image/webp" });
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

export async function uploadWithRetry(
  uploadFn: () => Promise<void>,
  maxRetries = 3,
  onProgress?: (p: UploadProgress) => void
): Promise<void> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await uploadFn();
      onProgress?.({ loaded: 1, total: 1, percent: 100 });
      return;
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError || new Error("Upload failed after retries");
}
