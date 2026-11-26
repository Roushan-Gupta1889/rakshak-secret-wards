export const BACKEND_CONTRACT = {
  provenance: "FROZEN" as const,
  sourceMilestone: "Phase 2A (368b981e · apps/api/rakshak_api/config.py)",
  processExtensions: [".csv", ".tsv", ".json", ".txt"] as const,
  quarantineExtensions: [".pdf", ".jpg", ".jpeg", ".png", ".xml"] as const,
  allowedExtensions: [
    ".csv",
    ".tsv",
    ".json",
    ".txt",
    ".pdf",
    ".jpg",
    ".jpeg",
    ".png",
    ".xml",
  ] as const,
  maxFilesPerRun: 50,
  maxFileBytes: 5 * 1024 * 1024,
  maxBatchBytes: 25 * 1024 * 1024,
  maxFilenameLength: 180,
  maxPathDepth: 3,
  jobTtlSeconds: 900,
  subprocessTimeoutSeconds: 60,
} as const;

export type UploadClassification = "process" | "quarantine";

export interface SelectedUploadFile {
  id: string;
  file: File;
  relPath: string;
  extension: string;
  sizeBytes: number;
  classification: UploadClassification;
}

export interface FileValidationError {
  fileName: string;
  code:
    | "INVALID_FILENAME"
    | "PATH_TRAVERSAL"
    | "UNSUPPORTED_MEDIA_TYPE"
    | "FILE_TOO_LARGE"
    | "DUPLICATE_FILENAME"
    | "TOO_MANY_FILES"
    | "BATCH_TOO_LARGE";
  message: string;
}

export interface BatchValidationResult {
  accepted: SelectedUploadFile[];
  errors: FileValidationError[];
  totalBytes: number;
  processCount: number;
  quarantineCount: number;
}

const DRIVE_PREFIX_RX = /^[A-Za-z]:/;
// eslint-disable-next-line no-control-regex
const UNSAFE_CTRL_RX = /[\x00-\x1f\x7f]/;
const PROCESS_SET = new Set<string>(BACKEND_CONTRACT.processExtensions);
const QUARANTINE_SET = new Set<string>(BACKEND_CONTRACT.quarantineExtensions);

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

export function validateSingleUploadCandidate(
  file: File,
):
  | { ok: true; item: SelectedUploadFile }
  | { ok: false; error: FileValidationError } {
  const rawName = (file.webkitRelativePath && file.webkitRelativePath.trim()) || file.name || "";
  if (!rawName.trim()) {
    return {
      ok: false,
      error: {
        fileName: "(unnamed)",
        code: "INVALID_FILENAME",
        message: "Selected file has an empty filename.",
      },
    };
  }
  if (UNSAFE_CTRL_RX.test(rawName)) {
    return {
      ok: false,
      error: {
        fileName: rawName,
        code: "INVALID_FILENAME",
        message: "Filename contains illegal control characters.",
      },
    };
  }

  const normalized = rawName.replace(/\\/g, "/").trim();
  if (normalized.startsWith("/") || DRIVE_PREFIX_RX.test(normalized)) {
    return {
      ok: false,
      error: {
        fileName: rawName,
        code: "PATH_TRAVERSAL",
        message: "Absolute paths and Windows drive prefixes are rejected.",
      },
    };
  }
  if (normalized.length > BACKEND_CONTRACT.maxFilenameLength) {
    return {
      ok: false,
      error: {
        fileName: rawName,
        code: "INVALID_FILENAME",
        message: `Filename exceeds maximum length (${BACKEND_CONTRACT.maxFilenameLength}).`,
      },
    };
  }

  const parts = normalized.split("/").filter(Boolean);
  if (!parts.length || parts.some((p) => p === "." || p === ".." || p.startsWith("."))) {
    return {
      ok: false,
      error: {
        fileName: rawName,
        code: "PATH_TRAVERSAL",
        message: "Path traversal segments and hidden dotfiles are rejected.",
      },
    };
  }
  if (parts.length > BACKEND_CONTRACT.maxPathDepth) {
    return {
      ok: false,
      error: {
        fileName: rawName,
        code: "INVALID_FILENAME",
        message: `Nested directory depth cannot exceed ${BACKEND_CONTRACT.maxPathDepth} levels.`,
      },
    };
  }

  const safeRel = parts.join("/");
  const leaf = parts[parts.length - 1];
  const dot = leaf.lastIndexOf(".");
  if (dot <= 0) {
    return {
      ok: false,
      error: {
        fileName: safeRel,
        code: "UNSUPPORTED_MEDIA_TYPE",
        message: `File '${safeRel}' must have a supported extension (${BACKEND_CONTRACT.allowedExtensions.join(", ")}).`,
      },
    };
  }

  const ext = leaf.slice(dot).toLowerCase();
  let classification: UploadClassification | null = null;
  if (PROCESS_SET.has(ext)) classification = "process";
  else if (QUARANTINE_SET.has(ext)) classification = "quarantine";

  if (!classification) {
    return {
      ok: false,
      error: {
        fileName: safeRel,
        code: "UNSUPPORTED_MEDIA_TYPE",
        message: `Extension '${ext}' is unsupported. Allowed formats: ${BACKEND_CONTRACT.allowedExtensions.join(", ")}.`,
      },
    };
  }

  if (file.size > BACKEND_CONTRACT.maxFileBytes) {
    return {
      ok: false,
      error: {
        fileName: safeRel,
        code: "FILE_TOO_LARGE",
        message: `File '${safeRel}' (${formatBytes(file.size)}) exceeds the ${formatBytes(BACKEND_CONTRACT.maxFileBytes)} per-file backend limit.`,
      },
    };
  }

  return {
    ok: true,
    item: {
      id: `${safeRel}::${file.size}::${file.lastModified}`,
      file,
      relPath: safeRel,
      extension: ext,
      sizeBytes: file.size,
      classification,
    },
  };
}

export function mergeValidatedBatch(
  existing: SelectedUploadFile[],
  incomingFiles: File[],
): BatchValidationResult {
  const accepted: SelectedUploadFile[] = [...existing];
  const errors: FileValidationError[] = [];
  const seenRels = new Set(existing.map((f) => f.relPath));
  let totalBytes = existing.reduce((acc, f) => acc + f.sizeBytes, 0);

  for (const file of incomingFiles) {
    const res = validateSingleUploadCandidate(file);
    if (!res.ok) {
      errors.push(res.error);
      continue;
    }
    const item = res.item;
    if (seenRels.has(item.relPath)) {
      errors.push({
        fileName: item.relPath,
        code: "DUPLICATE_FILENAME",
        message: `Duplicate relative file path '${item.relPath}' ignored.`,
      });
      continue;
    }
    if (accepted.length + 1 > BACKEND_CONTRACT.maxFilesPerRun) {
      errors.push({
        fileName: item.relPath,
        code: "TOO_MANY_FILES",
        message: `Batch limit of ${BACKEND_CONTRACT.maxFilesPerRun} files reached; '${item.relPath}' not added.`,
      });
      continue;
    }
    if (totalBytes + item.sizeBytes > BACKEND_CONTRACT.maxBatchBytes) {
      errors.push({
        fileName: item.relPath,
        code: "BATCH_TOO_LARGE",
        message: `Adding '${item.relPath}' (${formatBytes(item.sizeBytes)}) would exceed the ${formatBytes(BACKEND_CONTRACT.maxBatchBytes)} batch limit.`,
      });
      continue;
    }

    seenRels.add(item.relPath);
    totalBytes += item.sizeBytes;
    accepted.push(item);
  }

  let processCount = 0;
  let quarantineCount = 0;
  for (const item of accepted) {
    if (item.classification === "process") processCount += 1;
    else quarantineCount += 1;
  }

  return {
    accepted,
    errors,
    totalBytes,
    processCount,
    quarantineCount,
  };
}

