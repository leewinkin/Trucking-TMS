export function invoiceMatchStatus(invoice) {
  return invoice?.shipmentId ? "matched" : "unmatched";
}
