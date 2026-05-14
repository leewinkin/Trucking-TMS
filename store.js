import { existsSync } from "node:fs";
import crypto from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool, types } = pg;

types.setTypeParser(1700, (value) => (value === null ? null : Number(value)));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function createAppStore({ dbUrl, dataFile }) {
  if (dbUrl) {
    return createPostgresStore(dbUrl);
  }

  return createJsonStore(resolveDataFilePath(dataFile));
}

function resolveDataFilePath(value) {
  const filePath = String(value || ".local-db.json").trim();
  return path.isAbsolute(filePath) ? filePath : path.join(__dirname, filePath);
}

async function createPostgresStore(dbUrl) {
  const pool = new Pool({
    connectionString: dbUrl,
    max: 10
  });

  await pool.query("SELECT 1");
  await ensureSchema(pool);
  await seedPostgres(pool);

  return {
    kind: "postgres",
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
          await insertUser(client, {
            email: input.portalEmail,
            password,
            role: "customer",
            customerId: customer.id
          });
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
    async listQuotes() {
      const { rows } = await pool.query("SELECT * FROM quotes ORDER BY created_at DESC");
      return rows.map(mapQuoteRow);
    },
    async getQuote(id) {
      const { rows } = await pool.query("SELECT * FROM quotes WHERE id = $1", [id]);
      return rows[0] ? mapQuoteRow(rows[0]) : null;
    },
    async createQuote(quote) {
      const result = await pool.query(
        `INSERT INTO quotes
         (id, customer_id, customer_name, carrier_mode, carrier_modes, carrier, carrier_quote_id, reference_number, pickup, delivery, freight, pickup_ready_date, tariff_rule, rates, status, carrier_message, carrier_audit, raw_carrier_response, created_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, $15, $16, $17::jsonb, $18::jsonb, $19)
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
          quote.createdAt
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

        const shipmentResult = await client.query(
          `INSERT INTO shipments
           (id, customer_id, customer_name, quote_id, carrier, carrier_name, carrier_shipment_id, confirmation_number, reference_number, pickup, delivery, freight, carrier_cost, sell_price, margin, provider, service, status, pickup_date, carrier_shipment, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14, $15, $16, $17, $18, $19::jsonb, $20::jsonb, $21)
           RETURNING *`,
          [
            payload.shipment.id,
            payload.shipment.customerId,
            payload.shipment.customerName,
            payload.quoteId,
            payload.shipment.carrier,
            payload.shipment.carrierName || "",
            payload.shipment.carrierShipmentId,
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
            payload.shipment.createdAt
          ]
        );

        const invoiceResult = await client.query(
          `INSERT INTO invoices
           (shipment_id, customer_id, customer_name, reference_number, amount, status, issued_at, due_at, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
            payload.invoice.createdAt
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
    `CREATE TABLE IF NOT EXISTS invoices (
      id bigserial PRIMARY KEY,
      shipment_id text NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
      customer_id text NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      customer_name text NOT NULL,
      invoice_number text NOT NULL UNIQUE DEFAULT ('INV-' || lpad(nextval('invoice_number_seq')::text, 5, '0')),
      reference_number text NOT NULL DEFAULT '',
      amount numeric NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'draft',
      issued_at timestamptz,
      due_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    "ALTER TABLE quotes ADD COLUMN IF NOT EXISTS reference_number text NOT NULL DEFAULT ''",
    "ALTER TABLE quotes ADD COLUMN IF NOT EXISTS carrier_modes jsonb NOT NULL DEFAULT '[]'::jsonb",
    "ALTER TABLE quotes ADD COLUMN IF NOT EXISTS carrier_message text NOT NULL DEFAULT ''",
    "ALTER TABLE quotes ADD COLUMN IF NOT EXISTS carrier_audit jsonb NOT NULL DEFAULT '[]'::jsonb",
    "ALTER TABLE shipments ADD COLUMN IF NOT EXISTS reference_number text NOT NULL DEFAULT ''",
    "ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier_name text NOT NULL DEFAULT ''",
    "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS reference_number text NOT NULL DEFAULT ''",
    "CREATE INDEX IF NOT EXISTS idx_tariff_rules_customer_id ON tariff_rules(customer_id)",
    "CREATE INDEX IF NOT EXISTS idx_quotes_customer_id ON quotes(customer_id)",
    "CREATE INDEX IF NOT EXISTS idx_shipments_customer_id ON shipments(customer_id)",
    "CREATE INDEX IF NOT EXISTS idx_shipments_quote_id ON shipments(quote_id)",
    "CREATE INDEX IF NOT EXISTS idx_tracking_events_shipment_id ON tracking_events(shipment_id)",
    "CREATE INDEX IF NOT EXISTS idx_invoices_shipment_id ON invoices(shipment_id)",
    "CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash)",
    "CREATE INDEX IF NOT EXISTS idx_users_customer_id ON users(customer_id)"
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

function createJsonStore(filePath) {
  return {
    kind: "json",
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
      db.tariffRules.push(defaultTariffRule(customer.id));
      if (String(input.portalEmail || "").trim()) {
        const password = String(input.portalPassword || "").trim();
        if (!password) {
          throw new Error("PORTAL_PASSWORD_REQUIRED");
        }
        db.users.push(createUserRecord({
          email: input.portalEmail,
          password,
          role: "customer",
          customerId: customer.id
        }));
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
      db.quotes.push(quote);
      await writeJsonDb(filePath, db);
      return quote;
    },
    async listShipments() {
      const db = await readJsonDb(filePath);
      return db.shipments.slice().reverse();
    },
    async getShipment(id) {
      const db = await readJsonDb(filePath);
      return db.shipments.find((item) => item.id === id) || null;
    },
    async createShipment(payload) {
      const db = await readJsonDb(filePath);
      const shipment = payload.shipment;
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
        createdAt: payload.invoice.createdAt
      };

      db.shipments.push(shipment);
      db.invoices.push(invoice);
      const quote = db.quotes.find((item) => item.id === payload.quoteId);
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
    invoices: [],
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
    rawCarrierResponse: row.raw_carrier_response,
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
    createdAt: row.created_at
  };
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
    createdAt: row.created_at
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

function normalizeJsonDb(db) {
  return {
    customers: Array.isArray(db.customers) ? db.customers.map(normalizeCustomerRecord) : [],
    tariffRules: Array.isArray(db.tariffRules) ? db.tariffRules : [],
    users: Array.isArray(db.users) ? db.users : [],
    sessions: Array.isArray(db.sessions) ? db.sessions : [],
    quotes: Array.isArray(db.quotes) ? db.quotes : [],
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
