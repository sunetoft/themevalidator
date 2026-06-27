/**
 * Local file storage — replaces AWS S3 for self-hosted deployment.
 * Files are stored under uploads/ directory.
 * For S3 compatibility, the interface matches presigned URL semantics.
 */

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

export async function ensureUploadDir() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

export async function saveUploadedFile(
  buffer: Buffer,
  originalName: string,
  contentType: string
): Promise<{ path: string; filename: string }> {
  await ensureUploadDir();
  const ext = path.extname(originalName);
  const filename = `${crypto.randomUUID()}${ext}`;
  const filePath = path.join(UPLOAD_DIR, filename);
  await fs.writeFile(filePath, buffer);
  return { path: filePath, filename };
}

export async function getUploadedFile(filename: string): Promise<Buffer | null> {
  try {
    const filePath = path.join(UPLOAD_DIR, filename);
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}

export async function deleteUploadedFile(filename: string): Promise<void> {
  try {
    const filePath = path.join(UPLOAD_DIR, filename);
    await fs.unlink(filePath);
  } catch {
    // ignore
  }
}
