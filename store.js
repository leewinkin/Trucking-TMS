import { existsSync } from "node:fs";
import crypto from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveOrganizationContextForUser } from "./server/auth/context.js";
import {
  createOrganizationMigrationSummary,
  customerOrganizationIdByLegacyCustomerId,
  internalLegacyRoles,
  internalOrganizationName,
  migrateJsonOrganizations
} from "./server/migrations/organizations.js";
import {
  carrierShipmentBookingChannels,
  carrierShipmentImportSources,
  carrierShipmentMatchingStatuses,
  carrierShipmentProviders,
  mergeCarrierShipmentForProviderSync,
  normalizeCarrierShipmentIdentifier,
  normalizeCarrierShipmentValue,
  sanitizeCarrierShipmentPayload
} from "./server/carriers/carrier-shipment-normalizer.js";

const __dirname = process.cwd();

export async function createAppStore({ dbUrl, dataFile, runOrganizationMigrationOnStartup = process.env.RUN_ORGANIZATION_MIGRATION_ON_STARTUP === "1" }) {
  if (dbUrl) {
    return await createPostgresStore(dbUrl, { runOrganizationMigrationOnStartup });
  }

  return await createJsonStore(resolveDataFilePath(dataFile), { runOrganizationMigrationOnStartup });
}

export async function runOrganizationMigration({ dbUrl, dataFile }) {
  if (dbUrl) {
    return await runPostgresOrganizationMigration(dbUrl);
  }

  return await runJsonOrganizationMigration(resolveDataFilePath(dataFile));
}

function resolveDataFilePath(value) {
  const filePath = String(value || ".local-db.json").trim();
  return path.isAbsolute(filePath) ? filePath : path.join(__dirname, filePath);
}

async function createPostgresStore(dbUrl, { runOrganizationMigrationOnStartup = false } = {}) {
  const pg = await import("pg");
  const { Pool, types } = pg;

  types.setTypeParser(1700, (value) => (value === null ? null : Number(value)));

  const pool = new Pool({
    connectionString: dbUrl,
    max: 10
  });

  await pool.query("SELECT 1");
  await ensureSchema(pool);
  await seedPostgres(pool);
  const organizationMigrationSummary = runOrganizationMigrationOnStartup
    ? await migratePostgresOrganizations(pool)
    : createOrganizationMigrationSummary();
  if (runOrganizationMigrationOnStartup) {
    console.log("Organization migration summary", organizationMigrationSummary);
  }

  return {
    kind: "postgres",
    async getOrganizationMigrationSummary() {
      return organizationMigrationSummary;
    },
    async getOrganizationContextForUser(user) {
      return getPostgresOrganizationContextForUser(pool, user);
    },
    async getCustomerOrganizationId(customerId) {
      return getPostgresCustomerOrganizationId(pool, customerId);
    },
    async listCustomers() {
      const { rows } = await pool.query(
        `SELECT c.*, u.email AS portal_email
         FROM customers c
         LEFT JOIN LATERAL (
           SELECT email
           FROM users
           WHERE customer_id = c.id AND role = 'customer'
           ORDER BY created_at ASC
           LIMIT 1
         ) u ON TRUE
         ORDER BY c.created_at ASC`
      );
      return rows.map(mapCustomerRow);
    },
    async getCustomer(id) {
      const { rows } = await pool.query(
        `SELECT c.*, u.email AS portal_email
         FROM customers c
         LEFT JOIN LATERAL (
           SELECT email
           FROM users
           WHERE customer_id = c.id AND role = 'customer'
           ORDER BY created_at ASC
           LIMIT 1
         ) u ON TRUE
         WHERE c.id = $1`,
        [id]
      );
      return rows[0] ? mapCustomerRow(rows[0]) : null;
    },
    async createCustomer(input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const allowedCarrierModes = normalizeAllowedCarrierModes(input.allowedCarrierModes);
        const allowedBookingCarrierModes = normalizeAllowedBookingCarrierModes(
          input.allowedBookingCarrierModes,
          allowedCarrierModes,
          normalizeAllowedBooking(input.allowedBooking, true)
        );
        const customerResult = await client.query(
          `INSERT INTO customers (id, company_name, billing_email, payment_terms, company_phone, company_open_time, company_close_time, company_street, company_city, company_state, company_zip, allowed_carrier_modes, allowed_booking, allowed_booking_carrier_modes, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14::jsonb, $15, $16)
           RETURNING *`,
          [
            createId("cust"),
            String(input.companyName || "").trim(),
            String(input.billingEmail || "").trim(),
            String(input.paymentTerms || "Net 15").trim(),
            String(input.companyPhone || "").trim(),
            String(input.companyOpenTime || "").trim(),
            String(input.companyCloseTime || "").trim(),
            String(input.companyStreet || "").trim(),
            String(input.companyCity || "").trim(),
            String(input.companyState || "").trim().toUpperCase(),
            String(input.companyZip || "").trim(),
            JSON.stringify(allowedCarrierModes),
            normalizeAllowedBooking(input.allowedBooking, true),
            JSON.stringify(allowedBookingCarrierModes),
            "active",
            nowIso()
          ]
        );

        const customer = customerResult.rows[0];
        const customerOrganizationId = createId("org");
        await client.query(
          `INSERT INTO organizations (id, type, name, status, legacy_customer_id, billing_email, phone, created_at, updated_at)
           VALUES ($1, 'customer', $2, $3, $4, $5, $6, $7, $7)
           ON CONFLICT DO NOTHING`,
          [
            customerOrganizationId,
            customer.company_name || customer.id,
            customer.status,
            customer.id,
            customer.billing_email || null,
            customer.company_phone || null,
            nowIso()
          ]
        );
        await client.query(
          `INSERT INTO tariff_rules
           (id, customer_id, rule_type, fixed_amount, markup_percentage, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            createId("tariff"),
            customer.id,
            "percentage",
            50,
            15,
            "active",
            nowIso()
          ]
        );

        if (String(input.portalEmail || "").trim()) {
          const password = String(input.portalPassword || "").trim();
          if (!password) {
            throw new Error("PORTAL_PASSWORD_REQUIRED");
          }
          const portalUser = await insertUser(client, {
            email: input.portalEmail,
            password,
            role: "customer",
            customerId: customer.id
          });
          await client.query(
            `INSERT INTO organization_users (id, organization_id, user_id, role, status, created_at, updated_at)
             VALUES ($1, $2, $3, 'customer_admin', $4, $5, $5)
             ON CONFLICT DO NOTHING`,
            [
              createId("orguser"),
              customerOrganizationId,
              portalUser.id,
              portalUser.status === "disabled" ? "disabled" : "active",
              nowIso()
            ]
          );
        }

        await client.query("COMMIT");
        return {
          ...(await mapCustomerRowWithClient(client, customer)),
          portalEmail: String(input.portalEmail || "").trim() || null
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async updateCustomer(id, input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const allowedCarrierModes = Object.prototype.hasOwnProperty.call(input, "allowedCarrierModes")
          ? normalizeAllowedCarrierModes(input.allowedCarrierModes)
          : null;
        const allowedBooking = Object.prototype.hasOwnProperty.call(input, "allowedBooking")
          ? normalizeAllowedBooking(input.allowedBooking)
          : null;
        const allowedBookingCarrierModes = Object.prototype.hasOwnProperty.call(input, "allowedBookingCarrierModes")
          ? normalizeAllowedBookingCarrierModes(input.allowedBookingCarrierModes, allowedCarrierModes, allowedBooking !== false)
          : null;
        const customerResult = await client.query(
          `UPDATE customers
           SET company_name = COALESCE($2, company_name),
               billing_email = COALESCE($3, billing_email),
               payment_terms = COALESCE($4, payment_terms),
               company_phone = COALESCE($5, company_phone),
               company_open_time = COALESCE($6, company_open_time),
               company_close_time = COALESCE($7, company_close_time),
               company_street = COALESCE($8, company_street),
               company_city = COALESCE($9, company_city),
               company_state = COALESCE($10, company_state),
               company_zip = COALESCE($11, company_zip),
               allowed_carrier_modes = COALESCE($12::jsonb, allowed_carrier_modes),
               allowed_booking = COALESCE($13::boolean, allowed_booking),
               allowed_booking_carrier_modes = COALESCE($14::jsonb, allowed_booking_carrier_modes),
               status = COALESCE($15, status)
           WHERE id = $1
           RETURNING *`,
          [
            id,
            normalizeNullableString(input.companyName),
            normalizeNullableString(input.billingEmail),
            normalizeNullableString(input.paymentTerms),
            normalizeNullableString(input.companyPhone),
            normalizeNullableString(input.companyOpenTime),
            normalizeNullableString(input.companyCloseTime),
            normalizeNullableString(input.companyStreet),
            normalizeNullableString(input.companyCity),
            normalizeNullableString(input.companyState),
            normalizeNullableString(input.companyZip),
            allowedCarrierModes ? JSON.stringify(allowedCarrierModes) : null,
            allowedBooking,
            allowedBookingCarrierModes ? JSON.stringify(allowedBookingCarrierModes) : null,
            normalizeNullableString(input.status)
          ]
        );

        if (customerResult.rowCount === 0) {
          throw new Error("CUSTOMER_NOT_FOUND");
        }

        if (Object.prototype.hasOwnProperty.call(input, "portalEmail") || Object.prototype.hasOwnProperty.call(input, "portalPassword") || Object.prototype.hasOwnProperty.call(input, "portalStatus")) {
          await upsertCustomerPortalUser(client, {
            customerId: id,
            email: normalizeNullableString(input.portalEmail),
            password: normalizeNullableString(input.portalPassword),
            status: normalizeNullableString(input.portalStatus)
          });
        }

        if (Object.prototype.hasOwnProperty.call(input, "status")) {
          await client.query("UPDATE users SET status = $2 WHERE customer_id = $1", [
            id,
            normalizeNullableString(input.status) || "active"
          ]);
        }

        if (Object.prototype.hasOwnProperty.call(input, "ruleType") || Object.prototype.hasOwnProperty.call(input, "fixedAmount") || Object.prototype.hasOwnProperty.call(input, "markupPercentage")) {
          await client.query("DELETE FROM tariff_rules WHERE customer_id = $1", [id]);
          await client.query(
            `INSERT INTO tariff_rules
             (id, customer_id, rule_type, fixed_amount, markup_percentage, status, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              createId("tariff"),
              id,
              normalizeRuleType(input.ruleType || "percentage"),
              toMoney(input.fixedAmount),
              toNumber(input.markupPercentage),
              "active",
              nowIso()
            ]
          );
        }

        if (Object.prototype.hasOwnProperty.call(input, "allowedCarrierModes")) {
          await client.query("UPDATE customers SET allowed_carrier_modes = $2 WHERE id = $1", [
            id,
            JSON.stringify(normalizeAllowedCarrierModes(input.allowedCarrierModes))
          ]);
        }

        if (Object.prototype.hasOwnProperty.call(input, "allowedBooking")) {
          await client.query("UPDATE customers SET allowed_booking = $2 WHERE id = $1", [
            id,
            normalizeAllowedBooking(input.allowedBooking)
          ]);
        }

        if (Object.prototype.hasOwnProperty.call(input, "allowedBookingCarrierModes")) {
          await client.query("UPDATE customers SET allowed_booking_carrier_modes = $2::jsonb WHERE id = $1", [
            id,
            JSON.stringify(normalizeAllowedBookingCarrierModes(input.allowedBookingCarrierModes, input.allowedCarrierModes, normalizeAllowedBooking(input.allowedBooking, true)))
          ]);
        }

        await client.query("COMMIT");
        return mapCustomerRow(customerResult.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async setCustomerStatus(id, status) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const normalizedStatus = status === "disabled" ? "disabled" : "active";
        const customerResult = await client.query(
          "UPDATE customers SET status = $2 WHERE id = $1 RETURNING *",
          [id, normalizedStatus]
        );
        if (customerResult.rowCount === 0) {
          throw new Error("CUSTOMER_NOT_FOUND");
        }

        await client.query("UPDATE users SET status = $2 WHERE customer_id = $1", [id, normalizedStatus]);
        await client.query("COMMIT");
        return mapCustomerRow(customerResult.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async deleteCustomer(id) {
      const result = await pool.query("DELETE FROM customers WHERE id = $1", [id]);
      if (result.rowCount === 0) {
        throw new Error("CUSTOMER_NOT_FOUND");
      }
      return true;
    },
    async listTariffs(customerId) {
      const query = customerId
        ? "SELECT * FROM tariff_rules WHERE customer_id = $1 ORDER BY created_at ASC"
        : "SELECT * FROM tariff_rules ORDER BY created_at ASC";
      const params = customerId ? [customerId] : [];
      const { rows } = await pool.query(query, params);
      return rows.map(mapTariffRuleRow);
    },
    async upsertTariff(input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const customerCheck = await client.query("SELECT id FROM customers WHERE id = $1", [
          input.customerId
        ]);
        if (customerCheck.rowCount === 0) {
          throw new Error("CUSTOMER_NOT_FOUND");
        }

        await client.query("DELETE FROM tariff_rules WHERE customer_id = $1", [input.customerId]);
        const result = await client.query(
          `INSERT INTO tariff_rules
           (id, customer_id, rule_type, fixed_amount, markup_percentage, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            createId("tariff"),
            input.customerId,
            normalizeRuleType(input.ruleType),
            toMoney(input.fixedAmount),
            toNumber(input.markupPercentage),
            "active",
            nowIso()
          ]
        );
        if (Object.prototype.hasOwnProperty.call(input, "allowedCarrierModes")) {
          await client.query("UPDATE customers SET allowed_carrier_modes = $2 WHERE id = $1", [
            input.customerId,
            JSON.stringify(normalizeAllowedCarrierModes(input.allowedCarrierModes))
          ]);
        }
        if (Object.prototype.hasOwnProperty.call(input, "allowedBooking")) {
          await client.query("UPDATE customers SET allowed_booking = $2 WHERE id = $1", [
            input.customerId,
            normalizeAllowedBooking(input.allowedBooking)
          ]);
        }
        if (Object.prototype.hasOwnProperty.call(input, "allowedBookingCarrierModes")) {
          await client.query("UPDATE customers SET allowed_booking_carrier_modes = $2::jsonb WHERE id = $1", [
            input.customerId,
            JSON.stringify(normalizeAllowedBookingCarrierModes(input.allowedBookingCarrierModes, input.allowedCarrierModes, normalizeAllowedBooking(input.allowedBooking, true)))
          ]);
        }
        await client.query("COMMIT");
        return mapTariffRuleRow(result.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async listAddressBookEntries({ customerId }) {
      const { rows } = await pool.query(
        "SELECT * FROM address_book_entries WHERE customer_id = $1 AND status = 'active' ORDER BY is_default_pickup DESC, is_default_delivery DESC, label ASC, created_at ASC",
        [customerId]
      );
      return rows.map(mapAddressBookEntryRow);
    },
    async getAddressBookEntry(id) {
      const { rows } = await pool.query("SELECT * FROM address_book_entries WHERE id = $1", [id]);
      return rows[0] ? mapAddressBookEntryRow(rows[0]) : null;
    },
    async createAddressBookEntry(input) {
      const client = await pool.connect();
      const now = nowIso();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`address_book:${input.customerId}`]);
        const customerOrganizationId = await getPostgresCustomerOrganizationId(client, input.customerId);
        const usageType = normalizeAddressUsageType(input.usageType);
        const { isDefaultPickup, isDefaultDelivery } = normalizeAddressDefaultFlags(usageType, input);
        if (isDefaultPickup) {
          await client.query(
            "UPDATE address_book_entries SET is_default_pickup = false, updated_at = $2 WHERE customer_id = $1 AND status = 'active'",
            [input.customerId, now]
          );
        }
        if (isDefaultDelivery) {
          await client.query(
            "UPDATE address_book_entries SET is_default_delivery = false, updated_at = $2 WHERE customer_id = $1 AND status = 'active'",
            [input.customerId, now]
          );
        }
        const { rows } = await client.query(
          `INSERT INTO address_book_entries
           (id, customer_organization_id, customer_id, label, usage_type, company_name, contact_name, street, city, state, zip, country, phone, email, open_time, close_time, default_accessorials, is_default_pickup, is_default_delivery, status, created_by_user_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, $18, $19, 'active', $20, $21, $21)
           RETURNING *`,
          [
            createId("addr"),
            customerOrganizationId || null,
            input.customerId,
            normalizeAddressLabel(input.label, input.companyName),
            usageType,
            String(input.companyName || "").trim(),
            normalizeNullableString(input.contactName),
            String(input.street || "").trim(),
            String(input.city || "").trim(),
            String(input.state || "").trim().toUpperCase(),
            String(input.zip || "").trim(),
            String(input.country || "US").trim() || "US",
            String(input.phone || "").trim(),
            normalizeNullableString(input.email),
            String(input.openTime || "").trim(),
            String(input.closeTime || "").trim(),
            JSON.stringify(Array.isArray(input.defaultAccessorials) ? input.defaultAccessorials : []),
            isDefaultPickup,
            isDefaultDelivery,
            input.createdByUserId || null,
            now
          ]
        );
        await client.query("COMMIT");
        return mapAddressBookEntryRow(rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async updateAddressBookEntry(id, input) {
      const client = await pool.connect();
      const now = nowIso();
      try {
        await client.query("BEGIN");
        const existing = await client.query("SELECT * FROM address_book_entries WHERE id = $1 FOR UPDATE", [id]);
        if (!existing.rows[0]) {
          await client.query("COMMIT");
          return null;
        }
        const usageType = normalizeAddressUsageType(input.usageType);
        const { isDefaultPickup, isDefaultDelivery } = normalizeAddressDefaultFlags(usageType, input);
        const customerId = existing.rows[0].customer_id;
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`address_book:${customerId}`]);
        if (isDefaultPickup) {
          await client.query(
            "UPDATE address_book_entries SET is_default_pickup = false, updated_at = $3 WHERE customer_id = $1 AND id <> $2 AND status = 'active'",
            [customerId, id, now]
          );
        }
        if (isDefaultDelivery) {
          await client.query(
            "UPDATE address_book_entries SET is_default_delivery = false, updated_at = $3 WHERE customer_id = $1 AND id <> $2 AND status = 'active'",
            [customerId, id, now]
          );
        }
        const { rows } = await client.query(
          `UPDATE address_book_entries
           SET label = $2,
               usage_type = $3,
               company_name = $4,
               contact_name = $5,
               street = $6,
               city = $7,
               state = $8,
               zip = $9,
               country = $10,
               phone = $11,
               email = $12,
               open_time = $13,
               close_time = $14,
               default_accessorials = $15::jsonb,
               is_default_pickup = $16,
               is_default_delivery = $17,
               updated_at = $18
           WHERE id = $1
           RETURNING *`,
          [
            id,
            normalizeAddressLabel(input.label, input.companyName),
            usageType,
            String(input.companyName || "").trim(),
            normalizeNullableString(input.contactName),
            String(input.street || "").trim(),
            String(input.city || "").trim(),
            String(input.state || "").trim().toUpperCase(),
            String(input.zip || "").trim(),
            String(input.country || "US").trim() || "US",
            String(input.phone || "").trim(),
            normalizeNullableString(input.email),
            String(input.openTime || "").trim(),
            String(input.closeTime || "").trim(),
            JSON.stringify(Array.isArray(input.defaultAccessorials) ? input.defaultAccessorials : []),
            isDefaultPickup,
            isDefaultDelivery,
            now
          ]
        );
        await client.query("COMMIT");
        return rows[0] ? mapAddressBookEntryRow(rows[0]) : null;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async deleteAddressBookEntry(id) {
      const result = await pool.query(
        "UPDATE address_book_entries SET status = 'deleted', updated_at = $2 WHERE id = $1",
        [id, nowIso()]
      );
      return result.rowCount > 0;
    },
    async listCarrierPreferences({ customerId }) {
      const { rows } = await pool.query(
        "SELECT * FROM customer_carrier_preferences WHERE customer_id = $1 AND status = 'active' ORDER BY carrier_name ASC, created_at ASC",
        [customerId]
      );
      return rows.map(mapCarrierPreferenceRow);
    },
    async getCarrierPreference(id) {
      const { rows } = await pool.query("SELECT * FROM customer_carrier_preferences WHERE id = $1", [id]);
      return rows[0] ? mapCarrierPreferenceRow(rows[0]) : null;
    },
    async createCarrierPreference(input) {
      const customerOrganizationId = await getPostgresCustomerOrganizationId(pool, input.customerId);
      const now = nowIso();
      const { rows } = await pool.query(
        `INSERT INTO customer_carrier_preferences
         (id, customer_organization_id, customer_id, carrier_key, carrier_name, preference, reason, status, created_by_user_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, $9, $9)
         RETURNING *`,
        [
          createId("cpref"),
          customerOrganizationId || null,
          input.customerId,
          String(input.carrierKey || "").trim(),
          String(input.carrierName || "").trim(),
          input.preference === "preferred" ? "preferred" : "blocked",
          normalizeNullableString(input.reason),
          input.createdByUserId || null,
          now
        ]
      );
      return mapCarrierPreferenceRow(rows[0]);
    },
    async deleteCarrierPreference(id) {
      const result = await pool.query(
        "UPDATE customer_carrier_preferences SET status = 'deleted', updated_at = $2 WHERE id = $1",
        [id, nowIso()]
      );
      return result.rowCount > 0;
    },
    async listCarrierDocuments(filters = {}) {
      const { rows } = await pool.query("SELECT * FROM carrier_documents ORDER BY updated_at DESC, created_at DESC");
      return rows.map(mapCarrierDocumentRow).filter((document) => carrierDocumentMatchesFilters(document, filters));
    },
    async getCarrierDocument(id) {
      const { rows } = await pool.query("SELECT * FROM carrier_documents WHERE id = $1", [id]);
      return rows[0] ? mapCarrierDocumentRow(rows[0]) : null;
    },
    async listDocumentsForShipment(shipmentId, options = {}) {
      const { rows } = await pool.query(
        "SELECT * FROM carrier_documents WHERE shipment_id = $1 ORDER BY document_type ASC, created_at ASC",
        [shipmentId]
      );
      return rows.map(mapCarrierDocumentRow).filter((document) => carrierDocumentMatchesFilters(document, options));
    },
    async upsertCarrierDocuments(documents) {
      const summary = { created: 0, updated: 0, skipped: 0 };
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const document of documents) {
          if (!document?.provider || !document?.externalDocumentKey) {
            summary.skipped += 1;
            continue;
          }
          const values = [
            document.id || createId("cdoc"),
            document.shipmentId || null,
            document.customerId || null,
            document.provider,
            document.externalDocumentKey,
            normalizeCarrierDocumentType(document.documentType),
            String(document.label || "").trim(),
            document.filename || null,
            document.contentType || null,
            Boolean(document.customerVisible) && ["bol", "pod"].includes(normalizeCarrierDocumentType(document.documentType)),
            document.status || "available",
            JSON.stringify(document.providerReference || {}),
            JSON.stringify(redactCarrierDocumentMetadata(document.rawMetadata || {})),
            document.fetchedAt || null,
            nowIso()
          ];
          const result = await client.query(
            `INSERT INTO carrier_documents
             (id, shipment_id, customer_id, provider, external_document_key, document_type, label, filename, content_type, customer_visible, status, provider_reference, raw_metadata, fetched_at, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14, $15, $15)
             ON CONFLICT (provider, external_document_key)
             DO UPDATE SET
               shipment_id = COALESCE(EXCLUDED.shipment_id, carrier_documents.shipment_id),
               customer_id = COALESCE(EXCLUDED.customer_id, carrier_documents.customer_id),
               document_type = EXCLUDED.document_type,
               label = EXCLUDED.label,
               filename = EXCLUDED.filename,
               content_type = EXCLUDED.content_type,
               customer_visible = EXCLUDED.customer_visible,
               status = EXCLUDED.status,
               provider_reference = EXCLUDED.provider_reference,
               raw_metadata = EXCLUDED.raw_metadata,
               fetched_at = EXCLUDED.fetched_at,
               updated_at = EXCLUDED.updated_at
             RETURNING (xmax = 0) AS inserted`,
            values
          );
          if (result.rows[0]?.inserted) {
            summary.created += 1;
          } else {
            summary.updated += 1;
          }
        }
        await client.query("COMMIT");
        return summary;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async markCarrierDocumentSyncError(input) {
      const document = {
        provider: input.provider,
        externalDocumentKey: input.externalDocumentKey || `${input.provider}:${input.shipmentId || "unmatched"}:${input.documentType || "sync-error"}`,
        shipmentId: input.shipmentId || null,
        customerId: input.customerId || null,
        documentType: input.documentType || "other",
        label: input.label || "Document sync error",
        status: "error",
        customerVisible: false,
        providerReference: input.providerReference || {},
        rawMetadata: { message: input.message || "Document sync failed." },
        fetchedAt: nowIso()
      };
      return this.upsertCarrierDocuments([document]);
    },
    async listQuotes() {
      const { rows } = await pool.query("SELECT * FROM quotes ORDER BY created_at DESC");
      return rows.map(mapQuoteRow);
    },
    async getQuote(id) {
      const { rows } = await pool.query("SELECT * FROM quotes WHERE id = $1", [id]);
      return rows[0] ? mapQuoteRow(rows[0]) : null;
    },
    async createQuote(quote) {
      const customerOrganizationId = quote.customerOrganizationId || await getPostgresCustomerOrganizationId(pool, quote.customerId);
      const result = await pool.query(
        `INSERT INTO quotes
         (id, customer_id, customer_name, carrier_mode, carrier_modes, carrier, carrier_quote_id, reference_number, pickup, delivery, freight, pickup_ready_date, tariff_rule, rates, status, carrier_message, carrier_audit, raw_carrier_response, created_at, customer_organization_id, agent_organization_id, created_by_user_id, created_by_organization_id, rate_availability, carrier_exclusion_audit)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, $15, $16, $17::jsonb, $18::jsonb, $19, $20, $21, $22, $23, $24::jsonb, $25::jsonb)
         RETURNING *`,
        [
          quote.id,
          quote.customerId,
          quote.customerName,
          quote.carrierMode,
          JSON.stringify(quote.carrierModes || []),
          quote.carrier,
          quote.carrierQuoteId,
          quote.referenceNumber || "",
          JSON.stringify(quote.pickup),
          JSON.stringify(quote.delivery),
          JSON.stringify(quote.freight),
          JSON.stringify(quote.pickupReadyDate),
          JSON.stringify(quote.tariffRule),
          JSON.stringify(quote.rates),
          quote.status,
          quote.carrierMessage || "",
          JSON.stringify(quote.carrierAudit || []),
          JSON.stringify(quote.rawCarrierResponse),
          quote.createdAt,
          customerOrganizationId || null,
          quote.agentOrganizationId || null,
          quote.createdByUserId || null,
          quote.createdByOrganizationId || null,
          JSON.stringify(quote.rateAvailability || null),
          JSON.stringify(Array.isArray(quote.carrierExclusionAudit) ? quote.carrierExclusionAudit : [])
        ]
      );
      return mapQuoteRow(result.rows[0]);
    },
    async listShipments() {
      const { rows } = await pool.query("SELECT * FROM shipments ORDER BY created_at DESC");
      return rows.map(mapShipmentRow);
    },
    async getShipment(id) {
      const { rows } = await pool.query("SELECT * FROM shipments WHERE id = $1", [id]);
      return rows[0] ? mapShipmentRow(rows[0]) : null;
    },
    async listCarrierShipments(filters = {}) {
      const { rows } = await pool.query("SELECT * FROM carrier_shipments ORDER BY imported_at DESC, last_provider_update DESC NULLS LAST");
      return rows.map(mapCarrierShipmentRow).filter((shipment) => carrierShipmentMatchesFilters(shipment, filters));
    },
    async getCarrierShipment(id) {
      const { rows } = await pool.query("SELECT * FROM carrier_shipments WHERE id = $1", [id]);
      return rows[0] ? mapCarrierShipmentRow(rows[0]) : null;
    },
    async getCarrierShipmentByProviderExternal(provider, externalShipmentId) {
      const { rows } = await pool.query(
        "SELECT * FROM carrier_shipments WHERE provider = $1 AND external_shipment_id = $2",
        [provider, externalShipmentId]
      );
      return rows[0] ? mapCarrierShipmentRow(rows[0]) : null;
    },
    async upsertCarrierShipments(shipments) {
      const summary = { created: 0, updated: 0, skipped: 0 };
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const input of shipments) {
          const record = normalizeCarrierShipmentRecord(input);
          if (!record.provider || !record.externalShipmentId) {
            summary.skipped += 1;
            continue;
          }
          const existingResult = await client.query(
            "SELECT * FROM carrier_shipments WHERE provider = $1 AND external_shipment_id = $2 FOR UPDATE",
            [record.provider, record.externalShipmentId]
          );
          const existing = existingResult.rows[0] ? mapCarrierShipmentRow(existingResult.rows[0]) : null;
          const merged = mergeCarrierShipmentForProviderSync(existing, record);
          const result = await client.query(
            `INSERT INTO carrier_shipments
             (id, provider, import_source, booking_channel, booking_channel_evidence, linked_shipment_id, customer_id, matching_status, external_shipment_id, entity_id, transaction_id, confirmation_number, reference_number, pro_number, bol_number, origin, destination, carrier_name, service, status, carrier_cost, raw_provider_record, imported_at, last_provider_update, updated_at)
             VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17::jsonb, $18, $19, $20, $21, $22::jsonb, $23, $24, $25)
             ON CONFLICT (provider, external_shipment_id)
             DO UPDATE SET
               import_source = EXCLUDED.import_source,
               booking_channel = EXCLUDED.booking_channel,
               booking_channel_evidence = EXCLUDED.booking_channel_evidence,
               linked_shipment_id = EXCLUDED.linked_shipment_id,
               customer_id = EXCLUDED.customer_id,
               matching_status = EXCLUDED.matching_status,
               entity_id = EXCLUDED.entity_id,
               transaction_id = EXCLUDED.transaction_id,
               confirmation_number = EXCLUDED.confirmation_number,
               reference_number = EXCLUDED.reference_number,
               pro_number = EXCLUDED.pro_number,
               bol_number = EXCLUDED.bol_number,
               origin = EXCLUDED.origin,
               destination = EXCLUDED.destination,
               carrier_name = EXCLUDED.carrier_name,
               service = EXCLUDED.service,
               status = EXCLUDED.status,
               carrier_cost = EXCLUDED.carrier_cost,
               raw_provider_record = EXCLUDED.raw_provider_record,
               last_provider_update = EXCLUDED.last_provider_update,
               updated_at = EXCLUDED.updated_at
             RETURNING (xmax = 0) AS inserted`,
            [
              merged.id || createId("cship"),
              merged.provider,
              merged.importSource,
              merged.bookingChannel,
              JSON.stringify(merged.bookingChannelEvidence || {}),
              merged.linkedShipmentId || null,
              merged.customerId || null,
              merged.matchingStatus,
              merged.externalShipmentId,
              merged.entityId || null,
              merged.transactionId || null,
              merged.confirmationNumber || "",
              merged.referenceNumber || "",
              merged.proNumber || "",
              merged.bolNumber || "",
              JSON.stringify(merged.origin || {}),
              JSON.stringify(merged.destination || {}),
              merged.carrierName || "",
              merged.service || "",
              merged.status || "",
              merged.carrierCost || 0,
              JSON.stringify(merged.rawProviderRecord || {}),
              merged.importedAt || nowIso(),
              merged.lastProviderUpdate || null,
              nowIso()
            ]
          );
          if (result.rows[0]?.inserted) summary.created += 1;
          else summary.updated += 1;
        }
        await client.query("COMMIT");
        return summary;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async updateCarrierShipment(id, patch) {
      const existing = await this.getCarrierShipment(id);
      if (!existing) {
        return null;
      }
      const record = normalizeCarrierShipmentRecord({ ...existing, ...patch, id: existing.id });
      const result = await pool.query(
        `UPDATE carrier_shipments
         SET import_source = $2,
             booking_channel = $3,
             booking_channel_evidence = $4::jsonb,
             linked_shipment_id = $5,
             customer_id = $6,
             matching_status = $7,
             entity_id = $8,
             transaction_id = $9,
             confirmation_number = $10,
             reference_number = $11,
             pro_number = $12,
             bol_number = $13,
             origin = $14::jsonb,
             destination = $15::jsonb,
             carrier_name = $16,
             service = $17,
             status = $18,
             carrier_cost = $19,
             raw_provider_record = $20::jsonb,
             last_provider_update = $21,
             updated_at = $22
         WHERE id = $1
         RETURNING *`,
        [
          id,
          record.importSource,
          record.bookingChannel,
          JSON.stringify(record.bookingChannelEvidence || {}),
          record.linkedShipmentId || null,
          record.customerId || null,
          record.matchingStatus,
          record.entityId || null,
          record.transactionId || null,
          record.confirmationNumber || "",
          record.referenceNumber || "",
          record.proNumber || "",
          record.bolNumber || "",
          JSON.stringify(record.origin || {}),
          JSON.stringify(record.destination || {}),
          record.carrierName || "",
          record.service || "",
          record.status || "",
          record.carrierCost || 0,
          JSON.stringify(record.rawProviderRecord || {}),
          record.lastProviderUpdate || null,
          nowIso()
        ]
      );
      return result.rows[0] ? mapCarrierShipmentRow(result.rows[0]) : null;
    },
    async createShipment(payload) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const quoteUpdate = await client.query("UPDATE quotes SET status = 'booked' WHERE id = $1", [
          payload.quoteId
        ]);
        if (quoteUpdate.rowCount === 0) {
          throw new Error("QUOTE_NOT_FOUND");
        }
        const ownershipResult = await client.query(
          `SELECT q.customer_organization_id,
                  q.agent_organization_id,
                  q.created_by_user_id,
                  q.created_by_organization_id,
                  o.id AS mapped_customer_organization_id
           FROM quotes q
           LEFT JOIN organizations o
             ON o.type = 'customer' AND o.legacy_customer_id = q.customer_id
           WHERE q.id = $1`,
          [payload.quoteId]
        );
        const ownership = ownershipResult.rows[0] || {};
        const customerOrganizationId =
          payload.shipment.customerOrganizationId ||
          ownership.customer_organization_id ||
          ownership.mapped_customer_organization_id ||
          null;
        const agentOrganizationId = payload.shipment.agentOrganizationId || ownership.agent_organization_id || null;
        const createdByUserId = payload.shipment.createdByUserId || ownership.created_by_user_id || null;
        const createdByOrganizationId =
          payload.shipment.createdByOrganizationId || ownership.created_by_organization_id || null;

        const shipmentResult = await client.query(
          `INSERT INTO shipments
           (id, customer_id, customer_name, quote_id, carrier, carrier_name, carrier_shipment_id, carrier_entity_id, confirmation_number, reference_number, pickup, delivery, freight, carrier_cost, sell_price, margin, provider, service, status, pickup_date, carrier_shipment, created_at, customer_organization_id, agent_organization_id, created_by_user_id, created_by_organization_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb, $14, $15, $16, $17, $18, $19, $20::jsonb, $21::jsonb, $22, $23, $24, $25, $26)
           RETURNING *`,
          [
            payload.shipment.id,
            payload.shipment.customerId,
            payload.shipment.customerName,
            payload.quoteId,
            payload.shipment.carrier,
            payload.shipment.carrierName || "",
            payload.shipment.carrierShipmentId,
            payload.shipment.carrierEntityId || null,
            payload.shipment.confirmationNumber,
            payload.shipment.referenceNumber || "",
            JSON.stringify(payload.shipment.pickup),
            JSON.stringify(payload.shipment.delivery),
            JSON.stringify(payload.shipment.freight),
            payload.shipment.carrierCost,
            payload.shipment.sellPrice,
            payload.shipment.margin,
            payload.shipment.provider,
            payload.shipment.service,
            payload.shipment.status,
            JSON.stringify(payload.shipment.pickupDate),
            JSON.stringify(payload.shipment.carrierShipment),
            payload.shipment.createdAt,
            customerOrganizationId,
            agentOrganizationId,
            createdByUserId,
            createdByOrganizationId
          ]
        );

        const invoiceResult = await client.query(
          `INSERT INTO invoices
           (shipment_id, customer_id, customer_name, reference_number, amount, status, issued_at, due_at, created_at, carrier_entity_id, customer_organization_id, agent_organization_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           RETURNING *`,
          [
            shipmentResult.rows[0].id,
            payload.shipment.customerId,
            payload.shipment.customerName,
            payload.invoice.referenceNumber || "",
            payload.invoice.amount,
            payload.invoice.status,
            payload.invoice.issuedAt,
            payload.invoice.dueAt,
            payload.invoice.createdAt,
            payload.shipment.carrierEntityId || null,
            payload.invoice.customerOrganizationId || customerOrganizationId,
            payload.invoice.agentOrganizationId || agentOrganizationId
          ]
        );

        await client.query("COMMIT");
        return {
          shipment: mapShipmentRow(shipmentResult.rows[0]),
          invoice: mapInvoiceRow(invoiceResult.rows[0])
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async listInvoices() {
      const { rows } = await pool.query("SELECT * FROM invoices ORDER BY created_at DESC");
      return rows.map(mapInvoiceRow);
    },
    async upsertExternalInvoices(invoices) {
      const client = await pool.connect();
      const summary = {
        created: 0,
        updated: 0,
        skipped: 0
      };

      try {
        await client.query("BEGIN");

        for (const invoice of invoices) {
          if (!String(invoice.externalInvoiceId || "").trim()) {
            summary.skipped += 1;
            continue;
          }

          const existing = await client.query(
            "SELECT id FROM invoices WHERE external_invoice_id = $1 LIMIT 1",
            [invoice.externalInvoiceId]
          );

          if (existing.rowCount > 0) {
            const customerOrganizationId = invoice.customerOrganizationId || await getPostgresCustomerOrganizationId(client, invoice.customerId);
            await client.query(
              `UPDATE invoices
               SET shipment_id = $2,
                   customer_id = $3,
                   customer_name = $4,
                   invoice_number = $5,
                   reference_number = $6,
                   amount = $7,
                   status = $8,
                   issued_at = $9,
                   due_at = $10,
                   created_at = $11,
                   source = $12,
                   carrier_name = $13,
                   carrier_shipment_id = $14,
                   carrier_entity_id = $15,
                   raw_carrier_response = $16::jsonb,
                   synced_at = $17,
                   customer_organization_id = COALESCE($18, customer_organization_id),
                   agent_organization_id = COALESCE($19, agent_organization_id)
               WHERE external_invoice_id = $1`,
              [
                invoice.externalInvoiceId,
                invoice.shipmentId || null,
                invoice.customerId || null,
                invoice.customerName || "Imported from Mothership",
                invoice.invoiceNumber,
                invoice.referenceNumber || "",
                invoice.amount,
                invoice.status,
                invoice.issuedAt,
                invoice.dueAt,
                invoice.createdAt,
                invoice.source || "mothership",
                invoice.carrierName || "Mothership",
                invoice.carrierShipmentId || null,
                invoice.carrierEntityId || null,
                JSON.stringify(invoice.rawCarrierResponse || {}),
                invoice.syncedAt || nowIso(),
                customerOrganizationId || null,
                invoice.agentOrganizationId || null
              ]
            );
            summary.updated += 1;
            continue;
          }

          const customerOrganizationId = invoice.customerOrganizationId || await getPostgresCustomerOrganizationId(client, invoice.customerId);
          await client.query(
            `INSERT INTO invoices
             (shipment_id, customer_id, customer_name, invoice_number, reference_number, amount, status, issued_at, due_at, created_at, source, external_invoice_id, carrier_name, carrier_shipment_id, carrier_entity_id, raw_carrier_response, synced_at, customer_organization_id, agent_organization_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17, $18, $19)`,
            [
              invoice.shipmentId || null,
              invoice.customerId || null,
              invoice.customerName || "Imported from Mothership",
              invoice.invoiceNumber,
              invoice.referenceNumber || "",
              invoice.amount,
              invoice.status,
              invoice.issuedAt,
              invoice.dueAt,
              invoice.createdAt,
              invoice.source || "mothership",
              invoice.externalInvoiceId,
              invoice.carrierName || "Mothership",
              invoice.carrierShipmentId || null,
              invoice.carrierEntityId || null,
              JSON.stringify(invoice.rawCarrierResponse || {}),
              invoice.syncedAt || nowIso(),
              customerOrganizationId || null,
              invoice.agentOrganizationId || null
            ]
          );
          summary.created += 1;
        }

        await client.query("COMMIT");
        return summary;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async replaceTrackingEvents(shipmentId, events, rawCarrierResponse) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM tracking_events WHERE shipment_id = $1", [shipmentId]);
        for (const event of events) {
          await client.query(
            `INSERT INTO tracking_events
             (id, shipment_id, status, event_time, location, description, raw_carrier_response, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
            [
              createId("track"),
              shipmentId,
              event.status,
              event.eventTime,
              event.location || null,
              event.description || null,
              JSON.stringify(rawCarrierResponse || event.rawCarrierResponse || {}),
              nowIso()
            ]
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async getTrackingEvents(shipmentId) {
      const { rows } = await pool.query(
        "SELECT * FROM tracking_events WHERE shipment_id = $1 ORDER BY event_time ASC",
        [shipmentId]
      );
      return rows.map(mapTrackingEventRow);
    },
    async getUserByEmail(email) {
      const { rows } = await pool.query("SELECT * FROM users WHERE lower(email) = lower($1)", [
        String(email || "").trim()
      ]);
      return rows[0] ? mapUserRow(rows[0]) : null;
    },
    async getUserById(id) {
      const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
      return rows[0] ? mapUserRow(rows[0]) : null;
    },
    async createUser(input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const user = await insertUser(client, input);
        await client.query("COMMIT");
        return user;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async listInternalUsers({ requesterRole } = {}) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const internalOrganization = await ensurePostgresInternalOrganization(client);
        await syncPostgresInternalMemberships(client, internalOrganization.id);
        const roles = requesterRole === "operations" ? ["staff"] : ["admin", "operations", "staff"];
        const { rows } = await client.query(
          `SELECT DISTINCT ON (u.id) u.id, u.email, u.role, u.customer_id, u.status, u.created_at
           FROM users u
           JOIN organization_users ou ON ou.user_id = u.id
           WHERE ou.organization_id = $1
             AND u.role = ANY($2::text[])
             AND u.customer_id IS NULL
           ORDER BY u.id, u.created_at ASC, u.email ASC`,
          [internalOrganization.id, roles]
        );
        await client.query("COMMIT");
        return rows.map(mapSafeInternalUserRow);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async createInternalUser(input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const existing = await client.query("SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1", [
          String(input.email || "").trim()
        ]);
        if (existing.rowCount > 0) {
          throw new StoreValidationError("EMAIL_ALREADY_EXISTS", "Email is already in use.");
        }
        const internalOrganization = await ensurePostgresInternalOrganization(client);
        const user = await insertUser(client, {
          email: input.email,
          password: input.password,
          role: input.role,
          customerId: null,
          status: "active"
        });
        await client.query(
          `INSERT INTO organization_users (id, organization_id, user_id, role, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $6)`,
          [createId("orguser"), internalOrganization.id, user.id, user.role, user.status, nowIso()]
        );
        await client.query("COMMIT");
        return safeInternalUser(user);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async updateInternalUser(id, input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const internalOrganization = await ensurePostgresInternalOrganization(client);
        await syncPostgresInternalMemberships(client, internalOrganization.id);
        const target = await getPostgresInternalUserForUpdate(client, internalOrganization.id, id);
        if (!target) {
          await client.query("ROLLBACK");
          return null;
        }
        if (target.role === "customer" || target.customer_id) {
          throw new StoreValidationError("NOT_INTERNAL_USER", "Customer portal accounts cannot be managed here.");
        }
        const nextRole = Object.prototype.hasOwnProperty.call(input, "role") ? input.role : target.role;
        const nextStatus = Object.prototype.hasOwnProperty.call(input, "status") ? input.status : target.status;
        if (removesActiveAdmin(target, nextRole, nextStatus)) {
          const activeAdmins = await lockPostgresActiveInternalAdmins(client, internalOrganization.id);
          if (activeAdmins <= 1) {
            throw new StoreValidationError("FINAL_ACTIVE_ADMIN", "The final active Admin cannot be demoted or disabled.");
          }
        }
        const { rows } = await client.query(
          `UPDATE users
           SET role = $2,
               status = $3
           WHERE id = $1
           RETURNING id, email, role, customer_id, status, created_at`,
          [target.id, nextRole, nextStatus]
        );
        await client.query(
          `UPDATE organization_users
           SET role = $2,
               status = $3,
               updated_at = $4
           WHERE organization_id = $1 AND user_id = $5`,
          [internalOrganization.id, nextRole, nextStatus, nowIso(), target.id]
        );
        if (nextRole !== target.role || nextStatus !== target.status) {
          await client.query("DELETE FROM sessions WHERE user_id = $1", [target.id]);
        }
        await client.query("COMMIT");
        return mapSafeInternalUserRow(rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async resetInternalUserPassword(id, password) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const internalOrganization = await ensurePostgresInternalOrganization(client);
        await syncPostgresInternalMemberships(client, internalOrganization.id);
        const target = await getPostgresInternalUserForUpdate(client, internalOrganization.id, id);
        if (!target || target.role === "customer" || target.customer_id) {
          await client.query("ROLLBACK");
          return null;
        }
        const record = createPasswordRecord(password);
        const { rows } = await client.query(
          `UPDATE users
           SET password_salt = $2,
               password_hash = $3
           WHERE id = $1
           RETURNING id, email, role, customer_id, status, created_at`,
          [target.id, record.salt, record.hash]
        );
        await client.query("DELETE FROM sessions WHERE user_id = $1", [target.id]);
        await client.query("COMMIT");
        return mapSafeInternalUserRow(rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async createSession({ userId, tokenHash, expiresAt }) {
      await pool.query(
        `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [createId("sess"), userId, tokenHash, expiresAt, nowIso()]
      );
    },
    async getSessionByTokenHash(tokenHash) {
      const { rows } = await pool.query(
        `SELECT s.*, u.email, u.role, u.customer_id, u.status AS user_status
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = $1 AND s.expires_at > now() AND u.status = 'active'
         LIMIT 1`,
        [tokenHash]
      );
      return rows[0] ? mapSessionRow(rows[0]) : null;
    },
    async deleteSessionByTokenHash(tokenHash) {
      await pool.query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash]);
    }
  };
}

async function ensureSchema(pool) {
  const statements = [
    "CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START WITH 1 INCREMENT BY 1",
    `CREATE TABLE IF NOT EXISTS customers (
      id text PRIMARY KEY,
      company_name text NOT NULL,
      billing_email text NOT NULL DEFAULT '',
      payment_terms text NOT NULL DEFAULT 'Net 15',
      company_phone text NOT NULL DEFAULT '',
      company_open_time text NOT NULL DEFAULT '',
      company_close_time text NOT NULL DEFAULT '',
      company_street text NOT NULL DEFAULT '',
      company_city text NOT NULL DEFAULT '',
      company_state text NOT NULL DEFAULT '',
      company_zip text NOT NULL DEFAULT '',
      allowed_carrier_modes jsonb NOT NULL DEFAULT '["mothershipSandbox"]'::jsonb,
      allowed_booking boolean NOT NULL DEFAULT true,
      allowed_booking_carrier_modes jsonb NOT NULL DEFAULT '[]'::jsonb,
      status text NOT NULL DEFAULT 'active',
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    "ALTER TABLE customers ADD COLUMN IF NOT EXISTS company_phone text NOT NULL DEFAULT ''",
    "ALTER TABLE customers ADD COLUMN IF NOT EXISTS company_open_time text NOT NULL DEFAULT ''",
    "ALTER TABLE customers ADD COLUMN IF NOT EXISTS company_close_time text NOT NULL DEFAULT ''",
    "ALTER TABLE customers ADD COLUMN IF NOT EXISTS company_street text NOT NULL DEFAULT ''",
    "ALTER TABLE customers ADD COLUMN IF NOT EXISTS company_city text NOT NULL DEFAULT ''",
    "ALTER TABLE customers ADD COLUMN IF NOT EXISTS company_state text NOT NULL DEFAULT ''",
    "ALTER TABLE customers ADD COLUMN IF NOT EXISTS company_zip text NOT NULL DEFAULT ''",
    "ALTER TABLE customers ADD COLUMN IF NOT EXISTS allowed_carrier_modes jsonb NOT NULL DEFAULT '[\"mothershipSandbox\"]'::jsonb",
    "ALTER TABLE customers ADD COLUMN IF NOT EXISTS allowed_booking boolean NOT NULL DEFAULT true",
    "ALTER TABLE customers ADD COLUMN IF NOT EXISTS allowed_booking_carrier_modes jsonb NOT NULL DEFAULT '[]'::jsonb",
    `CREATE TABLE IF NOT EXISTS tariff_rules (
      id text PRIMARY KEY,
      customer_id text NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      rule_type text NOT NULL,
      fixed_amount numeric NOT NULL DEFAULT 0,
      markup_percentage numeric NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'active',
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS users (
      id text PRIMARY KEY,
      email text NOT NULL UNIQUE,
      password_salt text NOT NULL,
      password_hash text NOT NULL,
      role text NOT NULL,
      customer_id text REFERENCES customers(id) ON DELETE CASCADE,
      status text NOT NULL DEFAULT 'active',
      created_at timestamptz NOT NULL DEFAULT now(),
      last_login_at timestamptz
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      id text PRIMARY KEY,
      user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash text NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS organizations (
      id text PRIMARY KEY,
      type text NOT NULL,
      name text NOT NULL,
      status text NOT NULL DEFAULT 'active',
      legacy_customer_id text,
      billing_email text,
      phone text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS organization_users (
      id text PRIMARY KEY,
      organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role text NOT NULL,
      status text NOT NULL DEFAULT 'active',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS agent_customer_relationships (
      id text PRIMARY KEY,
      agent_organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      customer_organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      status text NOT NULL DEFAULT 'active',
      created_at timestamptz NOT NULL DEFAULT now(),
      ended_at timestamptz
    )`,
    `CREATE TABLE IF NOT EXISTS address_book_entries (
      id text PRIMARY KEY,
      customer_organization_id text REFERENCES organizations(id),
      customer_id text NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      label text NOT NULL,
      usage_type text NOT NULL DEFAULT 'both',
      company_name text NOT NULL,
      contact_name text,
      street text NOT NULL,
      city text NOT NULL,
      state text NOT NULL,
      zip text NOT NULL,
      country text NOT NULL DEFAULT 'US',
      phone text NOT NULL DEFAULT '',
      email text,
      open_time text NOT NULL DEFAULT '',
      close_time text NOT NULL DEFAULT '',
      default_accessorials jsonb NOT NULL DEFAULT '[]'::jsonb,
      is_default_pickup boolean NOT NULL DEFAULT false,
      is_default_delivery boolean NOT NULL DEFAULT false,
      status text NOT NULL DEFAULT 'active',
      created_by_user_id text REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS customer_carrier_preferences (
      id text PRIMARY KEY,
      customer_organization_id text REFERENCES organizations(id),
      customer_id text NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      carrier_key text NOT NULL,
      carrier_name text NOT NULL,
      preference text NOT NULL DEFAULT 'blocked',
      reason text,
      status text NOT NULL DEFAULT 'active',
      created_by_user_id text REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
      `CREATE TABLE IF NOT EXISTS quotes (
      id text PRIMARY KEY,
      customer_id text NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      customer_name text NOT NULL,
      carrier_mode text NOT NULL,
      carrier_modes jsonb NOT NULL DEFAULT '[]'::jsonb,
      carrier text NOT NULL,
      carrier_quote_id text NOT NULL,
      reference_number text NOT NULL DEFAULT '',
      pickup jsonb NOT NULL,
      delivery jsonb NOT NULL,
      freight jsonb NOT NULL,
      pickup_ready_date jsonb NOT NULL,
      tariff_rule jsonb NOT NULL,
      rates jsonb NOT NULL,
      status text NOT NULL DEFAULT 'quoted',
      carrier_message text NOT NULL DEFAULT '',
      carrier_audit jsonb NOT NULL DEFAULT '[]'::jsonb,
      raw_carrier_response jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS shipments (
      id text PRIMARY KEY,
      customer_id text NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      customer_name text NOT NULL,
      quote_id text NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      carrier text NOT NULL,
      carrier_name text NOT NULL DEFAULT '',
      carrier_shipment_id text NOT NULL,
      carrier_entity_id text,
      confirmation_number text NOT NULL,
      reference_number text NOT NULL DEFAULT '',
      pickup jsonb NOT NULL,
      delivery jsonb NOT NULL,
      freight jsonb NOT NULL,
      carrier_cost numeric NOT NULL DEFAULT 0,
      sell_price numeric NOT NULL DEFAULT 0,
      margin numeric NOT NULL DEFAULT 0,
      provider text NOT NULL,
      service text NOT NULL,
      status text NOT NULL,
      pickup_date jsonb NOT NULL,
      carrier_shipment jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS carrier_shipments (
      id text PRIMARY KEY,
      provider text NOT NULL CHECK (provider IN ('mothership', 'priority1', 'speedship')),
      import_source text NOT NULL DEFAULT 'provider_import' CHECK (import_source IN ('tms_created', 'provider_import', 'manual_import')),
      booking_channel text NOT NULL DEFAULT 'unknown' CHECK (booking_channel IN ('tms_api', 'provider_portal', 'external_api', 'unknown')),
      booking_channel_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
      linked_shipment_id text REFERENCES shipments(id),
      customer_id text REFERENCES customers(id),
      matching_status text NOT NULL DEFAULT 'unmatched' CHECK (matching_status IN ('matched', 'manual', 'unmatched', 'conflict')),
      external_shipment_id text NOT NULL,
      entity_id text,
      transaction_id text,
      confirmation_number text NOT NULL DEFAULT '',
      reference_number text NOT NULL DEFAULT '',
      pro_number text NOT NULL DEFAULT '',
      bol_number text NOT NULL DEFAULT '',
      origin jsonb NOT NULL DEFAULT '{}'::jsonb,
      destination jsonb NOT NULL DEFAULT '{}'::jsonb,
      carrier_name text NOT NULL DEFAULT '',
      service text NOT NULL DEFAULT '',
      status text NOT NULL DEFAULT '',
      carrier_cost numeric NOT NULL DEFAULT 0,
      raw_provider_record jsonb NOT NULL DEFAULT '{}'::jsonb,
      imported_at timestamptz NOT NULL DEFAULT now(),
      last_provider_update timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS tracking_events (
      id text PRIMARY KEY,
      shipment_id text NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
      status text NOT NULL,
      event_time timestamptz NOT NULL,
      location text,
      description text,
      raw_carrier_response jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS carrier_documents (
      id text PRIMARY KEY,
      shipment_id text REFERENCES shipments(id) ON DELETE CASCADE,
      customer_id text REFERENCES customers(id) ON DELETE CASCADE,
      provider text NOT NULL,
      external_document_key text NOT NULL,
      document_type text NOT NULL,
      label text NOT NULL DEFAULT '',
      filename text,
      content_type text,
      customer_visible boolean NOT NULL DEFAULT false,
      status text NOT NULL DEFAULT 'available',
      provider_reference jsonb NOT NULL DEFAULT '{}'::jsonb,
      raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      fetched_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS invoices (
      id bigserial PRIMARY KEY,
      shipment_id text REFERENCES shipments(id) ON DELETE CASCADE,
      customer_id text REFERENCES customers(id) ON DELETE CASCADE,
      customer_name text NOT NULL DEFAULT '',
      invoice_number text NOT NULL UNIQUE DEFAULT ('INV-' || lpad(nextval('invoice_number_seq')::text, 5, '0')),
      reference_number text NOT NULL DEFAULT '',
      amount numeric NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'draft',
      issued_at timestamptz,
      due_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      source text NOT NULL DEFAULT 'local',
      external_invoice_id text,
      carrier_name text NOT NULL DEFAULT '',
      carrier_shipment_id text,
      carrier_entity_id text,
      raw_carrier_response jsonb NOT NULL DEFAULT '{}'::jsonb,
      synced_at timestamptz
    )`,
    "ALTER TABLE quotes ADD COLUMN IF NOT EXISTS reference_number text NOT NULL DEFAULT ''",
    "ALTER TABLE quotes ADD COLUMN IF NOT EXISTS carrier_modes jsonb NOT NULL DEFAULT '[]'::jsonb",
    "ALTER TABLE quotes ADD COLUMN IF NOT EXISTS carrier_message text NOT NULL DEFAULT ''",
    "ALTER TABLE quotes ADD COLUMN IF NOT EXISTS carrier_audit jsonb NOT NULL DEFAULT '[]'::jsonb",
    "ALTER TABLE quotes ADD COLUMN IF NOT EXISTS rate_availability jsonb",
    "ALTER TABLE quotes ADD COLUMN IF NOT EXISTS carrier_exclusion_audit jsonb",
    "ALTER TABLE quotes ADD COLUMN IF NOT EXISTS customer_organization_id text REFERENCES organizations(id)",
    "ALTER TABLE quotes ADD COLUMN IF NOT EXISTS agent_organization_id text REFERENCES organizations(id)",
    "ALTER TABLE quotes ADD COLUMN IF NOT EXISTS created_by_user_id text REFERENCES users(id)",
    "ALTER TABLE quotes ADD COLUMN IF NOT EXISTS created_by_organization_id text REFERENCES organizations(id)",
    "ALTER TABLE shipments ADD COLUMN IF NOT EXISTS reference_number text NOT NULL DEFAULT ''",
    "ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier_name text NOT NULL DEFAULT ''",
    "ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier_entity_id text",
    "ALTER TABLE shipments ADD COLUMN IF NOT EXISTS customer_organization_id text REFERENCES organizations(id)",
    "ALTER TABLE shipments ADD COLUMN IF NOT EXISTS agent_organization_id text REFERENCES organizations(id)",
    "ALTER TABLE shipments ADD COLUMN IF NOT EXISTS created_by_user_id text REFERENCES users(id)",
    "ALTER TABLE shipments ADD COLUMN IF NOT EXISTS created_by_organization_id text REFERENCES organizations(id)",
    "ALTER TABLE invoices ALTER COLUMN shipment_id DROP NOT NULL",
    "ALTER TABLE invoices ALTER COLUMN customer_id DROP NOT NULL",
    "ALTER TABLE invoices ALTER COLUMN customer_name SET DEFAULT ''",
    "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS reference_number text NOT NULL DEFAULT ''",
    "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'local'",
    "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS external_invoice_id text",
    "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS carrier_name text NOT NULL DEFAULT ''",
    "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS carrier_shipment_id text",
    "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS carrier_entity_id text",
    "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS raw_carrier_response jsonb NOT NULL DEFAULT '{}'::jsonb",
    "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS synced_at timestamptz",
    "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_organization_id text REFERENCES organizations(id)",
    "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS agent_organization_id text REFERENCES organizations(id)",
    "CREATE INDEX IF NOT EXISTS idx_tariff_rules_customer_id ON tariff_rules(customer_id)",
    "CREATE INDEX IF NOT EXISTS idx_quotes_customer_id ON quotes(customer_id)",
    "CREATE INDEX IF NOT EXISTS idx_quotes_customer_organization_id ON quotes(customer_organization_id)",
    "CREATE INDEX IF NOT EXISTS idx_shipments_customer_id ON shipments(customer_id)",
    "CREATE INDEX IF NOT EXISTS idx_shipments_customer_organization_id ON shipments(customer_organization_id)",
    "CREATE INDEX IF NOT EXISTS idx_shipments_quote_id ON shipments(quote_id)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_carrier_shipments_provider_external ON carrier_shipments(provider, external_shipment_id)",
    "CREATE INDEX IF NOT EXISTS idx_carrier_shipments_provider ON carrier_shipments(provider)",
    "CREATE INDEX IF NOT EXISTS idx_carrier_shipments_linked_shipment_id ON carrier_shipments(linked_shipment_id)",
    "CREATE INDEX IF NOT EXISTS idx_carrier_shipments_entity_id ON carrier_shipments(entity_id)",
    "CREATE INDEX IF NOT EXISTS idx_carrier_shipments_transaction_id ON carrier_shipments(transaction_id)",
    "CREATE INDEX IF NOT EXISTS idx_carrier_shipments_confirmation_number ON carrier_shipments(confirmation_number)",
    "CREATE INDEX IF NOT EXISTS idx_carrier_shipments_reference_number ON carrier_shipments(reference_number)",
    "CREATE INDEX IF NOT EXISTS idx_carrier_shipments_pro_number ON carrier_shipments(pro_number)",
    "CREATE INDEX IF NOT EXISTS idx_carrier_shipments_bol_number ON carrier_shipments(bol_number)",
    "CREATE INDEX IF NOT EXISTS idx_carrier_shipments_customer_id ON carrier_shipments(customer_id)",
    "CREATE INDEX IF NOT EXISTS idx_carrier_shipments_matching_status ON carrier_shipments(matching_status)",
    "CREATE INDEX IF NOT EXISTS idx_carrier_shipments_last_provider_update ON carrier_shipments(last_provider_update)",
    "CREATE INDEX IF NOT EXISTS idx_tracking_events_shipment_id ON tracking_events(shipment_id)",
    "CREATE INDEX IF NOT EXISTS idx_carrier_documents_shipment_id ON carrier_documents(shipment_id)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_carrier_documents_provider_key ON carrier_documents(provider, external_document_key)",
    "CREATE INDEX IF NOT EXISTS idx_invoices_shipment_id ON invoices(shipment_id)",
    "CREATE INDEX IF NOT EXISTS idx_invoices_customer_organization_id ON invoices(customer_organization_id)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_external_invoice_id ON invoices(external_invoice_id)",
    "CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash)",
    "CREATE INDEX IF NOT EXISTS idx_users_customer_id ON users(customer_id)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_internal_once ON organizations(type) WHERE type = 'internal'",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_customer_legacy ON organizations(legacy_customer_id) WHERE type = 'customer' AND legacy_customer_id IS NOT NULL",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_users_one_active ON organization_users(user_id) WHERE status = 'active'",
    "CREATE INDEX IF NOT EXISTS idx_organization_users_organization_id ON organization_users(organization_id)",
    "CREATE INDEX IF NOT EXISTS idx_agent_customer_relationships_agent ON agent_customer_relationships(agent_organization_id)",
    "CREATE INDEX IF NOT EXISTS idx_agent_customer_relationships_customer ON agent_customer_relationships(customer_organization_id)",
    "CREATE INDEX IF NOT EXISTS idx_address_book_entries_customer_id ON address_book_entries(customer_id)",
    "CREATE INDEX IF NOT EXISTS idx_address_book_entries_customer_organization_id ON address_book_entries(customer_organization_id)",
    "CREATE INDEX IF NOT EXISTS idx_customer_carrier_preferences_customer_id ON customer_carrier_preferences(customer_id)",
    "CREATE INDEX IF NOT EXISTS idx_customer_carrier_preferences_customer_organization_id ON customer_carrier_preferences(customer_organization_id)"
  ];

  for (const statement of statements) {
    await pool.query(statement);
  }
}

async function seedPostgres(pool) {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM customers");
  if (rows[0].count > 0) {
    await seedPostgresUsers(pool);
    return;
  }

  const now = nowIso();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO customers (id, company_name, billing_email, payment_terms, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      ["cust_demo", "Demo Customer", "billing@example.com", "Net 15", "active", now]
    );

    await client.query(
      `INSERT INTO tariff_rules
       (id, customer_id, rule_type, fixed_amount, markup_percentage, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      ["tariff_demo", "cust_demo", "percentage", 50, 15, "active", now]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  await seedPostgresUsers(pool);
}

async function seedPostgresUsers(pool) {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM users");
  if (rows[0].count > 0) {
    return;
  }

  const now = nowIso();
  const admin = createPasswordRecord("Admin123!");
  const customer = createPasswordRecord("Customer123!");
  const { rows: customerRows } = await pool.query("SELECT id FROM customers ORDER BY created_at ASC LIMIT 1");
  const customerId = customerRows[0]?.id || null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO users
       (id, email, password_salt, password_hash, role, customer_id, status, created_at, last_login_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (email) DO NOTHING`,
      [createId("user"), "admin@local.test", admin.salt, admin.hash, "admin", null, "active", now, null]
    );
    if (customerId) {
      await client.query(
        `INSERT INTO users
         (id, email, password_salt, password_hash, role, customer_id, status, created_at, last_login_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (email) DO NOTHING`,
        [
          createId("user"),
          "customer@local.test",
          customer.salt,
          customer.hash,
          "customer",
          customerId,
          "active",
          now,
          null
        ]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function runPostgresOrganizationMigration(dbUrl) {
  const pg = await import("pg");
  const { Pool, types } = pg;

  types.setTypeParser(1700, (value) => (value === null ? null : Number(value)));

  const pool = new Pool({
    connectionString: dbUrl,
    max: 10
  });

  try {
    await pool.query("SELECT 1");
    await ensureSchema(pool);
    await seedPostgres(pool);
    return await migratePostgresOrganizations(pool);
  } finally {
    await pool.end();
  }
}

async function migratePostgresOrganizations(pool) {
  const summary = createOrganizationMigrationSummary();
  const now = nowIso();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const internalResult = await client.query("SELECT * FROM organizations WHERE type = 'internal' ORDER BY created_at ASC");
    let internalOrganization = internalResult.rows[0] || null;
    if (!internalOrganization) {
      const created = await client.query(
        `INSERT INTO organizations (id, type, name, status, legacy_customer_id, billing_email, phone, created_at, updated_at)
         VALUES ($1, 'internal', $2, 'active', NULL, NULL, NULL, $3, $3)
         RETURNING *`,
        ["org_internal", internalOrganizationName, now]
      );
      internalOrganization = created.rows[0];
      markPostgresCreated(summary, "organizationsCreated");
    } else if (internalResult.rows.length > 1) {
      markPostgresUnresolved(summary, "organizations", "internal", "Multiple internal organizations exist.");
    } else {
      markPostgresSkipped(summary);
    }

    const customers = await client.query("SELECT * FROM customers ORDER BY created_at ASC");
    for (const customer of customers.rows) {
      const existing = await client.query(
        "SELECT * FROM organizations WHERE type = 'customer' AND legacy_customer_id = $1 LIMIT 1",
        [customer.id]
      );
      if (existing.rowCount === 0) {
        await client.query(
          `INSERT INTO organizations (id, type, name, status, legacy_customer_id, billing_email, phone, created_at, updated_at)
           VALUES ($1, 'customer', $2, $3, $4, $5, $6, $7, $8)`,
          [
            createId("org"),
            customer.company_name || customer.id,
            customer.status === "disabled" ? "disabled" : "active",
            customer.id,
            customer.billing_email || null,
            customer.company_phone || null,
            customer.created_at || now,
            now
          ]
        );
        markPostgresCreated(summary, "organizationsCreated");
        continue;
      }

      const updated = await client.query(
        `UPDATE organizations
         SET name = $2,
             status = $3,
             billing_email = $4,
             phone = $5,
             updated_at = $6
         WHERE id = $1
           AND (
             name IS DISTINCT FROM $2 OR
             status IS DISTINCT FROM $3 OR
             billing_email IS DISTINCT FROM $4 OR
             phone IS DISTINCT FROM $5
           )`,
        [
          existing.rows[0].id,
          customer.company_name || customer.id,
          customer.status === "disabled" ? "disabled" : "active",
          customer.billing_email || null,
          customer.company_phone || null,
          now
        ]
      );
      if (updated.rowCount > 0) {
        markPostgresUpdated(summary);
      } else {
        markPostgresSkipped(summary);
      }
    }

    const customerOrganizations = await client.query(
      "SELECT id, legacy_customer_id FROM organizations WHERE type = 'customer' AND legacy_customer_id IS NOT NULL"
    );
    const customerOrganizationByLegacyId = new Map(
      customerOrganizations.rows.map((row) => [row.legacy_customer_id, row.id])
    );
    const users = await client.query("SELECT * FROM users ORDER BY created_at ASC");
    for (const user of users.rows) {
      const target = postgresOrganizationTargetForLegacyUser(user, internalOrganization, customerOrganizationByLegacyId);
      if (!target?.organizationId) {
        markPostgresUnresolved(summary, "users", user.id, "User cannot be mapped to an organization.");
        continue;
      }

      const activeMemberships = await client.query(
    "SELECT * FROM organization_users WHERE user_id = $1 ORDER BY created_at ASC",
        [user.id]
      );
      if (activeMemberships.rowCount > 1) {
        markPostgresUnresolved(summary, "organization_users", user.id, "User has multiple active organization memberships.");
        continue;
      }
      if (activeMemberships.rowCount === 1 && activeMemberships.rows[0].organization_id !== target.organizationId) {
        markPostgresUnresolved(summary, "organization_users", user.id, "User already has an active membership in another organization.");
        continue;
      }

      if (activeMemberships.rowCount === 0) {
        await client.query(
          `INSERT INTO organization_users (id, organization_id, user_id, role, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $6)`,
          [
            createId("orguser"),
            target.organizationId,
            user.id,
            target.role,
            user.status === "disabled" ? "disabled" : "active",
            now
          ]
        );
        markPostgresCreated(summary, "membershipsCreated");
        continue;
      }

      const membership = activeMemberships.rows[0];
      const updated = await client.query(
        `UPDATE organization_users
         SET role = $2,
             status = $3,
             updated_at = $4
         WHERE id = $1
           AND (role IS DISTINCT FROM $2 OR status IS DISTINCT FROM $3)`,
        [
          membership.id,
          target.role,
          user.status === "disabled" ? "disabled" : "active",
          now
        ]
      );
      if (updated.rowCount > 0) {
        markPostgresUpdated(summary);
      } else {
        markPostgresSkipped(summary);
      }
    }

    await backfillPostgresOrganizationOwnership(client, summary);
    await client.query("COMMIT");
    return summary;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getPostgresCustomerOrganizationId(queryable, legacyCustomerId) {
  const id = String(legacyCustomerId || "").trim();
  if (!id) {
    return "";
  }
  const { rows } = await queryable.query(
    "SELECT id FROM organizations WHERE type = 'customer' AND legacy_customer_id = $1 LIMIT 1",
    [id]
  );
  return rows[0]?.id || "";
}

function postgresOrganizationTargetForLegacyUser(user, internalOrganization, customerOrganizationByLegacyId) {
  if (internalLegacyRoles.has(user.role)) {
    return {
      organizationId: internalOrganization?.id || "",
      role: user.role
    };
  }
  if (user.role === "customer") {
    return {
      organizationId: customerOrganizationByLegacyId.get(user.customer_id) || "",
      role: "customer_admin"
    };
  }
  return null;
}

async function backfillPostgresOrganizationOwnership(client, summary) {
  const quoteUpdate = await client.query(
    `UPDATE quotes q
     SET customer_organization_id = o.id
     FROM organizations o
     WHERE o.type = 'customer'
       AND o.legacy_customer_id = q.customer_id
       AND q.customer_organization_id IS NULL`
  );
  markPostgresBackfilled(summary, quoteUpdate.rowCount);

  const shipmentUpdate = await client.query(
    `UPDATE shipments s
     SET customer_organization_id = o.id
     FROM organizations o
     WHERE o.type = 'customer'
       AND o.legacy_customer_id = s.customer_id
       AND s.customer_organization_id IS NULL`
  );
  markPostgresBackfilled(summary, shipmentUpdate.rowCount);

  const invoiceUpdate = await client.query(
    `UPDATE invoices i
     SET customer_organization_id = o.id
     FROM organizations o
     WHERE o.type = 'customer'
       AND o.legacy_customer_id = i.customer_id
       AND i.customer_organization_id IS NULL`
  );
  markPostgresBackfilled(summary, invoiceUpdate.rowCount);

  await reportUnresolvedPostgresOwnership(client, summary, "quotes");
  await reportUnresolvedPostgresOwnership(client, summary, "shipments");
  await reportUnresolvedPostgresOwnership(client, summary, "invoices");
}

async function reportUnresolvedPostgresOwnership(client, summary, table) {
  const result = await client.query(
    `SELECT record.id
     FROM ${table} record
     WHERE record.customer_organization_id IS NULL
       AND (
         record.customer_id IS NULL OR
         NOT EXISTS (
           SELECT 1
           FROM organizations o
           WHERE o.type = 'customer'
             AND o.legacy_customer_id = record.customer_id
         )
       )
     LIMIT 100`
  );
  for (const row of result.rows) {
    markPostgresUnresolved(summary, table, row.id, "Record has missing or invalid customer ownership.");
  }
}

async function getPostgresOrganizationContextForUser(pool, user) {
  if (!user?.id) {
    return null;
  }

  const memberships = await pool.query(
    `SELECT id, organization_id, user_id, role, status, created_at, updated_at
     FROM organization_users
     WHERE user_id = $1
     ORDER BY created_at ASC`,
    [user.id]
  );
  const organizations = await pool.query(
    `SELECT id, type, name, status, legacy_customer_id, billing_email, phone, created_at, updated_at
     FROM organizations
     WHERE id = ANY($1::text[])
        OR type = 'internal'
        OR legacy_customer_id = $2`,
    [
      memberships.rows.map((row) => row.organization_id),
      user.customerId || user.customer_id || ""
    ]
  );

  return resolveOrganizationContextForUser(
    user,
    memberships.rows.map(mapOrganizationUserRow),
    organizations.rows.map(mapOrganizationRow)
  );
}

async function ensurePostgresInternalOrganization(client) {
  const existing = await client.query("SELECT * FROM organizations WHERE type = 'internal' ORDER BY created_at ASC LIMIT 1");
  if (existing.rows[0]) {
    return existing.rows[0];
  }
  const created = await client.query(
    `INSERT INTO organizations (id, type, name, status, legacy_customer_id, billing_email, phone, created_at, updated_at)
     VALUES ($1, 'internal', $2, 'active', NULL, NULL, NULL, $3, $3)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    ["org_internal", internalOrganizationName, nowIso()]
  );
  if (created.rows[0]) {
    return created.rows[0];
  }
  const retry = await client.query("SELECT * FROM organizations WHERE type = 'internal' ORDER BY created_at ASC LIMIT 1");
  return retry.rows[0];
}

async function syncPostgresInternalMemberships(client, internalOrganizationId) {
  const users = await client.query(
    "SELECT * FROM users WHERE role = ANY($1::text[]) AND customer_id IS NULL ORDER BY created_at ASC",
    [Array.from(internalLegacyRoles)]
  );
  for (const user of users.rows) {
    const memberships = await client.query(
    "SELECT * FROM organization_users WHERE user_id = $1 ORDER BY created_at ASC",
      [user.id]
    );
    let membership = memberships.rows.find((item) => item.organization_id === internalOrganizationId) || null;
    if (!membership && memberships.rowCount === 0) {
      const inserted = await client.query(
        `INSERT INTO organization_users (id, organization_id, user_id, role, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $6)
         RETURNING *`,
        [
          createId("orguser"),
          internalOrganizationId,
          user.id,
          user.role,
          user.status === "disabled" ? "disabled" : "active",
          nowIso()
        ]
      );
      membership = inserted.rows[0];
    }
    if (membership) {
      await client.query(
        `UPDATE organization_users
         SET role = $2,
             status = $3,
             updated_at = $4
         WHERE id = $1
           AND (role IS DISTINCT FROM $2 OR status IS DISTINCT FROM $3)`,
        [
          membership.id,
          user.role,
          user.status === "disabled" ? "disabled" : "active",
          nowIso()
        ]
      );
    }
  }
}

async function getPostgresInternalUserForUpdate(client, internalOrganizationId, id) {
  const { rows } = await client.query(
    `SELECT u.*
     FROM users u
     JOIN organization_users ou ON ou.user_id = u.id
     WHERE u.id = $1
       AND ou.organization_id = $2
     LIMIT 1
     FOR UPDATE OF u`,
    [id, internalOrganizationId]
  );
  return rows[0] || null;
}

async function lockPostgresActiveInternalAdmins(client, internalOrganizationId) {
  const { rows } = await client.query(
    `SELECT u.id
     FROM users u
     JOIN organization_users ou ON ou.user_id = u.id
     WHERE ou.organization_id = $1
       AND u.role = 'admin'
       AND u.status = 'active'
       AND u.customer_id IS NULL
       AND ou.status = 'active'
     FOR UPDATE OF u`,
    [internalOrganizationId]
  );
  return rows.length;
}

async function createJsonStore(filePath, { runOrganizationMigrationOnStartup = false } = {}) {
  const organizationMigrationSummary = runOrganizationMigrationOnStartup
    ? await runJsonOrganizationMigration(filePath)
    : createOrganizationMigrationSummary();
  if (!runOrganizationMigrationOnStartup) {
    await readJsonDb(filePath);
  }
  if (runOrganizationMigrationOnStartup) {
    console.log("Organization migration summary", organizationMigrationSummary);
  }

  return {
    kind: "json",
    async getOrganizationMigrationSummary() {
      return organizationMigrationSummary;
    },
    async getOrganizationContextForUser(user) {
      const db = await readJsonDb(filePath);
      return resolveOrganizationContextForUser(
        user,
        db.organizationUsers.filter((membership) => membership.userId === user?.id),
        db.organizations
      );
    },
    async getCustomerOrganizationId(customerId) {
      const db = await readJsonDb(filePath);
      return customerOrganizationIdByLegacyCustomerId(db.organizations, customerId) || "";
    },
    async listCustomers() {
      const db = await readJsonDb(filePath);
      return db.customers.map((customer) => ({
        ...normalizeCustomerRecord(customer),
        portalEmail:
          db.users.find((user) => user.customerId === customer.id && user.role === "customer")
            ?.email || null
      }));
    },
    async getCustomer(id) {
      const db = await readJsonDb(filePath);
      const customer = db.customers.find((item) => item.id === id) || null;
      if (!customer) {
        return null;
      }
      return {
        ...normalizeCustomerRecord(customer),
        portalEmail:
          db.users.find((user) => user.customerId === customer.id && user.role === "customer")
            ?.email || null
      };
    },
    async createCustomer(input) {
      const db = await readJsonDb(filePath);
      const customer = {
        id: createId("cust"),
        companyName: String(input.companyName || "").trim(),
        billingEmail: String(input.billingEmail || "").trim(),
        paymentTerms: String(input.paymentTerms || "Net 15").trim(),
        companyPhone: String(input.companyPhone || "").trim(),
        companyOpenTime: String(input.companyOpenTime || "").trim(),
        companyCloseTime: String(input.companyCloseTime || "").trim(),
        companyStreet: String(input.companyStreet || "").trim(),
        companyCity: String(input.companyCity || "").trim(),
        companyState: String(input.companyState || "").trim().toUpperCase(),
      companyZip: String(input.companyZip || "").trim(),
        allowedCarrierModes: normalizeAllowedCarrierModes(input.allowedCarrierModes),
        allowedBooking: normalizeAllowedBooking(input.allowedBooking, true),
        allowedBookingCarrierModes: normalizeAllowedBookingCarrierModes(
          input.allowedBookingCarrierModes,
          input.allowedCarrierModes,
          normalizeAllowedBooking(input.allowedBooking, true)
        ),
        status: "active",
        createdAt: nowIso()
      };
      db.customers.push(customer);
      const customerOrganization = {
        id: createId("org"),
        type: "customer",
        name: customer.companyName,
        status: customer.status,
        legacyCustomerId: customer.id,
        billingEmail: customer.billingEmail || null,
        phone: customer.companyPhone || null,
        createdAt: customer.createdAt,
        updatedAt: nowIso()
      };
      db.organizations.push(customerOrganization);
      db.tariffRules.push(defaultTariffRule(customer.id));
      if (String(input.portalEmail || "").trim()) {
        const password = String(input.portalPassword || "").trim();
        if (!password) {
          throw new Error("PORTAL_PASSWORD_REQUIRED");
        }
        const portalUser = createUserRecord({
          email: input.portalEmail,
          password,
          role: "customer",
          customerId: customer.id
        });
        db.users.push(portalUser);
        db.organizationUsers.push({
          id: createId("orguser"),
          organizationId: customerOrganization.id,
          userId: portalUser.id,
          role: "customer_admin",
          status: portalUser.status,
          createdAt: nowIso(),
          updatedAt: nowIso()
        });
      }
      await writeJsonDb(filePath, db);
      return {
        ...normalizeCustomerRecord(customer),
        portalEmail: String(input.portalEmail || "").trim() || null
      };
    },
    async updateCustomer(id, input) {
      const db = await readJsonDb(filePath);
      const customer = db.customers.find((item) => item.id === id);
      if (!customer) {
        throw new Error("CUSTOMER_NOT_FOUND");
      }

      if (Object.prototype.hasOwnProperty.call(input, "companyName") && String(input.companyName || "").trim()) {
        customer.companyName = String(input.companyName).trim();
      }
      if (Object.prototype.hasOwnProperty.call(input, "billingEmail")) {
        customer.billingEmail = String(input.billingEmail || "").trim();
      }
      if (Object.prototype.hasOwnProperty.call(input, "paymentTerms") && String(input.paymentTerms || "").trim()) {
        customer.paymentTerms = String(input.paymentTerms).trim();
      }
      if (Object.prototype.hasOwnProperty.call(input, "companyPhone")) {
        customer.companyPhone = String(input.companyPhone || "").trim();
      }
      if (Object.prototype.hasOwnProperty.call(input, "companyOpenTime")) {
        customer.companyOpenTime = String(input.companyOpenTime || "").trim();
      }
      if (Object.prototype.hasOwnProperty.call(input, "companyCloseTime")) {
        customer.companyCloseTime = String(input.companyCloseTime || "").trim();
      }
      if (Object.prototype.hasOwnProperty.call(input, "companyStreet")) {
        customer.companyStreet = String(input.companyStreet || "").trim();
      }
      if (Object.prototype.hasOwnProperty.call(input, "companyCity")) {
        customer.companyCity = String(input.companyCity || "").trim();
      }
      if (Object.prototype.hasOwnProperty.call(input, "companyState")) {
        customer.companyState = String(input.companyState || "").trim().toUpperCase();
      }
      if (Object.prototype.hasOwnProperty.call(input, "companyZip")) {
        customer.companyZip = String(input.companyZip || "").trim();
      }
      if (Object.prototype.hasOwnProperty.call(input, "allowedCarrierModes")) {
        customer.allowedCarrierModes = normalizeAllowedCarrierModes(input.allowedCarrierModes);
      }
      if (Object.prototype.hasOwnProperty.call(input, "allowedBooking")) {
        customer.allowedBooking = normalizeAllowedBooking(input.allowedBooking);
      }
      if (Object.prototype.hasOwnProperty.call(input, "allowedBookingCarrierModes")) {
        customer.allowedBookingCarrierModes = normalizeAllowedBookingCarrierModes(
          input.allowedBookingCarrierModes,
          customer.allowedCarrierModes,
          customer.allowedBooking !== false
        );
      }
      if (Object.prototype.hasOwnProperty.call(input, "status") && String(input.status || "").trim()) {
        customer.status = String(input.status).trim();
        for (const user of db.users.filter((item) => item.customerId === id)) {
          user.status = customer.status;
        }
      }

      if (Object.prototype.hasOwnProperty.call(input, "portalEmail") || Object.prototype.hasOwnProperty.call(input, "portalPassword") || Object.prototype.hasOwnProperty.call(input, "portalStatus")) {
        const portal = db.users.find((user) => user.customerId === id && user.role === "customer");
        if (portal) {
          if (Object.prototype.hasOwnProperty.call(input, "portalEmail") && String(input.portalEmail || "").trim()) {
            portal.email = String(input.portalEmail).trim();
          }
          if (Object.prototype.hasOwnProperty.call(input, "portalPassword") && String(input.portalPassword || "").trim()) {
            const record = createPasswordRecord(String(input.portalPassword).trim());
            portal.passwordSalt = record.salt;
            portal.passwordHash = record.hash;
          }
          if (Object.prototype.hasOwnProperty.call(input, "portalStatus") && String(input.portalStatus || "").trim()) {
            portal.status = String(input.portalStatus).trim();
          }
        } else if (String(input.portalEmail || "").trim()) {
          if (!String(input.portalPassword || "").trim()) {
            throw new Error("PORTAL_PASSWORD_REQUIRED");
          }
          db.users.push(
            createUserRecord({
              email: input.portalEmail,
              password: input.portalPassword,
              role: "customer",
              customerId: id,
              status: String(input.portalStatus || "active").trim() || "active"
            })
          );
        }
      }

      if (Object.prototype.hasOwnProperty.call(input, "ruleType") || Object.prototype.hasOwnProperty.call(input, "fixedAmount") || Object.prototype.hasOwnProperty.call(input, "markupPercentage")) {
        db.tariffRules = db.tariffRules.filter((rule) => rule.customerId !== id);
        db.tariffRules.push({
          id: createId("tariff"),
          customerId: id,
          ruleType: normalizeRuleType(input.ruleType || "percentage"),
          fixedAmount: toMoney(input.fixedAmount),
          markupPercentage: toNumber(input.markupPercentage),
          status: "active",
          createdAt: nowIso()
        });
      }

      await writeJsonDb(filePath, db);
      return {
        ...normalizeCustomerRecord(customer),
        portalEmail:
          db.users.find((user) => user.customerId === id && user.role === "customer")?.email || null
      };
    },
    async setCustomerStatus(id, status) {
      const db = await readJsonDb(filePath);
      const customer = db.customers.find((item) => item.id === id);
      if (!customer) {
        throw new Error("CUSTOMER_NOT_FOUND");
      }
      customer.status = status === "disabled" ? "disabled" : "active";
      for (const user of db.users.filter((item) => item.customerId === id)) {
        user.status = customer.status;
      }
      await writeJsonDb(filePath, db);
      return normalizeCustomerRecord(customer);
    },
    async deleteCustomer(id) {
      const db = await readJsonDb(filePath);
      const before = db.customers.length;
      const remainingShipmentIds = new Set(
        db.shipments.filter((item) => item.customerId !== id).map((item) => item.id)
      );
      db.customers = db.customers.filter((item) => item.id !== id);
      if (db.customers.length === before) {
        throw new Error("CUSTOMER_NOT_FOUND");
      }
      db.tariffRules = db.tariffRules.filter((item) => item.customerId !== id);
      db.users = db.users.filter((item) => item.customerId !== id);
      db.quotes = db.quotes.filter((item) => item.customerId !== id);
      db.shipments = db.shipments.filter((item) => item.customerId !== id);
      db.invoices = db.invoices.filter((item) => item.customerId !== id);
      db.trackingEvents = db.trackingEvents.filter((item) => remainingShipmentIds.has(item.shipmentId));
      db.carrierDocuments = db.carrierDocuments.filter((item) => item.customerId !== id && (!item.shipmentId || remainingShipmentIds.has(item.shipmentId)));
      await writeJsonDb(filePath, db);
      return true;
    },
    async listTariffs(customerId) {
      const db = await readJsonDb(filePath);
      const rows = customerId
        ? db.tariffRules.filter((rule) => rule.customerId === customerId)
        : db.tariffRules;
      return rows;
    },
    async upsertTariff(input) {
      const db = await readJsonDb(filePath);
      const customer = db.customers.find((item) => item.id === input.customerId);
      if (!customer) {
        throw new Error("CUSTOMER_NOT_FOUND");
      }

      db.tariffRules = db.tariffRules.filter((rule) => rule.customerId !== input.customerId);
      const tariffRule = {
        id: createId("tariff"),
        customerId: input.customerId,
        ruleType: normalizeRuleType(input.ruleType),
        fixedAmount: toMoney(input.fixedAmount),
        markupPercentage: toNumber(input.markupPercentage),
        status: "active",
        createdAt: nowIso()
      };
      db.tariffRules.push(tariffRule);
      if (Object.prototype.hasOwnProperty.call(input, "allowedCarrierModes")) {
        customer.allowedCarrierModes = normalizeAllowedCarrierModes(input.allowedCarrierModes);
      }
      if (Object.prototype.hasOwnProperty.call(input, "allowedBooking")) {
        customer.allowedBooking = normalizeAllowedBooking(input.allowedBooking);
      }
      if (Object.prototype.hasOwnProperty.call(input, "allowedBookingCarrierModes")) {
        customer.allowedBookingCarrierModes = normalizeAllowedBookingCarrierModes(
          input.allowedBookingCarrierModes,
          customer.allowedCarrierModes,
          customer.allowedBooking !== false
        );
      }
      await writeJsonDb(filePath, db);
      return tariffRule;
    },
    async listAddressBookEntries({ customerId }) {
      const db = await readJsonDb(filePath);
      return db.addressBookEntries
        .filter((entry) => entry.customerId === customerId && entry.status === "active")
        .sort(addressBookSort);
    },
    async getAddressBookEntry(id) {
      const db = await readJsonDb(filePath);
      return db.addressBookEntries.find((entry) => entry.id === id) || null;
    },
    async createAddressBookEntry(input) {
      const db = await readJsonDb(filePath);
      const now = nowIso();
      const usageType = normalizeAddressUsageType(input.usageType);
      const { isDefaultPickup, isDefaultDelivery } = normalizeAddressDefaultFlags(usageType, input);
      clearJsonAddressDefaults(db.addressBookEntries, input.customerId, null, {
        isDefaultPickup,
        isDefaultDelivery,
        updatedAt: now
      });
      const entry = normalizeAddressBookRecord({
        ...input,
        id: createId("addr"),
        customerOrganizationId:
          customerOrganizationIdByLegacyCustomerId(db.organizations, input.customerId) ||
          null,
        label: normalizeAddressLabel(input.label, input.companyName),
        usageType,
        isDefaultPickup,
        isDefaultDelivery,
        status: "active",
        createdAt: now,
        updatedAt: now
      });
      db.addressBookEntries.push(entry);
      await writeJsonDb(filePath, db);
      return entry;
    },
    async updateAddressBookEntry(id, input) {
      const db = await readJsonDb(filePath);
      const entry = db.addressBookEntries.find((item) => item.id === id);
      if (!entry) {
        return null;
      }
      const now = nowIso();
      const usageType = normalizeAddressUsageType(input.usageType);
      const { isDefaultPickup, isDefaultDelivery } = normalizeAddressDefaultFlags(usageType, input);
      clearJsonAddressDefaults(db.addressBookEntries, entry.customerId, entry.id, {
        isDefaultPickup,
        isDefaultDelivery,
        updatedAt: now
      });
      Object.assign(entry, normalizeAddressBookRecord({
        ...entry,
        ...input,
        id: entry.id,
        customerId: entry.customerId,
        customerOrganizationId:
          entry.customerOrganizationId ||
          customerOrganizationIdByLegacyCustomerId(db.organizations, entry.customerId) ||
          null,
        label: normalizeAddressLabel(input.label, input.companyName),
        usageType,
        isDefaultPickup,
        isDefaultDelivery,
        status: entry.status || "active",
        createdAt: entry.createdAt,
        updatedAt: now
      }));
      await writeJsonDb(filePath, db);
      return entry;
    },
    async deleteAddressBookEntry(id) {
      const db = await readJsonDb(filePath);
      const entry = db.addressBookEntries.find((item) => item.id === id);
      if (!entry) {
        return false;
      }
      entry.status = "deleted";
      entry.updatedAt = nowIso();
      await writeJsonDb(filePath, db);
      return true;
    },
    async listCarrierPreferences({ customerId }) {
      const db = await readJsonDb(filePath);
      return db.carrierPreferences.filter((preference) => preference.customerId === customerId && preference.status === "active");
    },
    async getCarrierPreference(id) {
      const db = await readJsonDb(filePath);
      return db.carrierPreferences.find((preference) => preference.id === id) || null;
    },
    async createCarrierPreference(input) {
      const db = await readJsonDb(filePath);
      const now = nowIso();
      const preference = normalizeCarrierPreferenceRecord({
        ...input,
        id: createId("cpref"),
        customerOrganizationId:
          customerOrganizationIdByLegacyCustomerId(db.organizations, input.customerId) ||
          null,
        preference: input.preference === "preferred" ? "preferred" : "blocked",
        status: "active",
        createdAt: now,
        updatedAt: now
      });
      db.carrierPreferences.push(preference);
      await writeJsonDb(filePath, db);
      return preference;
    },
    async deleteCarrierPreference(id) {
      const db = await readJsonDb(filePath);
      const preference = db.carrierPreferences.find((item) => item.id === id);
      if (!preference) {
        return false;
      }
      preference.status = "deleted";
      preference.updatedAt = nowIso();
      await writeJsonDb(filePath, db);
      return true;
    },
    async listCarrierDocuments(filters = {}) {
      const db = await readJsonDb(filePath);
      return db.carrierDocuments
        .slice()
        .sort((left, right) => String(right.updatedAt || right.createdAt || "").localeCompare(String(left.updatedAt || left.createdAt || "")))
        .filter((document) => carrierDocumentMatchesFilters(document, filters));
    },
    async getCarrierDocument(id) {
      const db = await readJsonDb(filePath);
      return db.carrierDocuments.find((document) => document.id === id) || null;
    },
    async listDocumentsForShipment(shipmentId, options = {}) {
      const db = await readJsonDb(filePath);
      return db.carrierDocuments
        .filter((document) => document.shipmentId === shipmentId)
        .filter((document) => carrierDocumentMatchesFilters(document, options));
    },
    async upsertCarrierDocuments(documents) {
      const db = await readJsonDb(filePath);
      const summary = { created: 0, updated: 0, skipped: 0 };
      for (const input of documents) {
        if (!input?.provider || !input?.externalDocumentKey) {
          summary.skipped += 1;
          continue;
        }
        const normalized = normalizeCarrierDocumentRecord({
          ...input,
          id: input.id || createId("cdoc"),
          documentType: normalizeCarrierDocumentType(input.documentType),
          customerVisible: Boolean(input.customerVisible) && ["bol", "pod"].includes(normalizeCarrierDocumentType(input.documentType)),
          status: input.status || "available",
          createdAt: input.createdAt || nowIso(),
          updatedAt: nowIso()
        });
        const existing = db.carrierDocuments.find((document) =>
          document.provider === normalized.provider &&
          document.externalDocumentKey === normalized.externalDocumentKey
        );
        if (existing) {
          Object.assign(existing, {
            ...normalized,
            id: existing.id,
            createdAt: existing.createdAt
          });
          summary.updated += 1;
        } else {
          db.carrierDocuments.push(normalized);
          summary.created += 1;
        }
      }
      await writeJsonDb(filePath, db);
      return summary;
    },
    async markCarrierDocumentSyncError(input) {
      return this.upsertCarrierDocuments([{
        provider: input.provider,
        externalDocumentKey: input.externalDocumentKey || `${input.provider}:${input.shipmentId || "unmatched"}:${input.documentType || "sync-error"}`,
        shipmentId: input.shipmentId || null,
        customerId: input.customerId || null,
        documentType: input.documentType || "other",
        label: input.label || "Document sync error",
        status: "error",
        customerVisible: false,
        providerReference: input.providerReference || {},
        rawMetadata: { message: input.message || "Document sync failed." },
        fetchedAt: nowIso()
      }]);
    },
    async listQuotes() {
      const db = await readJsonDb(filePath);
      return db.quotes.slice().reverse();
    },
    async getQuote(id) {
      const db = await readJsonDb(filePath);
      return db.quotes.find((item) => item.id === id) || null;
    },
    async createQuote(quote) {
      const db = await readJsonDb(filePath);
      const storedQuote = {
        ...quote,
        customerOrganizationId:
          quote.customerOrganizationId ||
          customerOrganizationIdByLegacyCustomerId(db.organizations, quote.customerId) ||
          null,
        agentOrganizationId: quote.agentOrganizationId || null,
        createdByUserId: quote.createdByUserId || null,
        createdByOrganizationId: quote.createdByOrganizationId || null,
        rateAvailability: quote.rateAvailability || null,
        carrierExclusionAudit: Array.isArray(quote.carrierExclusionAudit) ? quote.carrierExclusionAudit : []
      };
      db.quotes.push(storedQuote);
      await writeJsonDb(filePath, db);
      return storedQuote;
    },
    async listShipments() {
      const db = await readJsonDb(filePath);
      return db.shipments.slice().reverse();
    },
    async getShipment(id) {
      const db = await readJsonDb(filePath);
      return db.shipments.find((item) => item.id === id) || null;
    },
    async listCarrierShipments(filters = {}) {
      const db = await readJsonDb(filePath);
      return db.carrierShipments
        .slice()
        .sort((left, right) => String(right.importedAt || "").localeCompare(String(left.importedAt || "")))
        .filter((shipment) => carrierShipmentMatchesFilters(shipment, filters));
    },
    async getCarrierShipment(id) {
      const db = await readJsonDb(filePath);
      const record = db.carrierShipments.find((item) => item.id === id);
      return record ? normalizeCarrierShipmentRecord(record) : null;
    },
    async getCarrierShipmentByProviderExternal(provider, externalShipmentId) {
      const db = await readJsonDb(filePath);
      const record = db.carrierShipments.find((item) => item.provider === provider && item.externalShipmentId === externalShipmentId);
      return record ? normalizeCarrierShipmentRecord(record) : null;
    },
    async upsertCarrierShipments(shipments) {
      const db = await readJsonDb(filePath);
      const summary = { created: 0, updated: 0, skipped: 0 };
      for (const input of shipments) {
        const record = normalizeCarrierShipmentRecord(input);
        if (!record.provider || !record.externalShipmentId) {
          summary.skipped += 1;
          continue;
        }
        const existing = db.carrierShipments.find((item) => item.provider === record.provider && item.externalShipmentId === record.externalShipmentId);
        const merged = mergeCarrierShipmentForProviderSync(existing ? normalizeCarrierShipmentRecord(existing) : null, record);
        if (existing) {
          Object.assign(existing, {
            ...merged,
            id: existing.id,
            importedAt: existing.importedAt,
            updatedAt: nowIso()
          });
          summary.updated += 1;
        } else {
          db.carrierShipments.push({
            ...merged,
            id: merged.id || createId("cship"),
            importedAt: merged.importedAt || nowIso(),
            updatedAt: nowIso()
          });
          summary.created += 1;
        }
      }
      await writeJsonDb(filePath, db);
      return summary;
    },
    async updateCarrierShipment(id, patch) {
      const db = await readJsonDb(filePath);
      const index = db.carrierShipments.findIndex((item) => item.id === id);
      if (index < 0) {
        return null;
      }
      const record = normalizeCarrierShipmentRecord({ ...db.carrierShipments[index], ...patch, id });
      db.carrierShipments[index] = {
        ...record,
        importedAt: db.carrierShipments[index].importedAt || record.importedAt || nowIso(),
        updatedAt: nowIso()
      };
      await writeJsonDb(filePath, db);
      return db.carrierShipments[index];
    },
    async createShipment(payload) {
      const db = await readJsonDb(filePath);
      const quote = db.quotes.find((item) => item.id === payload.quoteId);
      const customerOrganizationId =
        payload.shipment.customerOrganizationId ||
        quote?.customerOrganizationId ||
        customerOrganizationIdByLegacyCustomerId(db.organizations, payload.shipment.customerId) ||
        null;
      const agentOrganizationId = payload.shipment.agentOrganizationId || quote?.agentOrganizationId || null;
      const createdByUserId = payload.shipment.createdByUserId || quote?.createdByUserId || null;
      const createdByOrganizationId = payload.shipment.createdByOrganizationId || quote?.createdByOrganizationId || null;
      const shipment = {
        ...payload.shipment,
        customerOrganizationId,
        agentOrganizationId,
        createdByUserId,
        createdByOrganizationId
      };
        const invoice = {
        id: createId("inv"),
        shipmentId: shipment.id,
        customerId: shipment.customerId,
        customerName: shipment.customerName,
        invoiceNumber: `INV-${String(db.invoices.length + 1).padStart(5, "0")}`,
        referenceNumber: shipment.referenceNumber || "",
        amount: payload.invoice.amount,
        status: payload.invoice.status,
        issuedAt: payload.invoice.issuedAt,
        dueAt: payload.invoice.dueAt,
        createdAt: payload.invoice.createdAt,
        source: "local",
        externalInvoiceId: null,
        carrierName: shipment.carrierName || "",
        carrierEntityId: shipment.carrierEntityId || null,
        rawCarrierResponse: {},
        syncedAt: null,
        customerOrganizationId,
        agentOrganizationId
      };

      db.shipments.push(shipment);
      db.invoices.push(invoice);
      if (quote) {
        quote.status = "booked";
      }
      await writeJsonDb(filePath, db);
      return { shipment, invoice };
    },
    async listInvoices() {
      const db = await readJsonDb(filePath);
      return db.invoices.slice().reverse();
    },
    async upsertExternalInvoices(invoices) {
      const db = await readJsonDb(filePath);
      const summary = {
        created: 0,
        updated: 0,
        skipped: 0
      };

      for (const invoice of invoices) {
        if (!String(invoice.externalInvoiceId || "").trim()) {
          summary.skipped += 1;
          continue;
        }

        const existing = db.invoices.find((item) => item.externalInvoiceId === invoice.externalInvoiceId);
        if (existing) {
          existing.shipmentId = invoice.shipmentId || null;
          existing.customerId = invoice.customerId || null;
          existing.customerName = invoice.customerName || "Imported from Mothership";
          existing.invoiceNumber = invoice.invoiceNumber;
          existing.referenceNumber = invoice.referenceNumber || "";
          existing.amount = invoice.amount;
          existing.status = invoice.status;
          existing.issuedAt = invoice.issuedAt;
          existing.dueAt = invoice.dueAt;
          existing.createdAt = invoice.createdAt;
          existing.source = invoice.source || "mothership";
          existing.carrierName = invoice.carrierName || "Mothership";
          existing.carrierShipmentId = invoice.carrierShipmentId || null;
          existing.carrierEntityId = invoice.carrierEntityId || null;
          existing.rawCarrierResponse = invoice.rawCarrierResponse || {};
          existing.syncedAt = invoice.syncedAt || nowIso();
          existing.customerOrganizationId =
            invoice.customerOrganizationId ||
            existing.customerOrganizationId ||
            customerOrganizationIdByLegacyCustomerId(db.organizations, invoice.customerId) ||
            null;
          existing.agentOrganizationId = invoice.agentOrganizationId || existing.agentOrganizationId || null;
          summary.updated += 1;
          continue;
        }

        const customerOrganizationId =
          invoice.customerOrganizationId ||
          customerOrganizationIdByLegacyCustomerId(db.organizations, invoice.customerId) ||
          null;
        db.invoices.push({
          id: createId("inv"),
          shipmentId: invoice.shipmentId || null,
          customerId: invoice.customerId || null,
          customerName: invoice.customerName || "Imported from Mothership",
          invoiceNumber: invoice.invoiceNumber,
          referenceNumber: invoice.referenceNumber || "",
          amount: invoice.amount,
          status: invoice.status,
          issuedAt: invoice.issuedAt,
          dueAt: invoice.dueAt,
          createdAt: invoice.createdAt,
          source: invoice.source || "mothership",
          externalInvoiceId: invoice.externalInvoiceId,
          carrierName: invoice.carrierName || "Mothership",
          carrierShipmentId: invoice.carrierShipmentId || null,
          carrierEntityId: invoice.carrierEntityId || null,
          rawCarrierResponse: invoice.rawCarrierResponse || {},
          syncedAt: invoice.syncedAt || nowIso(),
          customerOrganizationId,
          agentOrganizationId: invoice.agentOrganizationId || null
        });
        summary.created += 1;
      }

      await writeJsonDb(filePath, db);
      return summary;
    },
    async replaceTrackingEvents(shipmentId, events, rawCarrierResponse) {
      const db = await readJsonDb(filePath);
      db.trackingEvents = db.trackingEvents.filter((item) => item.shipmentId !== shipmentId);
      for (const event of events) {
        db.trackingEvents.push({
          id: createId("track"),
          shipmentId,
          status: event.status,
          eventTime: event.eventTime,
          location: event.location || null,
          description: event.description || null,
          rawCarrierResponse: rawCarrierResponse || event.rawCarrierResponse || {},
          createdAt: nowIso()
        });
      }
      await writeJsonDb(filePath, db);
    },
    async getTrackingEvents(shipmentId) {
      const db = await readJsonDb(filePath);
      return db.trackingEvents
        .filter((item) => item.shipmentId === shipmentId)
        .sort((a, b) => new Date(a.eventTime) - new Date(b.eventTime));
    },
    async getUserByEmail(email) {
      const db = await readJsonDb(filePath);
      return (
        db.users.find((user) => user.email.toLowerCase() === String(email || "").trim().toLowerCase()) ||
        null
      );
    },
    async getUserById(id) {
      const db = await readJsonDb(filePath);
      return db.users.find((user) => user.id === id) || null;
    },
    async createUser(input) {
      const db = await readJsonDb(filePath);
      const user = createUserRecord(input);
      db.users.push(user);
      await writeJsonDb(filePath, db);
      return user;
    },
    async listInternalUsers({ requesterRole } = {}) {
      const db = await readJsonDb(filePath);
      const internalOrganization = ensureJsonInternalOrganization(db);
      syncJsonInternalMemberships(db, internalOrganization.id);
      await writeJsonDb(filePath, db);
      const roles = requesterRole === "operations" ? ["staff"] : ["admin", "operations", "staff"];
      return db.users
    .filter((user, index, users) =>
      roles.includes(user.role) &&
      !user.customerId &&
      jsonUserBelongsToOrganization(db, user.id, internalOrganization.id) &&
      users.findIndex((item) => item.id === user.id) === index
        )
        .sort((left, right) => String(left.createdAt || "").localeCompare(String(right.createdAt || "")) || String(left.email || "").localeCompare(String(right.email || "")))
        .map(safeInternalUser);
    },
    async createInternalUser(input) {
      const db = await readJsonDb(filePath);
      const email = String(input.email || "").trim();
      if (db.users.some((user) => String(user.email || "").toLowerCase() === email.toLowerCase())) {
        throw new StoreValidationError("EMAIL_ALREADY_EXISTS", "Email is already in use.");
      }
      const internalOrganization = ensureJsonInternalOrganization(db);
      syncJsonInternalMemberships(db, internalOrganization.id);
      const user = createUserRecord({
        email,
        password: input.password,
        role: input.role,
        customerId: null,
        status: "active"
      });
      db.users.push(user);
      db.organizationUsers.push({
        id: createId("orguser"),
        organizationId: internalOrganization.id,
        userId: user.id,
        role: user.role,
        status: user.status,
        createdAt: nowIso(),
        updatedAt: nowIso()
      });
      await writeJsonDb(filePath, db);
      return safeInternalUser(user);
    },
    async updateInternalUser(id, input) {
      const db = await readJsonDb(filePath);
      const internalOrganization = ensureJsonInternalOrganization(db);
      syncJsonInternalMemberships(db, internalOrganization.id);
      const target = db.users.find((user) => user.id === id) || null;
      if (!target || !jsonUserBelongsToOrganization(db, target.id, internalOrganization.id)) {
        return null;
      }
      if (target.role === "customer" || target.customerId) {
        throw new StoreValidationError("NOT_INTERNAL_USER", "Customer portal accounts cannot be managed here.");
      }
      const previousRole = target.role;
      const previousStatus = target.status;
      const nextRole = Object.prototype.hasOwnProperty.call(input, "role") ? input.role : target.role;
      const nextStatus = Object.prototype.hasOwnProperty.call(input, "status") ? input.status : target.status;
      if (removesActiveAdmin(target, nextRole, nextStatus)) {
        const activeAdmins = db.users.filter((user) =>
          user.role === "admin" &&
          user.status === "active" &&
          !user.customerId &&
          jsonUserBelongsToOrganization(db, user.id, internalOrganization.id)
        ).length;
        if (activeAdmins <= 1) {
          throw new StoreValidationError("FINAL_ACTIVE_ADMIN", "The final active Admin cannot be demoted or disabled.");
        }
      }
      target.role = nextRole;
      target.status = nextStatus;
      for (const membership of db.organizationUsers.filter((item) => item.organizationId === internalOrganization.id && item.userId === target.id)) {
        membership.role = nextRole;
        membership.status = nextStatus;
        membership.updatedAt = nowIso();
      }
      if (nextRole !== previousRole || nextStatus !== previousStatus) {
        db.sessions = db.sessions.filter((session) => session.userId !== target.id);
      }
      await writeJsonDb(filePath, db);
      return safeInternalUser(target);
    },
    async resetInternalUserPassword(id, password) {
      const db = await readJsonDb(filePath);
      const internalOrganization = ensureJsonInternalOrganization(db);
      syncJsonInternalMemberships(db, internalOrganization.id);
      const target = db.users.find((user) => user.id === id) || null;
      if (!target || target.role === "customer" || target.customerId || !jsonUserBelongsToOrganization(db, target.id, internalOrganization.id)) {
        return null;
      }
      const record = createPasswordRecord(password);
      target.passwordSalt = record.salt;
      target.passwordHash = record.hash;
      db.sessions = db.sessions.filter((session) => session.userId !== target.id);
      await writeJsonDb(filePath, db);
      return safeInternalUser(target);
    },
    async createSession({ userId, tokenHash, expiresAt }) {
      const db = await readJsonDb(filePath);
      db.sessions.push({
        id: createId("sess"),
        userId,
        tokenHash,
        expiresAt,
        createdAt: nowIso()
      });
      await writeJsonDb(filePath, db);
    },
    async getSessionByTokenHash(tokenHash) {
      const db = await readJsonDb(filePath);
      const session = db.sessions.find(
        (item) => item.tokenHash === tokenHash && new Date(item.expiresAt).getTime() > Date.now()
      );
      if (!session) {
        return null;
      }

      const user = db.users.find((item) => item.id === session.userId && item.status === "active");
      if (!user) {
        return null;
      }

      return {
        ...session,
        user
      };
    },
    async deleteSessionByTokenHash(tokenHash) {
      const db = await readJsonDb(filePath);
      db.sessions = db.sessions.filter((item) => item.tokenHash !== tokenHash);
      await writeJsonDb(filePath, db);
    }
  };
}

async function runJsonOrganizationMigration(filePath) {
  const initialDb = await readJsonDb(filePath);
  const { db: migratedDb, summary } = migrateJsonOrganizations(initialDb, {
    createId,
    nowIso
  });
  await writeJsonDb(filePath, migratedDb);
  return summary;
}

async function readJsonDb(filePath) {
  if (!existsSync(filePath)) {
    const seed = createSeedDb();
    await writeJsonDb(filePath, seed);
    return seed;
  }

  const raw = await readFile(filePath, "utf8");
  const normalized = normalizeJsonDb(JSON.parse(raw));
  const { db: hydrated, changed } = ensureJsonUsers(normalized);
  if (changed) {
    await writeJsonDb(filePath, hydrated);
  }
  return hydrated;
}

async function writeJsonDb(filePath, db) {
  await writeFile(filePath, `${JSON.stringify(db, null, 2)}\n`, "utf8");
}

function createSeedDb() {
  const now = nowIso();
  return {
    customers: [
      {
        id: "cust_demo",
        companyName: "Demo Customer",
        billingEmail: "billing@example.com",
        paymentTerms: "Net 15",
        companyPhone: "",
        companyOpenTime: "",
        companyCloseTime: "",
        companyStreet: "",
        companyCity: "",
        companyState: "",
        companyZip: "",
        allowedCarrierModes: ["mothershipSandbox"],
        allowedBooking: true,
        allowedBookingCarrierModes: ["mothershipSandbox"],
        status: "active",
        createdAt: now
      }
    ],
    tariffRules: [
      {
        id: "tariff_demo",
        customerId: "cust_demo",
        ruleType: "percentage",
        fixedAmount: 50,
        markupPercentage: 15,
        status: "active",
        createdAt: now
      }
    ],
    users: [
      createUserRecord({
        id: "user_admin",
        email: "admin@local.test",
        password: "Admin123!",
        role: "admin"
      }),
      createUserRecord({
        id: "user_customer",
        email: "customer@local.test",
        password: "Customer123!",
        role: "customer",
        customerId: "cust_demo"
      })
    ],
    sessions: [],
    quotes: [],
    shipments: [],
    carrierShipments: [],
    invoices: [],
    carrierDocuments: [],
    trackingEvents: []
  };
}

function defaultTariffRule(customerId) {
  return {
    id: createId("tariff"),
    customerId,
    ruleType: "percentage",
    fixedAmount: 50,
    markupPercentage: 15,
    status: "active",
    createdAt: nowIso()
  };
}

function normalizeRuleType(ruleType) {
  return ["fixed", "percentage"].includes(ruleType) ? ruleType : "percentage";
}

function normalizeCarrierMode(value) {
  const mode = String(value || "").trim();
  const aliases = {
    mothership: "mothershipSandbox",
    mothershipsandbox: "mothershipSandbox",
    speedship: "speedshipLtl",
    speedshipltl: "speedshipLtl",
    priority1: "priority1Ltl",
    priority1ltl: "priority1Ltl",
    fedex: "fedexFreight",
    fedexfreight: "fedexFreight",
    fedexltl: "fedexFreight",
    demo: "demo",
    "mothership-demo": "demo"
  };
  const key = mode.toLowerCase().replace(/[\s_-]+/g, "");
  return aliases[key] || mode;
}

function normalizeAllowedCarrierModes(value, fallback = ["mothershipSandbox"]) {
  const list = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\s]+/).filter(Boolean)
      : [];
  const normalized = [];

  for (const entry of list) {
    const mode = normalizeCarrierMode(entry);
    if (mode === "demo" || mode === "mothershipSandbox" || mode === "speedshipLtl" || mode === "priority1Ltl" || mode === "fedexFreight") {
      if (!normalized.includes(mode)) {
        normalized.push(mode);
      }
    }
  }

  return normalized.length > 0 ? normalized : fallback;
}

function normalizeAllowedBookingCarrierModes(value, allowedCarrierModes = null, bookingAllowed = true) {
  if (bookingAllowed === false) {
    return [];
  }

  const allowedModes = normalizeAllowedCarrierModes(allowedCarrierModes, []);
  const fallbackModes = allowedModes.length > 0 ? allowedModes : ["mothershipSandbox"];
  const list = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\s]+/).filter(Boolean)
      : [];
  const normalized = [];

  for (const entry of list) {
    const mode = normalizeCarrierMode(entry);
    if (!fallbackModes.includes(mode)) {
      continue;
    }
    if (!normalized.includes(mode)) {
      normalized.push(mode);
    }
  }

  return normalized.length > 0 ? normalized : fallbackModes;
}

function normalizeAllowedBooking(value, fallback = true) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["false", "0", "no", "off", "disabled"].includes(normalized)) {
    return false;
  }
  if (["true", "1", "yes", "on", "enabled"].includes(normalized)) {
    return true;
  }
  return fallback;
}

function toMoney(value) {
  return Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) / 100 : 0;
}

function toNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

function mapCustomerRow(row) {
  const allowedCarrierModes = normalizeAllowedCarrierModes(row.allowed_carrier_modes);
  const allowedBooking = row.allowed_booking !== false;
  return {
    id: row.id,
    companyName: row.company_name,
    billingEmail: row.billing_email,
    paymentTerms: row.payment_terms,
    companyPhone: row.company_phone || "",
    companyOpenTime: row.company_open_time || "",
    companyCloseTime: row.company_close_time || "",
    companyStreet: row.company_street || "",
    companyCity: row.company_city || "",
    companyState: row.company_state || "",
    companyZip: row.company_zip || "",
    allowedCarrierModes,
    allowedBooking,
    allowedBookingCarrierModes: normalizeAllowedBookingCarrierModes(
      row.allowed_booking_carrier_modes,
      allowedCarrierModes,
      allowedBooking
    ),
    status: row.status,
    portalEmail: row.portal_email || null,
    createdAt: row.created_at
  };
}

function mapTariffRuleRow(row) {
  return {
    id: row.id,
    customerId: row.customer_id,
    ruleType: row.rule_type,
    fixedAmount: row.fixed_amount,
    markupPercentage: row.markup_percentage,
    status: row.status,
    createdAt: row.created_at
  };
}

function mapAddressBookEntryRow(row) {
  return {
    id: row.id,
    customerOrganizationId: row.customer_organization_id || null,
    customerId: row.customer_id,
    label: row.label,
    usageType: row.usage_type,
    companyName: row.company_name,
    contactName: row.contact_name || null,
    street: row.street,
    city: row.city,
    state: row.state,
    zip: row.zip,
    country: row.country || "US",
    phone: row.phone || "",
    email: row.email || null,
    openTime: row.open_time || "",
    closeTime: row.close_time || "",
    defaultAccessorials: Array.isArray(row.default_accessorials) ? row.default_accessorials : [],
    isDefaultPickup: Boolean(row.is_default_pickup),
    isDefaultDelivery: Boolean(row.is_default_delivery),
    status: row.status,
    createdByUserId: row.created_by_user_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapCarrierPreferenceRow(row) {
  return {
    id: row.id,
    customerOrganizationId: row.customer_organization_id || null,
    customerId: row.customer_id,
    carrierKey: row.carrier_key,
    carrierName: row.carrier_name,
    preference: row.preference,
    reason: row.reason || null,
    status: row.status,
    createdByUserId: row.created_by_user_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapCarrierDocumentRow(row) {
  return {
    id: row.id,
    shipmentId: row.shipment_id || null,
    customerId: row.customer_id || null,
    provider: row.provider,
    externalDocumentKey: row.external_document_key,
    documentType: normalizeCarrierDocumentType(row.document_type),
    label: row.label || "",
    filename: row.filename || null,
    contentType: row.content_type || null,
    customerVisible: Boolean(row.customer_visible),
    status: row.status || "available",
    providerReference: row.provider_reference || {},
    rawMetadata: row.raw_metadata || {},
    fetchedAt: row.fetched_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapQuoteRow(row) {
  const carrierModes =
    Array.isArray(row.carrier_modes) && row.carrier_modes.length > 0
      ? normalizeAllowedCarrierModes(row.carrier_modes, [])
      : row.carrier_mode && row.carrier_mode !== "multiCarrier"
        ? normalizeAllowedCarrierModes([row.carrier_mode], [])
        : [];
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    carrierMode: row.carrier_mode,
    carrierModes,
    carrier: row.carrier,
    carrierQuoteId: row.carrier_quote_id,
    referenceNumber: row.reference_number || "",
    pickup: row.pickup,
    delivery: row.delivery,
    freight: row.freight,
    pickupReadyDate: row.pickup_ready_date,
    tariffRule: row.tariff_rule,
    rates: row.rates,
    status: row.status,
    carrierMessage: row.carrier_message || "",
    carrierAudit: Array.isArray(row.carrier_audit) ? row.carrier_audit : row.carrier_audit || [],
    carrierExclusionAudit: Array.isArray(row.carrier_exclusion_audit) ? row.carrier_exclusion_audit : row.carrier_exclusion_audit || [],
    rawCarrierResponse: row.raw_carrier_response,
    rateAvailability: row.rate_availability || null,
    customerOrganizationId: row.customer_organization_id || null,
    agentOrganizationId: row.agent_organization_id || null,
    createdByUserId: row.created_by_user_id || null,
    createdByOrganizationId: row.created_by_organization_id || null,
    createdAt: row.created_at
  };
}

function mapShipmentRow(row) {
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    quoteId: row.quote_id,
    carrier: row.carrier,
    carrierName: row.carrier_name || "",
    carrierShipmentId: row.carrier_shipment_id,
    carrierEntityId: row.carrier_entity_id || null,
    confirmationNumber: row.confirmation_number,
    referenceNumber: row.reference_number || "",
    pickup: row.pickup,
    delivery: row.delivery,
    freight: row.freight,
    carrierCost: row.carrier_cost,
    sellPrice: row.sell_price,
    margin: row.margin,
    provider: row.provider,
    service: row.service,
    status: row.status,
    pickupDate: row.pickup_date,
    carrierShipment: row.carrier_shipment,
    customerOrganizationId: row.customer_organization_id || null,
    agentOrganizationId: row.agent_organization_id || null,
    createdByUserId: row.created_by_user_id || null,
    createdByOrganizationId: row.created_by_organization_id || null,
    createdAt: row.created_at
  };
}

function mapCarrierShipmentRow(row) {
  return normalizeCarrierShipmentRecord({
    id: row.id,
    provider: row.provider,
    importSource: row.import_source,
    bookingChannel: row.booking_channel,
    bookingChannelEvidence: row.booking_channel_evidence || {},
    linkedShipmentId: row.linked_shipment_id || null,
    customerId: row.customer_id || null,
    matchingStatus: row.matching_status,
    externalShipmentId: row.external_shipment_id,
    entityId: row.entity_id || "",
    transactionId: row.transaction_id || "",
    confirmationNumber: row.confirmation_number || "",
    referenceNumber: row.reference_number || "",
    proNumber: row.pro_number || "",
    bolNumber: row.bol_number || "",
    origin: row.origin || {},
    destination: row.destination || {},
    carrierName: row.carrier_name || "",
    service: row.service || "",
    status: row.status || "",
    carrierCost: row.carrier_cost || 0,
    rawProviderRecord: row.raw_provider_record || {},
    importedAt: row.imported_at,
    lastProviderUpdate: row.last_provider_update || null,
    updatedAt: row.updated_at
  });
}

function mapInvoiceRow(row) {
  return {
    id: row.id,
    shipmentId: row.shipment_id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    invoiceNumber: row.invoice_number,
    referenceNumber: row.reference_number || "",
    amount: row.amount,
    status: row.status,
    issuedAt: row.issued_at,
    dueAt: row.due_at,
    createdAt: row.created_at,
    source: row.source || "local",
    externalInvoiceId: row.external_invoice_id || null,
    carrierName: row.carrier_name || "",
    carrierShipmentId: row.carrier_shipment_id || null,
    carrierEntityId: row.carrier_entity_id || null,
    rawCarrierResponse: row.raw_carrier_response || {},
    syncedAt: row.synced_at || null,
    customerOrganizationId: row.customer_organization_id || null,
    agentOrganizationId: row.agent_organization_id || null
  };
}

function mapTrackingEventRow(row) {
  return {
    id: row.id,
    shipmentId: row.shipment_id,
    status: row.status,
    eventTime: row.event_time,
    location: row.location,
    description: row.description,
    rawCarrierResponse: row.raw_carrier_response,
    createdAt: row.created_at
  };
}

function mapUserRow(row) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    customerId: row.customer_id,
    status: row.status,
    passwordSalt: row.password_salt,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at || null
  };
}

function mapSafeInternalUserRow(row) {
  return safeInternalUser({
    id: row.id,
    email: row.email,
    role: row.role,
    customerId: row.customer_id,
    status: row.status,
    createdAt: row.created_at
  });
}

function safeInternalUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt || user.created_at || null
  };
}

function mapSessionRow(row) {
  return {
    id: row.id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    user: {
      id: row.user_id,
      email: row.email,
      role: row.role,
      customerId: row.customer_id,
      status: row.user_status
    }
  };
}

function mapOrganizationRow(row) {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    status: row.status,
    legacyCustomerId: row.legacy_customer_id || null,
    billingEmail: row.billing_email || null,
    phone: row.phone || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapOrganizationUserRow(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function markPostgresCreated(summary, detailKey) {
  summary.created += 1;
  if (detailKey) {
    summary.details[detailKey] += 1;
  }
}

function markPostgresUpdated(summary) {
  summary.updated += 1;
}

function markPostgresBackfilled(summary, count) {
  if (!count) {
    return;
  }
  summary.updated += count;
  summary.details.recordsBackfilled += count;
}

function markPostgresSkipped(summary) {
  summary.skipped += 1;
}

function markPostgresUnresolved(summary, collection, id, reason) {
  summary.unresolved += 1;
  summary.details.unresolvedRecords.push({
    collection,
    id: String(id || ""),
    reason
  });
}

function normalizeJsonDb(db) {
  return {
    customers: Array.isArray(db.customers) ? db.customers.map(normalizeCustomerRecord) : [],
    tariffRules: Array.isArray(db.tariffRules) ? db.tariffRules : [],
    users: Array.isArray(db.users) ? db.users : [],
    sessions: Array.isArray(db.sessions) ? db.sessions : [],
    organizations: Array.isArray(db.organizations) ? db.organizations.map(normalizeOrganizationRecord) : [],
    organizationUsers: Array.isArray(db.organizationUsers) ? db.organizationUsers.map(normalizeOrganizationUserRecord) : [],
    agentCustomerRelationships: Array.isArray(db.agentCustomerRelationships) ? db.agentCustomerRelationships : [],
    addressBookEntries: Array.isArray(db.addressBookEntries) ? db.addressBookEntries.map(normalizeAddressBookRecord) : [],
    carrierPreferences: Array.isArray(db.carrierPreferences) ? db.carrierPreferences.map(normalizeCarrierPreferenceRecord) : [],
    carrierDocuments: Array.isArray(db.carrierDocuments) ? db.carrierDocuments.map(normalizeCarrierDocumentRecord) : [],
    carrierShipments: Array.isArray(db.carrierShipments) ? db.carrierShipments.map(normalizeCarrierShipmentRecord) : [],
    quotes: Array.isArray(db.quotes) ? db.quotes.map(normalizeQuoteRecord) : [],
    shipments: Array.isArray(db.shipments) ? db.shipments : [],
    invoices: Array.isArray(db.invoices) ? db.invoices : [],
    trackingEvents: Array.isArray(db.trackingEvents) ? db.trackingEvents : []
  };
}

function normalizeCustomerRecord(customer) {
  const allowedCarrierModes = normalizeAllowedCarrierModes(customer?.allowedCarrierModes);
  const allowedBooking = normalizeAllowedBooking(customer?.allowedBooking, true);
  return {
    ...customer,
    allowedCarrierModes,
    allowedBooking,
    allowedBookingCarrierModes: normalizeAllowedBookingCarrierModes(
      customer?.allowedBookingCarrierModes,
      allowedCarrierModes,
      allowedBooking
    )
  };
}

function normalizeOrganizationRecord(organization) {
  return {
    id: String(organization?.id || "").trim(),
    type: String(organization?.type || "").trim(),
    name: String(organization?.name || "").trim(),
    status: organization?.status === "disabled" ? "disabled" : "active",
    legacyCustomerId: organization?.legacyCustomerId || organization?.legacy_customer_id || null,
    billingEmail: organization?.billingEmail || organization?.billing_email || null,
    phone: organization?.phone || null,
    createdAt: organization?.createdAt || organization?.created_at || nowIso(),
    updatedAt: organization?.updatedAt || organization?.updated_at || nowIso()
  };
}

function normalizeOrganizationUserRecord(membership) {
  return {
    id: String(membership?.id || "").trim(),
    organizationId: membership?.organizationId || membership?.organization_id || "",
    userId: membership?.userId || membership?.user_id || "",
    role: String(membership?.role || "").trim(),
    status: membership?.status === "disabled" ? "disabled" : "active",
    createdAt: membership?.createdAt || membership?.created_at || nowIso(),
    updatedAt: membership?.updatedAt || membership?.updated_at || nowIso()
  };
}

function normalizeAddressBookRecord(entry) {
  return {
    id: String(entry?.id || "").trim(),
    customerOrganizationId: entry?.customerOrganizationId || entry?.customer_organization_id || null,
    customerId: entry?.customerId || entry?.customer_id || "",
    label: normalizeAddressLabel(entry?.label, entry?.companyName || entry?.company_name),
    usageType: normalizeAddressUsageType(entry?.usageType || entry?.usage_type),
    companyName: String(entry?.companyName || entry?.company_name || "").trim(),
    contactName: entry?.contactName || entry?.contact_name || null,
    street: String(entry?.street || "").trim(),
    city: String(entry?.city || "").trim(),
    state: String(entry?.state || "").trim().toUpperCase(),
    zip: String(entry?.zip || "").trim(),
    country: String(entry?.country || "US").trim() || "US",
    phone: String(entry?.phone || "").trim(),
    email: entry?.email || null,
    openTime: String(entry?.openTime || entry?.open_time || "").trim(),
    closeTime: String(entry?.closeTime || entry?.close_time || "").trim(),
    defaultAccessorials: Array.isArray(entry?.defaultAccessorials)
      ? entry.defaultAccessorials.filter(Boolean)
      : Array.isArray(entry?.default_accessorials)
        ? entry.default_accessorials.filter(Boolean)
        : [],
    isDefaultPickup: Boolean(entry?.isDefaultPickup || entry?.is_default_pickup),
    isDefaultDelivery: Boolean(entry?.isDefaultDelivery || entry?.is_default_delivery),
    status: entry?.status === "deleted" ? "deleted" : "active",
    createdByUserId: entry?.createdByUserId || entry?.created_by_user_id || null,
    createdAt: entry?.createdAt || entry?.created_at || nowIso(),
    updatedAt: entry?.updatedAt || entry?.updated_at || nowIso()
  };
}

function normalizeCarrierPreferenceRecord(preference) {
  return {
    id: String(preference?.id || "").trim(),
    customerOrganizationId: preference?.customerOrganizationId || preference?.customer_organization_id || null,
    customerId: preference?.customerId || preference?.customer_id || "",
    carrierKey: String(preference?.carrierKey || preference?.carrier_key || "").trim(),
    carrierName: String(preference?.carrierName || preference?.carrier_name || "").trim(),
    preference: preference?.preference === "preferred" ? "preferred" : "blocked",
    reason: preference?.reason || null,
    status: preference?.status === "deleted" ? "deleted" : "active",
    createdByUserId: preference?.createdByUserId || preference?.created_by_user_id || null,
    createdAt: preference?.createdAt || preference?.created_at || nowIso(),
    updatedAt: preference?.updatedAt || preference?.updated_at || nowIso()
  };
}

function normalizeCarrierDocumentType(value) {
  const text = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (["bol", "billoflading", "billlading"].includes(text)) return "bol";
  if (["pod", "proofofdelivery", "deliveryreceipt"].includes(text)) return "pod";
  if (["invoice", "carrierinvoice", "customerinvoice"].includes(text)) return "invoice";
  return "other";
}

function normalizeCarrierDocumentRecord(document) {
  const documentType = normalizeCarrierDocumentType(document?.documentType || document?.document_type);
  return {
    id: String(document?.id || "").trim(),
    shipmentId: document?.shipmentId || document?.shipment_id || null,
    customerId: document?.customerId || document?.customer_id || null,
    provider: String(document?.provider || "").trim(),
    externalDocumentKey: String(document?.externalDocumentKey || document?.external_document_key || "").trim(),
    documentType,
    label: String(document?.label || "").trim(),
    filename: document?.filename || null,
    contentType: document?.contentType || document?.content_type || null,
    customerVisible: Boolean(document?.customerVisible || document?.customer_visible) && ["bol", "pod"].includes(documentType),
    status: String(document?.status || "available").trim() || "available",
    providerReference: document?.providerReference || document?.provider_reference || {},
    rawMetadata: redactCarrierDocumentMetadata(document?.rawMetadata || document?.raw_metadata || {}),
    fetchedAt: document?.fetchedAt || document?.fetched_at || null,
    createdAt: document?.createdAt || document?.created_at || nowIso(),
    updatedAt: document?.updatedAt || document?.updated_at || nowIso()
  };
}

function redactCarrierDocumentMetadata(value, depth = 0) {
  if (!value || depth > 8) return value;
  if (Array.isArray(value)) {
    return value.map((item) => redactCarrierDocumentMetadata(item, depth + 1));
  }
  if (typeof value !== "object") {
    if (typeof value === "string" && /^https?:\/\//i.test(value)) {
      return value.split("?")[0].split("#")[0];
    }
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !/^(authorization|token|access_token|api_key|signature|sig|x-amz-signature|x-amz-credential|x-amz-security-token|cookie|set-cookie)$/i.test(String(key || "")))
      .map(([key, child]) => [key, redactCarrierDocumentMetadata(child, depth + 1)])
  );
}

function carrierDocumentMatchesFilters(document, filters = {}) {
  if (filters.shipmentId && document.shipmentId !== filters.shipmentId) return false;
  if (filters.provider && document.provider !== filters.provider) return false;
  if (filters.type && document.documentType !== filters.type) return false;
  if (filters.status && document.status !== filters.status) return false;
  if (filters.customerVisible !== undefined && Boolean(document.customerVisible) !== Boolean(filters.customerVisible)) return false;
  if (filters.customerId && document.customerId !== filters.customerId) return false;
  if (filters.matched === "matched" && !document.shipmentId) return false;
  if (filters.matched === "unmatched" && document.shipmentId) return false;
  return true;
}

function normalizeCarrierShipmentRecord(shipment) {
  const provider = normalizeCarrierShipmentValue(
    shipment?.provider,
    carrierShipmentProviders,
    ""
  );
  const importSource = normalizeCarrierShipmentValue(
    shipment?.importSource || shipment?.import_source,
    carrierShipmentImportSources,
    "provider_import"
  );
  const bookingChannel = normalizeCarrierShipmentValue(
    shipment?.bookingChannel || shipment?.booking_channel,
    carrierShipmentBookingChannels,
    "unknown"
  );
  const matchingStatus = normalizeCarrierShipmentValue(
    shipment?.matchingStatus || shipment?.matching_status,
    carrierShipmentMatchingStatuses,
    "unmatched"
  );
  const origin = shipment?.origin && typeof shipment.origin === "object" ? shipment.origin : {};
  const destination = shipment?.destination && typeof shipment.destination === "object" ? shipment.destination : {};
  const rawProviderRecord = shipment?.rawProviderRecord || shipment?.raw_provider_record || {};
  return {
    id: String(shipment?.id || "").trim(),
    provider,
    importSource,
    bookingChannel,
    bookingChannelEvidence: shipment?.bookingChannelEvidence || shipment?.booking_channel_evidence || {},
    linkedShipmentId: shipment?.linkedShipmentId || shipment?.linked_shipment_id || null,
    customerId: shipment?.customerId || shipment?.customer_id || null,
    matchingStatus,
    externalShipmentId: normalizeCarrierShipmentIdentifier(shipment?.externalShipmentId || shipment?.external_shipment_id),
    entityId: normalizeCarrierShipmentIdentifier(shipment?.entityId || shipment?.entity_id),
    transactionId: normalizeCarrierShipmentIdentifier(shipment?.transactionId || shipment?.transaction_id),
    confirmationNumber: String(shipment?.confirmationNumber || shipment?.confirmation_number || "").trim(),
    referenceNumber: String(shipment?.referenceNumber || shipment?.reference_number || "").trim(),
    proNumber: String(shipment?.proNumber || shipment?.pro_number || "").trim(),
    bolNumber: String(shipment?.bolNumber || shipment?.bol_number || "").trim(),
    origin,
    destination,
    carrierName: String(shipment?.carrierName || shipment?.carrier_name || "").trim(),
    service: String(shipment?.service || "").trim(),
    status: String(shipment?.status || "").trim(),
    carrierCost: Number(shipment?.carrierCost ?? shipment?.carrier_cost ?? 0) || 0,
    rawProviderRecord: sanitizeCarrierShipmentPayload(rawProviderRecord),
    importedAt: shipment?.importedAt || shipment?.imported_at || nowIso(),
    lastProviderUpdate: shipment?.lastProviderUpdate || shipment?.last_provider_update || null,
    updatedAt: shipment?.updatedAt || shipment?.updated_at || nowIso()
  };
}

function carrierShipmentMatchesFilters(shipment, filters = {}) {
  if (filters.provider && filters.provider !== "all" && shipment.provider !== filters.provider) return false;
  if (filters.importSource && filters.importSource !== "all" && shipment.importSource !== filters.importSource) return false;
  if (filters.bookingChannel && filters.bookingChannel !== "all" && shipment.bookingChannel !== filters.bookingChannel) return false;
  if (filters.matchingStatus && filters.matchingStatus !== "all" && shipment.matchingStatus !== filters.matchingStatus) return false;
  if (filters.customerId && shipment.customerId !== filters.customerId) return false;
  if (filters.linkedShipmentId && shipment.linkedShipmentId !== filters.linkedShipmentId) return false;
  if (filters.matched === "matched" && !shipment.linkedShipmentId) return false;
  if (filters.matched === "unmatched" && shipment.linkedShipmentId) return false;
  return true;
}

function normalizeQuoteRecord(quote) {
  return {
    ...quote,
    carrierExclusionAudit: Array.isArray(quote?.carrierExclusionAudit)
      ? quote.carrierExclusionAudit
      : Array.isArray(quote?.carrier_exclusion_audit)
        ? quote.carrier_exclusion_audit
        : []
  };
}

function normalizeAddressUsageType(value) {
  return ["pickup", "delivery", "both"].includes(value) ? value : "both";
}

function addressUsageAllowsPickupDefault(usageType) {
  return usageType === "pickup" || usageType === "both";
}

function addressUsageAllowsDeliveryDefault(usageType) {
  return usageType === "delivery" || usageType === "both";
}

function normalizeAddressDefaultFlags(usageType, input = {}) {
  return {
    isDefaultPickup: addressUsageAllowsPickupDefault(usageType) && Boolean(input.isDefaultPickup),
    isDefaultDelivery: addressUsageAllowsDeliveryDefault(usageType) && Boolean(input.isDefaultDelivery)
  };
}

function ensureJsonInternalOrganization(db) {
  let organization = db.organizations.find((item) => item.type === "internal") || null;
  if (!organization) {
    organization = {
      id: "org_internal",
      type: "internal",
      name: internalOrganizationName,
      status: "active",
      legacyCustomerId: null,
      billingEmail: null,
      phone: null,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    db.organizations.push(organization);
  }
  return organization;
}

function syncJsonInternalMemberships(db, internalOrganizationId) {
  for (const user of db.users.filter((item) => internalLegacyRoles.has(item.role) && !item.customerId)) {
    const memberships = db.organizationUsers.filter((membership) => membership.userId === user.id);
    let membership = memberships.find((item) => item.organizationId === internalOrganizationId) || null;
    if (!membership && memberships.length === 0) {
      membership = {
        id: createId("orguser"),
        organizationId: internalOrganizationId,
        userId: user.id,
        role: user.role,
        status: user.status === "disabled" ? "disabled" : "active",
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      db.organizationUsers.push(membership);
    }
    if (membership) {
      membership.role = user.role;
      membership.status = user.status === "disabled" ? "disabled" : "active";
      membership.updatedAt = nowIso();
    }
  }
}

function jsonUserBelongsToOrganization(db, userId, organizationId) {
  return db.organizationUsers.some((membership) =>
    membership.userId === userId &&
    membership.organizationId === organizationId &&
    membership.status !== "deleted"
  );
}

function removesActiveAdmin(target, nextRole, nextStatus) {
  return target.role === "admin" &&
    target.status === "active" &&
    !(nextRole === "admin" && nextStatus === "active");
}

function clearJsonAddressDefaults(entries, customerId, exceptId, defaults) {
  for (const entry of entries) {
    if (entry.customerId !== customerId || entry.status !== "active" || entry.id === exceptId) {
      continue;
    }
    let changed = false;
    if (defaults.isDefaultPickup && entry.isDefaultPickup) {
      entry.isDefaultPickup = false;
      changed = true;
    }
    if (defaults.isDefaultDelivery && entry.isDefaultDelivery) {
      entry.isDefaultDelivery = false;
      changed = true;
    }
    if (changed) {
      entry.updatedAt = defaults.updatedAt;
    }
  }
}

function normalizeAddressLabel(label, companyName) {
  const text = String(label || "").trim();
  return text || String(companyName || "Saved address").trim() || "Saved address";
}

function addressBookSort(left, right) {
  if (left.isDefaultPickup !== right.isDefaultPickup) {
    return left.isDefaultPickup ? -1 : 1;
  }
  if (left.isDefaultDelivery !== right.isDefaultDelivery) {
    return left.isDefaultDelivery ? -1 : 1;
  }
  return String(left.label || "").localeCompare(String(right.label || ""));
}

function ensureJsonUsers(db) {
  const next = {
    ...db,
    users: [...db.users],
    sessions: [...db.sessions]
  };
  let changed = false;

  const now = nowIso();
  const hasAdmin = next.users.some((user) => user.email === "admin@local.test");
  if (!hasAdmin) {
    next.users.push(
      createUserRecord({
        id: "user_admin",
        email: "admin@local.test",
        password: "Admin123!",
        role: "admin",
        createdAt: now
      })
    );
    changed = true;
  }

  const hasCustomer = next.users.some((user) => user.email === "customer@local.test");
  if (!hasCustomer) {
    const firstCustomerId = next.customers[0]?.id || null;
    next.users.push(
      createUserRecord({
        id: "user_customer",
        email: "customer@local.test",
        password: "Customer123!",
        role: "customer",
        customerId: firstCustomerId,
        createdAt: now
      })
    );
    changed = true;
  }

  return { db: next, changed };
}

function createUserRecord(input) {
  const record = createPasswordRecord(input.password);
  return {
    id: input.id || createId("user"),
    email: String(input.email || "").trim(),
    role: input.role || "customer",
    customerId: input.customerId || null,
    status: input.status || "active",
    passwordSalt: record.salt,
    passwordHash: record.hash,
    createdAt: input.createdAt || nowIso(),
    lastLoginAt: input.lastLoginAt || null
  };
}

function normalizeNullableString(value) {
  if (!Object.prototype.hasOwnProperty.call({ value }, "value")) {
    return null;
  }
  if (value === undefined || value === null) {
    return null;
  }
  const text = String(value).trim();
  return text ? text : null;
}

function createPasswordRecord(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return {
    salt,
    hash: crypto.pbkdf2Sync(String(password), salt, 120000, 32, "sha256").toString("hex")
  };
}

class StoreValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

async function upsertCustomerPortalUser(client, input) {
  const existing = await client.query("SELECT * FROM users WHERE customer_id = $1 AND role = 'customer' LIMIT 1", [
    input.customerId
  ]);

  if (existing.rowCount === 0) {
    if (!input.email || !input.password) {
      return null;
    }
    return insertUser(client, {
      email: input.email,
      password: input.password,
      role: "customer",
      customerId: input.customerId,
      status: input.status || "active"
    });
  }

  const current = existing.rows[0];
  const nextEmail = input.email || current.email;
  const nextStatus = input.status || current.status;

  const passwordRecord = input.password ? createPasswordRecord(input.password) : null;
  const result = await client.query(
    `UPDATE users
     SET email = $2,
         status = $3,
         password_salt = COALESCE($4, password_salt),
         password_hash = COALESCE($5, password_hash)
     WHERE id = $1
     RETURNING *`,
    [
      current.id,
      nextEmail,
      nextStatus,
      passwordRecord?.salt || null,
      passwordRecord?.hash || null
    ]
  );
  return mapUserRow(result.rows[0]);
}

async function insertUser(client, input) {
  const record = createPasswordRecord(input.password);
  const result = await client.query(
    `INSERT INTO users
     (id, email, password_salt, password_hash, role, customer_id, status, created_at, last_login_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      input.id || createId("user"),
      String(input.email || "").trim(),
      record.salt,
      record.hash,
      input.role || "customer",
      input.customerId || null,
      input.status || "active",
      input.createdAt || nowIso(),
      input.lastLoginAt || null
    ]
  );
  return mapUserRow(result.rows[0]);
}

async function mapCustomerRowWithClient(client, customerRow) {
  const { rows } = await client.query(
    `SELECT c.*, u.email AS portal_email
     FROM customers c
     LEFT JOIN users u ON u.customer_id = c.id AND u.role = 'customer'
     WHERE c.id = $1`,
    [customerRow.id]
  );
  return rows[0] ? mapCustomerRow(rows[0]) : mapCustomerRow(customerRow);
}
