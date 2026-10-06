import "server-only";
import { fileTypeFromBuffer } from "file-type";

/**
 * Upload type validation. The extension, the declared MIME type and the type detected from the
 * file's bytes must all agree, and only allowlisted types are accepted. SVG, HTML, executables,
 * scripts and archives are always rejected.
 */

type AllowedType = {
  /** Canonical MIME type stored and served for this file type. */
  mime: string;
  /** Declared MIME types browsers commonly send for this extension. */
  declared: readonly string[];
  /** file-type detection result ("text" = no magic bytes; validated as UTF-8 text). */
  detected: string;
  previewable: boolean;
};

const TEXT_DECLARED = ["text/plain", "application/octet-stream"];

export const ALLOWED_TYPES: Record<string, AllowedType> = {
  pdf: { mime: "application/pdf", declared: ["application/pdf"], detected: "pdf", previewable: true },
  png: { mime: "image/png", declared: ["image/png"], detected: "png", previewable: true },
  jpg: { mime: "image/jpeg", declared: ["image/jpeg", "image/jpg", "image/pjpeg"], detected: "jpg", previewable: true },
  jpeg: { mime: "image/jpeg", declared: ["image/jpeg", "image/jpg", "image/pjpeg"], detected: "jpg", previewable: true },
  webp: { mime: "image/webp", declared: ["image/webp"], detected: "webp", previewable: true },
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    declared: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    detected: "docx",
    previewable: false,
  },
  xlsx: {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    declared: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    detected: "xlsx",
    previewable: false,
  },
  pptx: {
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    declared: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
    detected: "pptx",
    previewable: false,
  },
  csv: { mime: "text/csv", declared: ["text/csv", "application/csv", "application/vnd.ms-excel", ...TEXT_DECLARED], detected: "text", previewable: false },
  txt: { mime: "text/plain", declared: TEXT_DECLARED, detected: "text", previewable: false },
  log: { mime: "text/plain", declared: [...TEXT_DECLARED, "text/x-log"], detected: "text", previewable: false },
  md: { mime: "text/markdown", declared: ["text/markdown", "text/x-markdown", ...TEXT_DECLARED], detected: "text", previewable: false },
  json: { mime: "application/json", declared: ["application/json", "text/json", ...TEXT_DECLARED], detected: "text", previewable: false },
};

export const ALLOWED_EXTENSIONS = Object.keys(ALLOWED_TYPES);
export const ACCEPT_ATTRIBUTE = ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",");

export type FileCheckResult =
  | { ok: true; ext: string; mime: string; previewable: boolean }
  | { ok: false; reason: string };

export function extensionOf(filename: string): string {
  const m = /\.([A-Za-z0-9]{1,10})$/.exec(filename.trim());
  return m?.[1]?.toLowerCase() ?? "";
}

const MARKUP_PREFIX = /^(?:﻿)?\s*<(?:!doctype\s+html|html|svg|\?xml|script|head|body|iframe)\b/i;

function isCleanUtf8Text(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

export async function checkUploadedFile(
  filename: string,
  declaredMime: string | null,
  bytes: Uint8Array,
): Promise<FileCheckResult> {
  const ext = extensionOf(filename);
  const allowed = ALLOWED_TYPES[ext];
  if (!allowed) {
    return { ok: false, reason: `Files of type .${ext || "(none)"} are not accepted. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}.` };
  }
  if (bytes.byteLength === 0) return { ok: false, reason: "The file is empty." };

  const declared = (declaredMime ?? "").split(";")[0]!.trim().toLowerCase();
  if (declared && !allowed.declared.includes(declared)) {
    return { ok: false, reason: `The declared content type (${declared}) does not match the .${ext} extension.` };
  }

  const detected = await fileTypeFromBuffer(bytes);
  if (allowed.detected === "text") {
    if (detected) {
      return { ok: false, reason: `The file content (${detected.ext}) does not match the .${ext} extension.` };
    }
    if (!isCleanUtf8Text(bytes)) return { ok: false, reason: "Text files must be valid UTF-8 without binary content." };
    const head = new TextDecoder("utf-8").decode(bytes.subarray(0, 512));
    if (MARKUP_PREFIX.test(head)) return { ok: false, reason: "HTML, SVG and XML content is not accepted." };
  } else if (!detected || detected.ext !== allowed.detected) {
    return {
      ok: false,
      reason: detected
        ? `The file content (${detected.ext}) does not match the .${ext} extension.`
        : `The file content is not a valid .${ext} file.`,
    };
  }
  return { ok: true, ext, mime: allowed.mime, previewable: allowed.previewable };
}

/** Display-only filename: strips paths and control characters, limits length. Never used in storage keys. */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  let out = "";
  for (const ch of base) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 0x20 || c === 0x7f || '<>:"|?*'.includes(ch)) continue;
    out += ch;
  }
  out = out.trim().replace(/^\.+/, "");
  if (!out) out = "file";
  if (out.length > 200) {
    const ext = extensionOf(out);
    out = `${out.slice(0, 190)}${ext ? `.${ext}` : ""}`;
  }
  return out;
}

/**
 * Malware scanning hook. A no-op in the MVP; replace with a call to a scanner (e.g. ClamAV or a
 * cloud scanning API) and return { clean: false } to reject. See docs/SECURITY.md.
 */
export async function scanFile(_bytes: Uint8Array, _meta: { filename: string; mime: string }): Promise<{ clean: boolean }> {
  return { clean: true };
}
