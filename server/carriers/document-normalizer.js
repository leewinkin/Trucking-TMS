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

export function sanitizeProviderReference(reference = {}) {
  return Object.fromEntries(
    Object.entries(reference)
      .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "")
      .map(([key, value]) => [key, String(value).trim()])
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
        records.push({
          provider,
          externalDocumentKey: stableDocumentKey(provider, [type, url]),
          documentType: type,
          label: type === "bol" ? "Bill of Lading" : type === "pod" ? "Proof of Delivery" : "Document",
          providerReference: { url },
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
      const id = readNestedString(value, [["id"], ["documentId"], ["documentID"], ["key"], ["type"]]) || url;
      records.push({
        provider,
        externalDocumentKey: stableDocumentKey(provider, [type, id]),
        documentType: type,
        label: type === "bol" ? "Bill of Lading" : type === "pod" ? "Proof of Delivery" : String(value.label || value.name || "Document").trim(),
        filename: value.filename || value.fileName || null,
        contentType: value.contentType || value.mimeType || null,
        providerReference: sanitizeProviderReference({ id, url }),
        rawMetadata: value,
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
