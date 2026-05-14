# Freight API Matrix

This document records how each carrier API represents freight lines so the quote UI can stay consistent without creating pallet or weight inflation.

## Canonical app rule

One freight row in the UI should mean one handling-unit line in the app:

- `quantity`: number of handling units or pallets
- `type`: handling unit type such as `Pallet`
- `weight`: weight per handling unit
- `length`, `width`, `height`: dimensions per handling unit
- `freightClass`: optional or required depending on carrier
- `pieces`: optional pieces per handling unit, only when the carrier truly needs it
- `nmfc`: optional
- `description`: commodity description
- flags such as `stackable`, `hazmat`, `used`, `machinery`

The adapters should derive totals from that model. They should not ask the user for both total and per-unit values for the same concept.

## Mothership

Source:
- [docs/mothership-integration.md](/C:/Users/leewi/Documents/Codex/2026-05-10/use-github-to-review-my-open/docs/mothership-integration.md)
- [Create a quote](https://developers.mothership.com/reference/createquote)

Freight shape:
- Uses `freight` as an array.
- The docs explicitly say each array element is a different line item of freight.

Per-item fields confirmed:
- `quantity`
- `type`
- `weight`
- `length`
- `width`
- `height`
- `description`

Notes:
- Multi-item support: `yes`
- Freight class in quote request: `no documented field`
- NMFC in quote request: `no documented field`
- Shipment create supports `referenceNumber` for the carrier-side reference / PO.
- Lowest-risk carrier for a shared freight UI because the request is a simple line-item array.

## Priority1 LTL

Source:
- [v2(1).json](</C:/Users/leewi/xwechat_files/kin852357_107a/msg/file/2026-05/v2(1).json>)

Freight shape:
- Uses `items` in the rate quote request.
- Also documents `enhancedHandlingUnits`.

Per-item fields confirmed in `items`:
- `freightClass`
- `packagingType`
- `units`
- `pieces`
- `totalWeight`
- `length`
- `width`
- `height`
- `isStackable`
- `isHazardous`
- `isUsed`
- `isMachinery`
- `nmfcItemCode`
- `nmfcSubCode`
- `description`

Additional structure:
- `enhancedHandlingUnits[].units`
- `enhancedHandlingUnits[].packages[].packageFreightClass`
- `enhancedHandlingUnits[].packages[].weightPerPackage`
- `enhancedHandlingUnits[].packages[].quantity`
- `enhancedHandlingUnits[].packages[].pieces`

Notes:
- Multi-item support: `yes`
- Freight class: `yes`
- NMFC: `yes`
- Highest double-count risk if both `items` and `enhancedHandlingUnits` are populated from the same row without a clear ownership rule.
- The UI should not mirror the nested package structure directly unless we intentionally support package-per-unit detail.

## SpeedShip LTL

Source:
- [API_Speedship_myUni_sandbox v1.9b.postman_collection.json](</C:/Users/leewi/Downloads/SpeedshipMyUnishippers_1.9b (1)/SpeedshipMyUnishippers_1.9b/API_Speedship_myUni_sandbox v1.9b.postman_collection.json>)

Freight shape:
- LTL `shopFlow` uses `shipment.handlingUnitList[]`.
- Each handling unit contains `quantity`, `billedDimension`, `weight`, and `shippedItemList[]`.
- There is also `totalHandlingUnitCount` and `totalWeight` at shipment level.
- Simpler `estimateQuoteFlow` only uses one `commodityClass` plus total weight.

Per-line fields confirmed in `handlingUnitList`:
- `quantity`
- `billedDimension.length`
- `billedDimension.width`
- `billedDimension.height`
- `packagingType`
- `weight`

Nested shipped item fields:
- `commodityClass`
- `commodityDescription`
- `dimensions`
- `quantity`
- `weight`
- hazmat data

Notes:
- Multi-item support: `yes`
- Freight class: `yes`, as `commodityClass`
- NMFC: `yes`, sample includes `NMFCDescription` and `NMFCNbr`
- Shipment-level reference lives on `shipment.shipmentReferenceList[]`; the LTL examples use `Shipment Reference 1`.
- High double-count risk because quantity appears at:
  - handling unit level
  - shipped item level
  - shipment `totalHandlingUnitCount`
- Shared UI should treat quantity as the handling-unit count and let the adapter derive shipment totals.

## FedEx Freight

Source:
- [ltl-freight.json](</C:/Users/leewi/Downloads/ltl-freight.json>)
- [Freight LTL API docs](https://developer.fedex.com/api/en-pg/catalog/ltl-freight/docs.html)

Freight shape:
- Shipment-level `requestedPackageLineItems[]`
- Freight-level `freightShipmentDetail.lineItem[]`
- Docs explicitly support multi-piece and multi-handling-unit shipments.

Per-handling-unit fields confirmed in `requestedPackageLineItems`:
- `groupPackageCount`
- `weight`
- `dimensions`
- `subPackagingType`

Per-freight-line fields confirmed in `freightShipmentDetail.lineItem`:
- `freightClass`
- `pieces`
- `description`
- `subPackagingType`
- `weight`
- `dimensions`
- `nmfcCode`

Notes:
- Multi-item support: `yes`
- Freight class: `yes`
- NMFC: `yes`
- Shipment APIs expose `shipmentIdentifiers[]`, including `CUSTOMER_REFERENCE` and `PURCHASE_ORDER`.
- Quote requests do not currently show a reference field in the supplied OpenAPI, so the reference should be attached when a shipment is created or dispatched.
- Like SpeedShip, it has both shipment-level handling-unit detail and freight-line detail, so the adapter must decide which field owns count and which field owns descriptive freight classification.

## Sunset Pacific

Source:
- [MF -Sunset Impl. API Document.pdf](</C:/Users/leewi/xwechat_files/kin852357_107a/msg/file/2026-05/MF -Sunset Impl. API Document.pdf>)
- [Sunset Pacific API Carrier Profile](https://sunsetpacific.com/api-carrier-profile/)

What is confirmed:
- Sunset has API quoting and tender instructions available.
- Public setup guidance points to API credentials and tender flow.

What is not yet confirmed from the supplied PDF in this environment:
- exact quote request body
- whether freight lines are represented as `items`, `handlingUnits`, or another shape
- exact support for `pieces`, `freightClass`, and `NMFC`

Notes:
- Multi-item support: `not yet verified`
- Freight class: `not yet verified`
- NMFC: `not yet verified`
- We should not refactor the freight UI around Sunset until we extract the request schema from the PDF or get an OpenAPI/Postman export.

## Safe shared UI fields

These are safe to standardize across the carriers we could verify:

- `Cargo type / handling unit`
- `Quantity`
- `Weight (each)`
- `Length (each)`
- `Width (each)`
- `Height (each)`
- `Description`
- `Freight class`

These should stay optional unless the chosen carrier requires them:

- `Pieces per handling unit`
- `NMFC`
- `Stackable`
- `Hazmat`
- `Used`
- `Machinery`

## Recommended implementation rule

To avoid pallet inflation:

- The UI should keep one row per freight line.
- `quantity` should mean handling-unit count everywhere in the app.
- `weight` should mean per-handling-unit weight everywhere in the app.
- The adapters should calculate shipment totals.
- Each carrier adapter should have one authoritative count source, even if that carrier exposes several nested count fields.
- The quote audit panel should store the outbound payload for every carrier run so we can compare it to the saved carrier quote.
