# Multi-Tenant Portals Architecture Proposal

## Scope

This proposal covers a safe path from the current two-role prototype toward three distinct experiences in one product:

- Internal staff portal
- Agent portal
- Customer portal

The goal is to introduce tenant isolation, reusable permissions, role-specific API responses, and portal-specific navigation without changing production behavior in the first architecture phase.

## Current-State Observations

### Application Shape

- The app is currently a single Node HTTP server in `server.js`, a persistence abstraction in `store.js`, and a single browser app in `public/app.js`.
- The frontend is role-aware but not portal-separated. It hides some staff-only UI with `isStaffUser()`, `.admin-only`, and customer checks.
- The backend is the real trust boundary. It currently mixes route handling, authorization, quote orchestration, carrier integration, response shaping, and static serving in one file.
- Persistence supports PostgreSQL when `DATABASE_URL` exists and a JSON fallback otherwise.

### Authentication And Sessions

- Users authenticate through `/api/login`.
- Sessions are stored server-side in the `sessions` table or JSON store and referenced by the `tms_session` cookie.
- Session lookup joins `sessions` to `users` and returns `user.id`, `email`, `role`, `customerId`, and `status`.
- There is no organization membership model yet.
- There is no current support for one user belonging to more than one organization.

### User Model

Current PostgreSQL `users` fields:

- `id`
- `email`
- `password_salt`
- `password_hash`
- `role`
- `customer_id`
- `status`
- `created_at`
- `last_login_at`

Current roles observed in code:

- `admin`
- `operations`
- `staff` in some newer frontend/backend checks
- `customer`

Risks:

- `role` is global and string-based.
- `customer_id` directly ties a user to one customer tenant.
- Agent users, internal departments, and customer sub-roles cannot be represented cleanly.
- Checks like `currentUser.role === "customer"` and `requireStaff(currentUser)` are scattered through `server.js`.

### Customer Model

Current PostgreSQL `customers` fields include:

- customer company identity and contact fields
- pickup defaults
- `allowed_carrier_modes`
- `allowed_booking`
- `allowed_booking_carrier_modes`
- `status`

Risks:

- `customers` is doing two jobs: tenant organization and customer account profile.
- There is no agent ownership or relationship field.
- There is no explicit organization boundary for internal, agent, or customer tenants.

### Quote Model

Current `quotes` fields include:

- `customer_id`
- `customer_name`
- carrier mode and carrier identifiers
- pickup/delivery/freight JSON
- `tariff_rule`
- `rates`
- `carrier_message`
- `carrier_audit`
- `raw_carrier_response`

Current behavior:

- Customer quote list responses are filtered by `quote.customerId`.
- A recent sanitizer removes carrier audit and cost fields from customer quote responses.

Risks:

- `customer_id` is the only authoritative tenant field.
- Internal carrier diagnostics live on the quote row.
- Agent access cannot be expressed.
- Stored rates contain operational fields that must be sanitized consistently for customers and agents.

### Shipment Model

Current `shipments` fields include:

- `customer_id`
- `quote_id`
- carrier identifiers
- pickup/delivery/freight JSON
- `carrier_cost`
- `sell_price`
- `margin`
- `provider`
- `carrier_shipment`

Risks:

- Customer list responses are filtered by `customerId`, but response sanitization is not as mature as quote sanitization.
- Agent scoping cannot be expressed.
- Carrier costs and margins are stored directly on shipment records and need role-specific serialization.

### Invoice Model

Current `invoices` fields include:

- `shipment_id`
- `customer_id`
- `amount`
- `source`
- external invoice identifiers
- carrier identifiers
- `raw_carrier_response`

Risks:

- Customer list responses are filtered by `customerId`, but imported invoice payloads may contain carrier raw data.
- Agent scoping cannot be expressed.
- Accounting roles need finer access than simple staff/customer.

### Current Authorization Pattern

Current patterns include:

- `requireCurrentUser(req, res, true)`
- `requireStaff(currentUser)`
- inline role checks such as `currentUser.role === "customer"`
- inline customer ownership checks such as `quote.customerId !== currentUser.customerId`

Risks:

- Authorization is spread across endpoints.
- There is no reusable permission vocabulary.
- API response shaping is not consistently tied to permissions.
- Frontend hiding is helpful for UX, but cannot be treated as a security control.

## Proposed Organization Model

### Recommended Tables

Use a normalized organization model:

```text
organizations
organization_users
agent_customer_relationships
```

Add supporting profile tables only when the organization-specific fields grow beyond what should live on `organizations`.

### organizations

Represents every tenant or tenant-like entity.

Recommended fields:

| Field | Purpose |
| --- | --- |
| `id` | Stable organization ID |
| `type` | `internal`, `agent`, or `customer` |
| `name` | Display name |
| `status` | `active`, `disabled`, `pending` |
| `billingEmail` | Billing/default contact |
| `phone` | Default contact phone |
| `address` or address columns | Default organization address |
| `createdAt` | Audit |
| `updatedAt` | Audit |

Notes:

- There should normally be exactly one `internal` organization.
- Existing `customers` should become customer organizations over time.
- The current `customers` table can be retained temporarily as `customer_profiles` in spirit, or migrated into `organizations` plus `customer_settings`.

### organization_users

Represents membership and role inside one organization.

Recommended fields:

| Field | Purpose |
| --- | --- |
| `id` | Membership ID |
| `organizationId` | Parent organization |
| `userId` | User |
| `role` | Scoped role such as `agent_manager` |
| `status` | `active`, `disabled`, `invited` |
| `createdAt` | Audit |
| `updatedAt` | Audit |

Notes:

- This allows future multi-membership without changing auth again.
- Initially, enforce one active membership per user if that is simpler.
- Session payload should include selected membership context.

### agent_customer_relationships

Represents agent management over customer organizations.

Recommended fields:

| Field | Purpose |
| --- | --- |
| `id` | Relationship ID |
| `agentOrganizationId` | Agent organization |
| `customerOrganizationId` | Customer organization |
| `status` | `active`, `ended`, `pending` |
| `createdAt` | Audit |
| `endedAt` | Optional |

Notes:

- A customer organization may optionally belong to one active agent organization.
- If multiple agents per customer ever becomes a requirement, this table already supports it with policy constraints.
- Add a unique partial index for one active agent per customer if exclusivity is desired:
  `unique(customerOrganizationId) where status = 'active'`.

### Why This Normalized Design

This design separates:

- identity: `users`
- tenant boundary: `organizations`
- membership and scoped role: `organization_users`
- agent/customer management assignment: `agent_customer_relationships`

That separation is important because a global `users.role` cannot safely model internal staff, agent team members, and customer users while preserving tenant isolation.

## Proposed Roles

### Internal Roles

| Role | Intent |
| --- | --- |
| `super_admin` | Full platform administration, internal users, settings, emergency overrides |
| `admin` | Broad platform management without destructive platform ownership |
| `operations` | Quotes, shipments, carrier operations, support workflows |
| `sales` | Customer/agent commercial management, pricing proposals, quote visibility |
| `accounting` | Invoices, payments, financial reporting |
| `customer_service` | Customer support, quote/shipment/invoice lookup with limited financial details |

### Agent Roles

| Role | Intent |
| --- | --- |
| `agent_owner` | Agent org owner, team management, customer management, commission visibility |
| `agent_manager` | Manage assigned customers and team operations |
| `agent_sales` | Create/manage customers and quotes within assigned scope |
| `agent_accounting` | View invoices and commissions for the agent scope |

### Customer Roles

| Role | Intent |
| --- | --- |
| `customer_admin` | Manage customer users and account defaults, create quotes/book shipments |
| `customer_user` | Create quotes, book shipments if enabled, view own org shipments |
| `customer_accounting` | View invoices and accounting documents for own org |

## Role Capability Matrix

This matrix describes default capabilities. Final implementation should use permissions, not hard-coded role names.

| Capability | super_admin | admin | operations | sales | accounting | customer_service | agent_owner | agent_manager | agent_sales | agent_accounting | customer_admin | customer_user | customer_accounting |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Create internal users | Yes | Limited | No | No | No | No | No | No | No | No | No | No | No |
| Create agent users | Yes | Yes | No | No | No | No | Own org | Own org | No | No | No | No | No |
| Create customer users | Yes | Yes | Support | No | No | Support | Assigned customers | Assigned customers | Assigned customers | No | Own org | No | No |
| Create customers | Yes | Yes | Yes | Yes | No | No | Yes, assigned to own agent | Yes, assigned to own agent | Yes, assigned to own agent | No | No | No | No |
| Create quotes | Yes | Yes | Yes | Yes | No | Support | Assigned customers | Assigned customers | Assigned customers | No | Own org | Own org | No |
| Book shipments | Yes | Yes | Yes | Support | No | Support | Assigned customers | Assigned customers | Assigned customers | No | Own org if enabled | Own org if enabled | No |
| View invoices | All | All | All | Limited | All | Limited | Assigned customers | Assigned customers | Limited | Assigned customers | Own org | Limited | Own org |
| View carrier costs | Yes | Yes | Yes | Optional | Yes | No | No by default | No by default | No | No | No | No | No |
| View margins | Yes | Yes | Yes | Optional | Yes | No | Agent margin only | Agent margin only | No | Agent margin only | No | No | No |
| View carrier audit | Yes | Yes | Yes | No | No | No | No | No | No | No | No | No | No |
| Manage commissions | Yes | Yes | No | Yes | Yes | No | View own only | View own only | No | View own only | No | No | No |
| Manage pricing rules | Yes | Yes | Yes | Yes | No | No | Agent/customer rules only | Agent/customer rules only | Limited | No | No | No | No |

## Permission Model

### Recommendation

Introduce centralized permission checks. Do not continue expanding checks like:

```js
if (user.role === "admin")
```

Use:

```js
requirePermission(context, "quotes.view_carrier_audit");
can(context, "quotes.view_agent_customers");
```

### Permission Vocabulary

Recommended permissions:

| Permission | Purpose |
| --- | --- |
| `quotes.create` | Create quotes in allowed scope |
| `quotes.view_own` | View own customer org quotes |
| `quotes.view_agent_customers` | View quotes for customers assigned to current agent |
| `quotes.view_all` | View all platform quotes |
| `quotes.view_cost` | See carrier/platform cost fields |
| `quotes.view_margin` | See platform or agent margins |
| `quotes.view_carrier_audit` | See carrier audit/raw operational status |
| `shipments.create` | Book/create shipments |
| `shipments.view_own` | View own customer org shipments |
| `shipments.view_agent_customers` | View shipments for assigned customers |
| `shipments.view_all` | View all shipments |
| `invoices.view_own` | View own customer org invoices |
| `invoices.view_agent_customers` | View invoices for assigned customers |
| `invoices.view_all` | View all invoices |
| `customers.create` | Create customer organizations |
| `customers.manage_own` | Manage own customer organization profile |
| `agent_customers.manage` | Assign/manage agent customer relationships |
| `users.manage_customer_users` | Manage customer organization users |
| `users.manage_agent_users` | Manage agent organization users |
| `users.manage_internal_users` | Manage internal platform users |
| `commissions.view_own` | View own agent commissions |
| `commissions.manage` | Manage commission rules and payouts |
| `pricing.manage_platform_rules` | Manage platform-level pricing |
| `pricing.manage_agent_rules` | Manage agent/customer pricing within scope |
| `settings.manage_platform` | Manage carrier config and platform settings |

### Centralized Permission Design

Add modules:

```text
server/auth/context.js
server/auth/permissions.js
server/auth/scope.js
server/serializers/*.js
```

Current codebase is not modular yet, so the first implementation may start with plain functions near auth in `server.js`, then move them out once tests are in place.

Recommended server context:

```js
{
  user: {
    id,
    email,
    status
  },
  membership: {
    organizationId,
    organizationType,
    role
  },
  permissions: Set<string>,
  scope: {
    internalOrganizationId,
    agentOrganizationId,
    customerOrganizationId,
    accessibleCustomerOrganizationIds
  }
}
```

Rules:

- Route handlers should require permissions before reading or mutating records.
- Store queries should accept a server-computed scope object.
- Serializers should require permissions before including sensitive fields.
- Frontend navigation should be derived from `/api/me` capabilities, but backend remains authoritative.

## Data Ownership And Tenant Isolation

### Authoritative Access Fields

Use organization ownership fields on every tenant-owned record.

| Entity | Required Fields | Authoritative Field |
| --- | --- | --- |
| Customer organization | `organizationId`, `agentOrganizationId` optional | `organizationId` |
| User membership | `userId`, `organizationId`, `role` | `organization_users.organizationId` |
| Quote | `customerOrganizationId`, `agentOrganizationId`, `createdByUserId`, `createdByOrganizationId` | `customerOrganizationId` |
| Shipment | `customerOrganizationId`, `agentOrganizationId`, `quoteId`, `createdByUserId`, `createdByOrganizationId` | `customerOrganizationId` |
| Invoice | `customerOrganizationId`, `agentOrganizationId`, `shipmentId` optional | `customerOrganizationId` |
| Documents | `customerOrganizationId`, `agentOrganizationId`, `shipmentId` or `invoiceId`, `source` | `customerOrganizationId` |
| Pricing rule | `ownerOrganizationId`, `customerOrganizationId` optional, `agentOrganizationId` optional | `ownerOrganizationId` plus target fields |
| Commission | `agentOrganizationId`, `customerOrganizationId` optional, `shipmentId` or `invoiceId` | `agentOrganizationId` |

### Field Guidance

- `customerOrganizationId` should be the primary access-control field for customer-facing operational records.
- `agentOrganizationId` should be denormalized onto quotes, shipments, invoices, and commissions at creation time for efficient agent scoping and historical accuracy.
- `createdByUserId` and `createdByOrganizationId` are audit fields, not primary access fields.
- `ownerOrganizationId` is useful for configurable objects such as pricing rules, templates, saved addresses, API credentials, and documents.

### Tenant Rules

Customer users must never access:

- another customer's records
- another agent's records
- `carrierAudit`
- raw carrier requests or responses
- carrier costs
- margins
- internal notes
- platform pricing rules
- agent commissions

Agent users must never access:

- another agent's organization
- another agent's customers
- platform-wide carrier configuration
- internal staff users
- other agents' commissions or pricing
- raw upstream carrier payloads unless explicitly approved later

Internal staff access should still be permission-gated. For example, `customer_service` may view a shipment but not carrier cost or margin.

## Portal Behavior

### Internal Staff Portal

Recommended navigation:

- Dashboard
- Customers
- Agents
- Quotes
- Shipments
- Invoices
- Carrier Operations
- Commissions
- Users
- Settings

Expected capabilities:

- Global search and filtering
- Customer/agent management
- Carrier troubleshooting
- Full quote/shipment/invoice operations based on role
- Pricing and commission management based on role

### Agent Portal

Recommended navigation:

- Dashboard
- My Customers
- Quotes
- Shipments
- Invoices
- Commissions
- Team

Expected capabilities:

- Create/manage assigned customer organizations
- Invite/manage agent team users
- Quote/book on behalf of assigned customers
- View assigned customer shipments/invoices
- View own commissions and agent margin where allowed
- No platform carrier settings or raw carrier audit

### Customer Portal

Recommended navigation:

- Dashboard
- New Quote
- Shipments
- Invoices
- Users

Expected capabilities:

- Create quotes for own organization
- Book shipments if enabled
- View own shipments and invoices
- Manage customer users if `customer_admin`
- No carrier audits, internal provider IDs, costs, margins, commissions, or upstream payloads

### Frontend Architecture Recommendation

Recommended incremental path:

1. Keep one application initially.
2. Introduce route/view definitions driven by server-provided portal context and permissions.
3. Split navigation by portal type inside the existing app.
4. Later introduce separate routes such as `/internal`, `/agent`, and `/portal`.
5. Later still, consider subdomains:
   - `staff.example.com`
   - `agents.example.com`
   - `app.example.com`

Avoid separate frontend bundles initially. The current app is compact enough that a permission-aware view registry is safer and faster than a bundle split. The critical security work belongs server-side.

## Pricing Architecture

### Required Pricing Fields

Rates and shipments should support:

- `carrierCost`
- `platformSellPrice`
- `agentBasePrice`
- `customerSellPrice`
- `platformMargin`
- `agentMargin`
- `commission`

### Pricing Layers

Recommended calculation flow:

```text
carrierCost
  -> platform pricing rule
  -> platformSellPrice / agentBasePrice
  -> agent pricing rule or commission rule
  -> customerSellPrice
  -> platformMargin + agentMargin + commission
```

### Business Models

Agent markup:

- Agent controls markup from `agentBasePrice` to `customerSellPrice`.
- Agent margin is customer sell price minus agent base price.
- Works well when agents own commercial relationships.

Fixed commission:

- Platform controls customer sell price.
- Agent receives fixed amount or percentage commission per shipment/invoice.
- Easier to enforce consistent customer pricing.

Hybrid:

- Platform sets minimums and base price.
- Agent can mark up within allowed guardrails.
- Commission may still apply for strategic accounts.

### Recommended First Model

Start with a hybrid model with platform guardrails:

- Platform computes `platformSellPrice` from `carrierCost`.
- Agent may apply an agent markup to produce `customerSellPrice`.
- Platform enforces minimum markup, minimum sell price, and optional maximum markup.
- Commission is derived after booking/invoice creation.

Why:

- It supports agent economics without giving agents unrestricted pricing power.
- It preserves current tariff-rule behavior as a stepping stone.
- It creates a clear audit trail for disputes.

### Pricing Controls

Recommended controls:

| Control | Purpose |
| --- | --- |
| `minimumMarkupAmount` | Protect absolute margin |
| `minimumMarkupPercent` | Protect margin ratio |
| `maximumMarkupAmount` | Prevent excessive pricing |
| `maximumMarkupPercent` | Prevent excessive pricing |
| `minimumSellPrice` | Protect small shipments |
| `lockedCustomerPricing` | Prevent agent override on selected customers |
| `platformOverride` | Internal staff override with audit reason |
| `agentSpecificPricingRules` | Allow agent-specific commercial terms |
| `customerSpecificPricingRules` | Preserve customer tariffs |

### Pricing Tables

Recommended tables:

```text
pricing_rules
quote_rate_pricing_snapshots
commission_rules
commission_entries
```

`quote_rate_pricing_snapshots` is important because quotes and shipments must remain explainable even after pricing rules change.

## API Response Sanitization

### Principle

Every API response should be serialized through a role/permission-aware serializer. Do not rely on CSS or frontend hiding.

Recommended shape:

```js
serializeQuote(quote, context)
serializeShipment(shipment, context)
serializeInvoice(invoice, context)
serializeCustomer(customer, context)
serializeUser(user, context)
```

### Customer Quote Response Must Exclude

- `carrierAudit`
- `rawCarrierResponse`
- raw provider names when internal-only
- carrier mode identifiers
- carrier quote IDs
- internal rate counts
- upstream API messages
- `carrierCost`
- `margin`
- `commission`
- debug metadata
- platform pricing rules
- agent pricing rules

### Agent Quote Response May Include

- assigned customer identity
- customer sell price
- agent margin if permission allows
- commission status if permission allows
- booking state

Agent response must exclude:

- raw upstream carrier payloads
- platform-wide cost configuration
- other agents' pricing or commissions
- internal notes unless explicitly shared

### Internal Staff Response

Internal responses should be permission-based:

- `quotes.view_cost` gates cost fields.
- `quotes.view_margin` gates margin fields.
- `quotes.view_carrier_audit` gates audit and raw payload fields.
- `settings.manage_platform` gates carrier credentials/configuration.

Internal does not mean every internal role sees every sensitive field.

## Migration Plan

The system already has users, customers, quotes, shipments, invoices, and production data. Migration must be additive and reversible.

### Step 1: Add New Tables Additively

Add:

- `organizations`
- `organization_users`
- `agent_customer_relationships`

Do not drop or rename existing columns in the first migration.

### Step 2: Create Internal Organization

Create one internal organization:

```text
type = internal
name = Platform
status = active
```

### Step 3: Convert Existing Users

For each existing user:

- If `role` is `admin`, `operations`, or `staff`, create an `organization_users` row under the internal organization.
- If `role` is `customer`, create an `organization_users` row under the customer organization mapped from `users.customer_id`.
- Preserve existing `users.role` and `users.customer_id` during a compatibility window.

Recommended role mapping:

| Existing Role | New Organization Type | New Role |
| --- | --- | --- |
| `admin` | internal | `admin` |
| `operations` | internal | `operations` |
| `staff` | internal | `operations` or `customer_service` after review |
| `customer` | customer | `customer_admin` for portal owner, otherwise `customer_user` |

### Step 4: Convert Customers

For each existing `customers` row:

- Create an organization with `type = customer`.
- Preserve the old customer ID in a migration mapping table or `legacyCustomerId`.
- Copy company/contact/default pickup fields into organization profile/customer settings.

### Step 5: Assign Records

Backfill:

- `quotes.customerOrganizationId`
- `shipments.customerOrganizationId`
- `invoices.customerOrganizationId`
- document ownership fields
- `createdByUserId` if inferable
- `createdByOrganizationId` if inferable

For current data, map from `customer_id` to the new customer organization.

### Step 6: Handle Missing Ownership

Records with missing or invalid `customer_id` should be:

- assigned to a quarantine/internal review organization, or
- left inaccessible to non-internal users until corrected.

Never guess customer ownership from company names alone in production.

### Step 7: Preserve Login Behavior

During migration:

- `/api/login` continues accepting the same credentials.
- `/api/me` returns legacy fields plus new `organizationContext`.
- Route handlers support both old and new fields for one release.
- Add logging for requests resolved through legacy fallback.

### Step 8: Rollback Strategy

Rollback should be possible because changes are additive:

- Keep legacy `customer_id` and `role` fields until the new model is stable.
- Feature-flag tenant-context enforcement.
- Store migration mapping tables.
- Do not delete legacy customer/user data in Phase 1.
- If rollback is needed, disable new tenant-context code and continue using old fields.

## Implementation Phases

### Phase 1: Organization Model And Tenant Context

Files likely to change:

- `store.js`
- `server.js`
- `docs/postgres-local-setup.md`
- possibly new `server/auth/context.js` if modularization starts

Database/store changes:

- Add `organizations`.
- Add `organization_users`.
- Add `agent_customer_relationships`.
- Add nullable org ownership fields to quotes, shipments, invoices.
- Add indexes for organization fields.
- Add migration helpers and backfill functions.
- Update JSON fallback schema with equivalent arrays/fields.

API changes:

- `/api/me` returns `organizationContext`.
- Existing endpoints continue working.
- No portal behavior changes yet.

Risks:

- Incorrect user/customer mapping.
- Legacy JSON fallback divergence.
- Session payload ambiguity if a user has multiple memberships.

Tests:

- Existing users can log in.
- Existing customer user resolves to the correct customer organization.
- Existing staff user resolves to internal organization.
- Existing quotes/shipments/invoices map to customer organizations.

Rollback:

- Disable tenant context feature flag.
- Keep old `users.role`, `users.customer_id`, and record `customer_id`.
- Leave new tables unused.

### Phase 2: Centralized Roles And Permissions

Files likely to change:

- `server.js`
- new `server/auth/permissions.js`
- new `server/auth/scope.js`
- tests under `tests/`

Database/store changes:

- Possibly add `role_overrides` or keep permissions static in code initially.

API changes:

- Route handlers call `requirePermission`.
- Store list/get methods accept tenant scope.
- `/api/me` returns effective permissions.

Risks:

- Missing permission on a route.
- Over-granting internal roles.
- Frontend relying on old role names.

Tests:

- Permission matrix unit tests.
- Direct API access tests for forbidden routes.
- Customer/agent/internal scope tests.

Rollback:

- Keep old role checks available behind a compatibility helper.
- Feature-flag permission enforcement route by route.

### Phase 3: Customer Portal Restrictions And Sanitization

Files likely to change:

- `server.js`
- serializers for quotes, shipments, invoices, customers
- `public/app.js`
- `public/index.html`
- tests

Database/store changes:

- None required if Phase 1 ownership fields exist.

API changes:

- All customer-visible responses use serializers.
- Customer users endpoint for customer admins.
- Customer-scoped query endpoints.

Risks:

- Accidentally removing fields needed by customer UI.
- Booking flow depending on internal carrier identifiers.
- Imported invoices exposing raw payloads.

Tests:

- Customer cannot see `carrierAudit`.
- Customer cannot see carrier cost or margin.
- Customer cannot access another customer by direct API call.
- Customer rate cards and booking still work.

Rollback:

- Keep old response shape under internal-only or feature flag.
- Revert serializer use endpoint by endpoint if needed.

### Phase 4: Agent Organizations And Agent Customer Management

Files likely to change:

- `store.js`
- `server.js`
- `public/app.js`
- `public/index.html`
- customer management UI
- tests

Database/store changes:

- Agent organization CRUD.
- Agent/customer relationship management.
- Agent user invitations.
- Backfill `agentOrganizationId` on assigned customer records.

API changes:

- `/api/agents`
- `/api/agent-customers`
- agent-scoped customer create/update/list
- agent team user endpoints

Risks:

- Agent accidentally viewing unassigned customers.
- Customer reassignment breaking historical commission rules.
- Agent-created customer onboarding conflicting with internal workflows.

Tests:

- Agent A can access Agent A customers.
- Agent A cannot access Agent B customers.
- Internal can access all.
- Customer assignment changes update future records without corrupting history.

Rollback:

- Disable agent portal routes.
- Preserve agent relationship records but stop using them for scope.

### Phase 5: Pricing And Commissions

Files likely to change:

- `store.js`
- `server.js`
- quote pricing functions
- shipment creation
- invoice sync logic
- new pricing/commission UI in `public/app.js`
- tests

Database/store changes:

- `pricing_rules`
- `quote_rate_pricing_snapshots`
- `commission_rules`
- `commission_entries`
- additional pricing fields on quotes/shipments/invoices if needed

API changes:

- Pricing rule management endpoints.
- Commission endpoints.
- Role-specific pricing serializers.

Risks:

- Margin leakage.
- Historical quote repricing.
- Commission disputes if snapshots are incomplete.

Tests:

- Pricing snapshot is stable after rule changes.
- Customer sees only customer sell price.
- Agent sees only allowed agent margin/commission.
- Internal accounting sees full financial breakdown.

Rollback:

- Keep current tariff calculation as fallback.
- Do not overwrite existing shipment prices.
- Mark commission entries as recalculatable until finalized.

### Phase 6: Portal-Specific Navigation And Dashboards

Files likely to change:

- `public/app.js`
- `public/index.html`
- `public/styles.css`
- possible new frontend view modules
- tests/manual QA docs

Database/store changes:

- None expected.

API changes:

- `/api/me` capabilities drive navigation.
- Dashboard summary endpoints may become portal-specific.

Risks:

- One app becoming too complex.
- Hidden views still reachable by direct frontend state changes if backend endpoints are not protected.
- Inconsistent terminology between portals.

Tests:

- Internal navigation shows internal sections.
- Agent navigation shows only agent sections.
- Customer navigation shows only customer sections.
- Direct API bypass attempts are rejected.

Rollback:

- Keep existing nav as fallback.
- Gate new portal nav by feature flag.

## Testing Strategy

### Unit Tests

Add tests for:

- role-to-permission mapping
- `can(context, permission)`
- tenant scope resolution
- customer/agent/internal serializers
- pricing calculation snapshots
- commission calculations

### Integration Tests

Add endpoint-level tests for:

- Customer A cannot access Customer B.
- Agent A cannot access Agent B.
- Agent A can access its assigned customers.
- Customer cannot view `carrierAudit`.
- Customer cannot view carrier cost or margin.
- Agent cannot access platform settings.
- Agent cannot access another agent's commissions.
- Internal staff can access allowed global data.
- Permission changes take effect after session refresh or immediately if permissions are loaded per request.
- Legacy users still work after migration.
- Unauthorized direct API requests are rejected even if frontend controls are bypassed.

### Migration Tests

Add tests for:

- existing admin converted to internal membership
- existing customer user converted to customer membership
- existing customer row converted to customer organization
- quote/shipment/invoice ownership backfill
- records with missing customer ownership become internal-review only
- rollback path leaves legacy login intact

### Manual QA

Manual checks should include:

- Internal user can see global quote audit when permission allows.
- Customer user sees no carrier audit, cost, margin, raw payload, or internal carrier identifiers.
- Agent user sees assigned customers only.
- Agent-created customer records are not visible to other agents.
- Customer portal still supports quote creation, booking, shipments, and invoices.

## Risks

### Biggest Current Architecture Risks

- Tenant boundary is currently `customer_id`, which cannot represent agent organizations or internal/agent/customer scoped users.
- Authorization is scattered through route handlers and depends on string-role checks.
- Store methods generally return broad record sets and rely on route handlers to filter.
- Sensitive operational fields are stored with quote/shipment/invoice records and require consistent serializers.
- Frontend role-aware hiding exists, but server-side enforcement must be the source of truth.
- The JSON fallback store can drift from PostgreSQL behavior if migrations only update SQL schema.
- Current user model cannot represent multiple memberships or agent team users.

### Migration Risks

- Misassigning legacy records to organizations.
- Breaking current customer logins.
- Accidentally exposing raw carrier payloads while adding agent views.
- Introducing pricing changes before snapshots are reliable.
- Overloading a single frontend file further without modularizing view and permission logic.

## Recommended First Implementation Milestone

The first implementation milestone should be Phase 1 only:

- Add organizations and organization memberships.
- Create internal organization.
- Convert existing customers into customer organizations.
- Backfill organization ownership fields.
- Add server-side tenant context resolution.
- Return organization context from `/api/me`.
- Keep current UI and behavior unchanged.

This milestone creates the foundation for permissions and portals without changing product behavior.

## Exact Files Likely To Change In Phase 1

Likely required:

- `store.js`
- `server.js`
- `docs/postgres-local-setup.md`
- `docs/local-development.md`
- `tests/organization-migration.test.js` or equivalent new test file

Likely optional if modularization starts immediately:

- `server/auth/context.js`
- `server/auth/tenant-scope.js`
- `server/migrations/organizations.js`
- `server/serializers/user.js`

Frontend should ideally not change in Phase 1 except for reading and ignoring new `/api/me.organizationContext` fields if needed.

