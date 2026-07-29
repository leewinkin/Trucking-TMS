export const documentTypes = new Set(["bol", "pod", "invoice", "other"]);

export function normalizeDocumentType(value) {
  const text = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (["bol", "billoflading", "billlading"].includes(text)) return "bol";
  if (["pod", "proofofdelivery", "deliveryreceipt"].includes(text)) return "pod";
  if (["invoice", "carrierinvoice", "customerinvoice"].includes(text)) return "invoice";
  return "other";
}

export function documentCustomerVisible(type) {
  return type === "bol" || type === "pod";
}

export function stableDocumentKey(provider, parts) {
  return [provider, ...parts.map((part) => String(part || "").trim()).filter(Boolean)].join(":");
}

export function stableUrlReference(value) {
  try {
    const parsed = new URL(String(value || ""));
    parsed.search = "";
    parsed.hash = "";
    return parsed.href;
  } catch {
    return String(value || "").split("?")[0].split("#")[0].trim();
  }
}

export function urlHasSensitiveQuery(value) {
  try {
    const parsed = new URL(String(value || ""));
    return Array.from(parsed.searchParams.keys()).some(isSensitiveKey);
  } catch {
    return /[?&](authorization|token|access_token|api_key|signature|sig|x-amz-signature|x-amz-credential|x-amz-security-token)=/i.test(String(value || ""));
  }
}

export function sanitizeProviderReference(reference = {}) {
  return Object.fromEntries(
    Object.entries(reference)
      .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "")
      .filter(([key]) => !isSensitiveKey(key))
      .map(([key, value]) => {
        if (["url", "downloadUrl", "documentUrl"].includes(String(key))) {
          return [key, stableUrlReference(value)];
        }
        return [key, String(value).trim()];
      })
  );
}

export function redactSensitiveMetadata(value, depth = 0) {
  if (!value || depth > 8) return value;
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveMetadata(item, depth + 1));
  }
  if (typeof value !== "object") {
    if (typeof value === "string" && /^https?:\/\//i.test(value)) {
      return stableUrlReference(value);
    }
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isSensitiveKey(key))
      .map(([key, child]) => [key, redactSensitiveMetadata(child, depth + 1)])
  );
}

export function readNestedString(source, paths) {
  for (const path of paths) {
    let current = source;
    for (const segment of path) {
      current = current?.[segment];
      if (current === undefined || current === null) break;
    }
    if (current !== undefined && current !== null && String(current).trim()) {
      return String(current).trim();
    }
  }
  return "";
}

export function collectUrlDocuments(payload, provider, fallbackType = "other") {
  const records = [];
  const seen = new Set();
  const visit = (value, depth = 0) => {
    if (!value || depth > 6) return;
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1));
      return;
    }
    if (typeof value === "string") {
      const url = value.trim();
      if (/^https?:\/\//i.test(url) && !seen.has(url)) {
        seen.add(url);
        const type = normalizeDocumentType(fallbackType);
        const safeUrl = stableUrlReference(url);
        records.push({
          provider,
          externalDocumentKey: stableDocumentKey(provider, [type, safeUrl]),
          documentType: type,
          label: type === "bol" ? "Bill of Lading" : type === "pod" ? "Proof of Delivery" : "Document",
          providerReference: { url: safeUrl },
          status: urlHasSensitiveQuery(url) ? "pending" : "available",
          rawMetadata: {},
          fetchedAt: new Date().toISOString()
        });
      }
      return;
    }
    if (typeof value !== "object") return;
    const url = readNestedString(value, [["url"], ["downloadUrl"], ["documentUrl"], ["href"], ["link"], ["uri"], ["downloadLink"]]);
    if (url && /^https?:\/\//i.test(url) && !seen.has(url)) {
      seen.add(url);
      const type = normalizeDocumentType(value.type || value.documentType || value.name || value.label || fallbackType);
      const safeUrl = stableUrlReference(url);
      const id = readNestedString(value, [["id"], ["documentId"], ["documentID"], ["key"], ["type"]]) || safeUrl;
      records.push({
        provider,
        externalDocumentKey: stableDocumentKey(provider, [type, id]),
        documentType: type,
        label: type === "bol" ? "Bill of Lading" : type === "pod" ? "Proof of Delivery" : String(value.label || value.name || "Document").trim(),
        filename: value.filename || value.fileName || null,
        contentType: value.contentType || value.mimeType || null,
        status: urlHasSensitiveQuery(url) ? "pending" : "available",
        providerReference: sanitizeProviderReference({ id, url }),
        rawMetadata: redactSensitiveMetadata(value),
        fetchedAt: new Date().toISOString()
      });
    }
    Object.values(value).forEach((child) => {
      if (child && typeof child === "object") visit(child, depth + 1);
    });
  };
  visit(payload);
  return records;
}

function isSensitiveKey(key) {
  return /^(authorization|token|access_token|api_key|signature|sig|x-amz-signature|x-amz-credential|x-amz-security-token|cookie|set-cookie)$/i.test(String(key || ""));
}
