import net from "node:net";

const privateIpv4Ranges = [
  ["10.0.0.0", 8],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["0.0.0.0", 8],
  ["100.64.0.0", 10],
  ["198.18.0.0", 15]
];
const safeContentTypes = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/tiff",
  "application/octet-stream"
]);

export function buildAllowedDocumentHosts(...values) {
  const hosts = new Set();
  values.flatMap((value) => String(value || "").split(",")).forEach((value) => {
    const text = String(value || "").trim();
    if (!text) return;
    try {
      const parsed = text.includes("://") ? new URL(text) : new URL(`https://${text}`);
      if (parsed.hostname && !isUnsafeHostname(parsed.hostname)) {
        hosts.add(parsed.hostname.toLowerCase());
      }
    } catch {
      // Ignore invalid configuration rather than widening access.
    }
  });
  return hosts;
}

export function validateDocumentDownloadUrl(value, allowedHosts) {
  let parsed;
  try {
    parsed = new URL(String(value || ""));
  } catch {
    return { ok: false, code: "INVALID_DOCUMENT_URL", message: "Document URL is invalid." };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, code: "UNSUPPORTED_DOCUMENT_URL", message: "Document downloads require HTTPS." };
  }
  if (isUnsafeHostname(parsed.hostname)) {
    return { ok: false, code: "UNSAFE_DOCUMENT_HOST", message: "Document host is not allowed." };
  }
  const allowed = allowedHosts instanceof Set ? allowedHosts : buildAllowedDocumentHosts(allowedHosts);
  if (!allowed.has(parsed.hostname.toLowerCase())) {
    return { ok: false, code: "DOCUMENT_HOST_NOT_ALLOWED", message: "Document host is not allowed." };
  }
  return { ok: true, url: parsed };
}

export function isUnsafeHostname(hostname) {
  const host = String(hostname || "").trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "metadata.google.internal") return true;
  const ipVersion = net.isIP(host);
  if (ipVersion === 4) return isUnsafeIpv4(host);
  if (ipVersion === 6) return isUnsafeIpv6(host);
  return false;
}

export function safeDocumentContentType(value) {
  const type = String(value || "").split(";")[0].trim().toLowerCase();
  return safeContentTypes.has(type) ? type : "";
}

export async function fetchSecureDocument(url, {
  allowedHosts,
  fetchImpl = fetch,
  maxBytes = 25 * 1024 * 1024,
  maxRedirects = 3,
  timeoutMs = 30000
} = {}) {
  let current = String(url || "");
  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const validation = validateDocumentDownloadUrl(current, allowedHosts);
    if (!validation.ok) {
      return { ok: false, status: 400, error: validation };
    }
    const response = await fetchImpl(validation.url.href, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs)
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirectCount === maxRedirects) {
        return { ok: false, status: 502, error: { code: "DOCUMENT_REDIRECT_REJECTED", message: "Document redirect was rejected." } };
      }
      current = new URL(location, validation.url).href;
      continue;
    }
    if (!response.ok) {
      return { ok: false, status: 502, error: { code: "DOCUMENT_DOWNLOAD_FAILED", message: "Could not fetch carrier document." } };
    }
    const contentType = safeDocumentContentType(response.headers.get("content-type"));
    if (!contentType) {
      return { ok: false, status: 502, error: { code: "UNSAFE_DOCUMENT_CONTENT_TYPE", message: "Carrier document content type is not allowed." } };
    }
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > maxBytes) {
      return { ok: false, status: 502, error: { code: "DOCUMENT_TOO_LARGE", message: "Carrier document is too large to proxy." } };
    }
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > maxBytes) {
      return { ok: false, status: 502, error: { code: "DOCUMENT_TOO_LARGE", message: "Carrier document is too large to proxy." } };
    }
    return { ok: true, contentType, body: Buffer.from(arrayBuffer), finalUrl: validation.url.href };
  }
  return { ok: false, status: 502, error: { code: "DOCUMENT_REDIRECT_REJECTED", message: "Document redirect was rejected." } };
}

function isUnsafeIpv4(ip) {
  const value = ipv4ToNumber(ip);
  return privateIpv4Ranges.some(([range, bits]) => {
    const base = ipv4ToNumber(range);
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (value & mask) === (base & mask);
  });
}

function isUnsafeIpv6(ip) {
  const host = ip.toLowerCase();
  return host === "::1" ||
    host === "::" ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("fe8") ||
    host.startsWith("fe9") ||
    host.startsWith("fea") ||
    host.startsWith("feb") ||
    host.startsWith("::ffff:127.") ||
    host.startsWith("::ffff:10.") ||
    host.startsWith("::ffff:169.254.") ||
    host.startsWith("::ffff:192.168.");
}

function ipv4ToNumber(ip) {
  return ip.split(".").reduce((value, part) => ((value << 8) + Number(part)) >>> 0, 0);
}
