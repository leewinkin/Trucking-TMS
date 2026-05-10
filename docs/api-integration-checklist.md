# API Integration Checklist

Use this checklist for Mothership first, then repeat it for Speedship and Priority1.

## Credentials

- API base URL
- Sandbox API token, if available
- Production API token
- Account ID or customer ID, if required
- Token expiration rules
- Rate limits
- IP allowlist requirements, if any

## Quote API

Collect:

- Endpoint URL
- HTTP method
- Required headers
- Required request fields
- Optional request fields
- Example request
- Example successful response
- Example validation error response
- Quote expiration rules
- Whether quoted cost includes fuel/accessorials
- Whether quote can change at booking time

## Booking API

Collect:

- Endpoint URL
- HTTP method
- Required headers
- Required request fields
- Required quote ID or rate ID
- Example request
- Example successful response
- Example booking failure response
- Cancellation rules
- Label/BOL/document availability

## Tracking API

Collect:

- Endpoint URL
- HTTP method
- Required identifiers
- Tracking status values
- Event format
- Webhook support, if available
- Polling limits, if no webhook exists

## Invoice Or Billing API

Collect:

- Whether carrier invoice data is available
- Endpoint URL
- Invoice status fields
- Final cost adjustment rules
- Document/PDF availability

## Error Handling

Document:

- Authentication errors
- Validation errors
- No-rate-found responses
- Booking rejection responses
- Timeout behavior
- Retry guidance
- Support contact path

## Mapping Questions

Before integration, answer:

- What shipment types does the API support?
- Does it support LTL, FTL, local delivery, or parcel?
- Which accessorials are supported?
- Does the API require freight class?
- Does it require dimensions?
- Does it return multiple carrier/service options?
- Does booking require the exact quote response?
- Can bookings be canceled through API?
- Are tracking webhooks available?

