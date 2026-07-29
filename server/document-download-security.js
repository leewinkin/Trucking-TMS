import net from "node:net";
import dns from "node:dns/promises";
import https from "node:https";

const privateIpv4Ranges = [
  ["10.0.0.0", 8],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["0.0.0.0", 8],
  ["100.64.0.0", 10],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4]
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
  if (parsed.username || parsed.password) {
    return { ok: false, code: "DOCUMENT_URL_CREDENTIALS_REJECTED", message: "Document URL credentials are not allowed." };
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

export async function validateResolvedDocumentUrl(value, allowedHosts, resolveHost = defaultResolveHost) {
  const validation = validateDocumentDownloadUrl(value, allowedHosts);
  if (!validation.ok) {
    return validation;
  }
  const addresses = await resolveHost(validation.url.hostname);
  if (!addresses.length) {
    return { ok: false, code: "DOCUMENT_DNS_LOOKUP_FAILED", message: "Document host could not be resolved." };
  }
  const unsafe = addresses.find((address) => isUnsafeIpAddress(address.address || address));
  if (unsafe) {
    return { ok: false, code: "DOCUMENT_HOST_RESOLVES_PRIVATE", message: "Document host resolved to a private or local address." };
  }
  return { ...validation, addresses };
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

export function isUnsafeIpAddress(address) {
  const ip = String(address || "").trim().toLowerCase().replace(/^\[|\]$/g, "");
  const version = net.isIP(ip);
  if (version === 4) return isUnsafeIpv4(ip);
  if (version === 6) return isUnsafeIpv6(ip);
  return true;
}

export function safeDocumentContentType(value) {
  const type = String(value || "").split(";")[0].trim().toLowerCase();
  return safeContentTypes.has(type) ? type : "";
}

export async function fetchSecureDocument(url, {
  allowedHosts,
  requestImpl = requestPinnedHttps,
  resolveHost = defaultResolveHost,
  maxBytes = 25 * 1024 * 1024,
  maxRedirects = 3,
  timeoutMs = 30000
} = {}) {
  let current = String(url || "");
  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const validation = await validateResolvedDocumentUrl(current, allowedHosts, resolveHost);
    if (!validation.ok) {
      return { ok: false, status: 400, error: validation };
    }
    let response;
    try {
      response = await requestImpl(validation.url, validation.addresses, { timeoutMs, maxBytes });
    } catch {
      return { ok: false, status: 502, error: { code: "DOCUMENT_DOWNLOAD_FAILED", message: "Could not fetch carrier document." } };
    }
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

async function defaultResolveHost(hostname) {
  const rows = await dns.lookup(hostname, { all: true, verbatim: true });
  return rows.map((row) => ({ address: row.address, family: row.family }));
}

function requestPinnedHttps(url, addresses, { timeoutMs, maxBytes } = {}) {
  const pinned = addresses[0];
  return new Promise((resolve, reject) => {
    const request = https.request({
      protocol: url.protocol,
      hostname: url.hostname,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      port: url.port || 443,
      servername: url.hostname,
      headers: { Host: url.host },
      lookup: (hostname, options, callback) => {
        callback(null, pinned.address, pinned.family || net.isIP(pinned.address));
      },
      timeout: timeoutMs
    }, (response) => {
      const chunks = [];
      let totalBytes = 0;
      response.on("data", (chunk) => {
        totalBytes += chunk.length;
        if (maxBytes && totalBytes > maxBytes) {
          request.destroy(new Error("Carrier document is too large to proxy."));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        const body = Buffer.concat(chunks);
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode,
          headers: { get: (key) => response.headers[String(key).toLowerCase()] || null },
          async arrayBuffer() {
            return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
          }
        });
      });
    });
    request.on("timeout", () => request.destroy(new Error("Document download timed out.")));
    request.on("error", reject);
    request.end();
  });
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
  if (host.startsWith("::ffff:")) {
    const mapped = host.slice("::ffff:".length);
    if (net.isIP(mapped) === 4) return isUnsafeIpv4(mapped);
    const parts = mapped.split(":");
    if (parts.length === 2) {
      const high = Number.parseInt(parts[0], 16);
      const low = Number.parseInt(parts[1], 16);
      if (Number.isFinite(high) && Number.isFinite(low)) {
        return isUnsafeIpv4(`${(high >> 8) & 255}.${high & 255}.${(low >> 8) & 255}.${low & 255}`);
      }
    }
  }
  return host === "::1" ||
    host === "::" ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("ff") ||
    host.startsWith("fe8") ||
    host.startsWith("fe9") ||
    host.startsWith("fea") ||
    host.startsWith("feb");
}

function ipv4ToNumber(ip) {
  return ip.split(".").reduce((value, part) => ((value << 8) + Number(part)) >>> 0, 0);
}
