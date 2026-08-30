const crypto = require("crypto");

const MAX_BYTES = Number(process.env.MAX_DOCUMENT_BYTES || 10 * 1024 * 1024);
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "text/plain",
  "application/json",
]);
const BLOCKED_EXTENSIONS = new Set([
  ".bat",
  ".cmd",
  ".com",
  ".dll",
  ".exe",
  ".hta",
  ".js",
  ".ps1",
  ".sh",
  ".vbs",
]);

function decodeContent(contentBase64) {
  const raw = contentBase64.replace(/^data:[^;]+;base64,/, "");
  if (!/^[a-z0-9+/]*={0,2}$/i.test(raw) || raw.length % 4 === 1) {
    throw Object.assign(new Error("contentBase64 is invalid"), { status: 400 });
  }
  const content = Buffer.from(raw, "base64");
  if (!content.length) {
    throw Object.assign(new Error("Document cannot be empty"), { status: 400 });
  }
  if (content.length > MAX_BYTES) {
    throw Object.assign(new Error(`Document exceeds ${MAX_BYTES} byte limit`), { status: 413 });
  }
  return content;
}

function scanDocument({ filename, mimeType, content }) {
  const extension = filename.toLowerCase().slice(filename.lastIndexOf("."));
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return {
      status: "rejected",
      result: { reason: "mime_type_not_allowed", mimeType },
    };
  }
  if (BLOCKED_EXTENSIONS.has(extension)) {
    return {
      status: "rejected",
      result: { reason: "executable_extension_not_allowed", extension },
    };
  }
  if (content.includes(Buffer.from("<script", "utf8"))) {
    return {
      status: "rejected",
      result: { reason: "script_marker_detected" },
    };
  }
  return {
    status: "simulated_clean",
    result: {
      scanner: "zikkaron-simulated-scanner",
      note: "Replace with a managed malware scanner before production uploads.",
    },
  };
}

async function uploadToIpfs({ filename, mimeType, content }) {
  const hash = crypto.createHash("sha256").update(content).digest("hex");
  const endpoint = process.env.IPFS_API_URL;
  if (!endpoint) {
    return {
      cid: `sha256-${hash}`,
      storageMode: "hash_only_fallback",
      hash,
      warning: "IPFS_API_URL is not configured; content was not pinned to IPFS.",
    };
  }

  try {
    const form = new FormData();
    form.append("file", new Blob([content], { type: mimeType }), filename);
    const response = await fetch(`${endpoint.replace(/\/$/, "")}/api/v0/add`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(Number(process.env.IPFS_TIMEOUT_MS || 10000)),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.Hash) {
      throw new Error(data.Message || `IPFS upload failed (${response.status})`);
    }
    return { cid: data.Hash, storageMode: "ipfs", hash };
  } catch (err) {
    if (process.env.IPFS_UPLOAD_REQUIRED === "true") {
      throw Object.assign(new Error(`IPFS upload required: ${err.message}`), { status: 503 });
    }
    return {
      cid: `sha256-${hash}`,
      storageMode: "hash_only_fallback",
      hash,
      warning: `IPFS unavailable; content was not pinned (${err.message}).`,
    };
  }
}

module.exports = {
  ALLOWED_MIME_TYPES,
  MAX_BYTES,
  decodeContent,
  scanDocument,
  uploadToIpfs,
};
