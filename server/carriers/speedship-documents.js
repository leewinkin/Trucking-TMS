import { normalizeDocumentType, readNestedString, sanitizeProviderReference, stableDocumentKey, stableUrlReference, urlHasSensitiveQuery } from "./document-normalizer.js";

export function normalizeSpeedshipDocuments(payload, shipment = {}, productTransactionId = "") {
  return speedshipDocumentRecords(payload).map((record) => {
    const safeUrl = stableUrlReference(record.url);
    return {
      provider: "speedship",
      shipmentId: shipment.id || null,
      customerId: shipment.customerId || null,
      externalDocumentKey: stableDocumentKey("speedship", ["bol", record.id || safeUrl]),
      documentType: "bol",
      label: "Bill of Lading",
      filename: record.filename || null,
      contentType: record.contentType || null,
      status: urlHasSensitiveQuery(record.url) ? "pending" : "available",
      customerVisible: true,
      providerReference: sanitizeProviderReference({
        id: record.id,
        url: record.url,
        productTransactionId
      }),
      rawMetadata: {},
      fetchedAt: new Date().toISOString()
    };
  });
}

export function speedshipDocumentRecords(payload) {
  const collections = [
    payload?.documents,
    payload?.documentList,
    payload?.data?.documents,
    payload?.response?.documents,
    payload?.billOfLadingDocuments,
    payload?.bolDocuments,
    payload?.data?.billOfLadingDocuments,
    payload?.data?.bolDocuments
  ].filter(Array.isArray);
  return collections.flatMap((items) =>
    items.map((item) => normalizeSpeedshipDocumentRecord(item, isBolOnlyCollection(items, payload))).filter(Boolean)
  );
}

function normalizeSpeedshipDocumentRecord(item, bolOnlyCollection = false) {
  if (!item || typeof item !== "object") return null;
  const rawType = readNestedString(item, [["documentType"], ["docType"], ["type"], ["name"], ["label"]]);
  const isBol = bolOnlyCollection || ["bill_of_lading", "billoflading", "bol"].includes(rawType.toLowerCase().replace(/[\s-]+/g, "_")) || normalizeDocumentType(rawType) === "bol";
  if (!isBol) return null;
  const url = readNestedString(item, [["documentUrl"], ["downloadUrl"], ["url"], ["href"]]);
  if (!/^https:\/\//i.test(url)) return null;
  return {
    id: readNestedString(item, [["documentId"], ["id"], ["key"]]),
    url,
    filename: readNestedString(item, [["filename"], ["fileName"]]) || null,
    contentType: readNestedString(item, [["contentType"], ["mimeType"]]) || null
  };
}

function isBolOnlyCollection(items, payload) {
  return items === payload?.billOfLadingDocuments ||
    items === payload?.bolDocuments ||
    items === payload?.data?.billOfLadingDocuments ||
    items === payload?.data?.bolDocuments;
}

export function speedshipCapabilitySummary(reason = "SpeedShip invoice API contract unavailable.") {
  return {
    provider: "speedship",
    fetched: 0,
    created: 0,
    updated: 0,
    skipped: 1,
    unmatched: 0,
    failed: 0,
    message: reason
  };
}
