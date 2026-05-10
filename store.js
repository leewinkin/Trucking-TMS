import { existsSync } from "node:fs";
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
      const { rows } = await pool.query("SELECT * FROM customers ORDER BY created_at ASC");
      return rows.map(mapCustomerRow);
    },
    async getCustomer(id) {
      const { rows } = await pool.query("SELECT * FROM customers WHERE id = $1", [id]);
      return rows[0] ? mapCustomerRow(rows[0]) : null;
    },
    async createCustomer(input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const customerResult = await client.query(
          `INSERT INTO customers (id, company_name, billing_email, payment_terms, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [
            createId("cust"),
            String(input.companyName || "").trim(),
            String(input.billingEmail || "").trim(),
            String(input.paymentTerms || "Net 15").trim(),
            "active",
            nowIso()
          ]
        );

        const customer = customerResult.rows[0];
        await client.query(
          `INSERT INTO tariff_rules
           (id, customer_id, rule_type, fixed_amount, markup_percentage, minimum_margin, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            createId("tariff"),
            customer.id,
            "percentage",
            50,
            15,
            75,
            "active",
            nowIso()
          ]
        );

        await client.query("COMMIT");
        return mapCustomerRow(customer);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
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
           (id, customer_id, rule_type, fixed_amount, markup_percentage, minimum_margin, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [
            createId("tariff"),
            input.customerId,
            normalizeRuleType(input.ruleType),
            toMoney(input.fixedAmount),
            toNumber(input.markupPercentage),
            toMoney(input.minimumMargin),
            "active",
            nowIso()
          ]
        );
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
         (id, customer_id, customer_name, carrier_mode, carrier, carrier_quote_id, pickup, delivery, freight, pickup_ready_date, tariff_rule, rates, status, raw_carrier_response, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14::jsonb, $15)
         RETURNING *`,
        [
          quote.id,
          quote.customerId,
          quote.customerName,
          quote.carrierMode,
          quote.carrier,
          quote.carrierQuoteId,
          JSON.stringify(quote.pickup),
          JSON.stringify(quote.delivery),
          JSON.stringify(quote.freight),
          JSON.stringify(quote.pickupReadyDate),
          JSON.stringify(quote.tariffRule),
          JSON.stringify(quote.rates),
          quote.status,
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
           (id, customer_id, customer_name, quote_id, carrier, carrier_shipment_id, confirmation_number, pickup, delivery, freight, carrier_cost, sell_price, margin, provider, service, status, pickup_date, carrier_shipment, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11, $12, $13, $14, $15, $16, $17::jsonb, $18::jsonb, $19)
           RETURNING *`,
          [
            payload.shipment.id,
            payload.shipment.customerId,
            payload.shipment.customerName,
            payload.quoteId,
            payload.shipment.carrier,
            payload.shipment.carrierShipmentId,
            payload.shipment.confirmationNumber,
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
           (shipment_id, customer_id, customer_name, amount, status, issued_at, due_at, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [
            shipmentResult.rows[0].id,
            payload.shipment.customerId,
            payload.shipment.customerName,
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
      status text NOT NULL DEFAULT 'active',
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS tariff_rules (
      id text PRIMARY KEY,
      customer_id text NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      rule_type text NOT NULL,
      fixed_amount numeric NOT NULL DEFAULT 0,
      markup_percentage numeric NOT NULL DEFAULT 0,
      minimum_margin numeric NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'active',
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS quotes (
      id text PRIMARY KEY,
      customer_id text NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      customer_name text NOT NULL,
      carrier_mode text NOT NULL,
      carrier text NOT NULL,
      carrier_quote_id text NOT NULL,
      pickup jsonb NOT NULL,
      delivery jsonb NOT NULL,
      freight jsonb NOT NULL,
      pickup_ready_date jsonb NOT NULL,
      tariff_rule jsonb NOT NULL,
      rates jsonb NOT NULL,
      status text NOT NULL DEFAULT 'quoted',
      raw_carrier_response jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS shipments (
      id text PRIMARY KEY,
      customer_id text NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      customer_name text NOT NULL,
      quote_id text NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      carrier text NOT NULL,
      carrier_shipment_id text NOT NULL,
      confirmation_number text NOT NULL,
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
      amount numeric NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'draft',
      issued_at timestamptz,
      due_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    "CREATE INDEX IF NOT EXISTS idx_tariff_rules_customer_id ON tariff_rules(customer_id)",
    "CREATE INDEX IF NOT EXISTS idx_quotes_customer_id ON quotes(customer_id)",
    "CREATE INDEX IF NOT EXISTS idx_shipments_customer_id ON shipments(customer_id)",
    "CREATE INDEX IF NOT EXISTS idx_shipments_quote_id ON shipments(quote_id)",
    "CREATE INDEX IF NOT EXISTS idx_tracking_events_shipment_id ON tracking_events(shipment_id)",
    "CREATE INDEX IF NOT EXISTS idx_invoices_shipment_id ON invoices(shipment_id)"
  ];

  for (const statement of statements) {
    await pool.query(statement);
  }
}

async function seedPostgres(pool) {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM customers");
  if (rows[0].count > 0) {
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
       (id, customer_id, rule_type, fixed_amount, markup_percentage, minimum_margin, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      ["tariff_demo", "cust_demo", "percentage", 50, 15, 75, "active", now]
    );
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
      return db.customers;
    },
    async getCustomer(id) {
      const db = await readJsonDb(filePath);
      return db.customers.find((item) => item.id === id) || null;
    },
    async createCustomer(input) {
      const db = await readJsonDb(filePath);
      const customer = {
        id: createId("cust"),
        companyName: String(input.companyName || "").trim(),
        billingEmail: String(input.billingEmail || "").trim(),
        paymentTerms: String(input.paymentTerms || "Net 15").trim(),
        status: "active",
        createdAt: nowIso()
      };
      db.customers.push(customer);
      db.tariffRules.push(defaultTariffRule(customer.id));
      await writeJsonDb(filePath, db);
      return customer;
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
        minimumMargin: toMoney(input.minimumMargin),
        status: "active",
        createdAt: nowIso()
      };
      db.tariffRules.push(tariffRule);
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
  return JSON.parse(raw);
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
        minimumMargin: 75,
        status: "active",
        createdAt: now
      }
    ],
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
    minimumMargin: 75,
    status: "active",
    createdAt: nowIso()
  };
}

function normalizeRuleType(ruleType) {
  return ["fixed", "percentage", "hybrid"].includes(ruleType) ? ruleType : "percentage";
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
  return {
    id: row.id,
    companyName: row.company_name,
    billingEmail: row.billing_email,
    paymentTerms: row.payment_terms,
    status: row.status,
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
    minimumMargin: row.minimum_margin,
    status: row.status,
    createdAt: row.created_at
  };
}

function mapQuoteRow(row) {
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    carrierMode: row.carrier_mode,
    carrier: row.carrier,
    carrierQuoteId: row.carrier_quote_id,
    pickup: row.pickup,
    delivery: row.delivery,
    freight: row.freight,
    pickupReadyDate: row.pickup_ready_date,
    tariffRule: row.tariff_rule,
    rates: row.rates,
    status: row.status,
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
    carrierShipmentId: row.carrier_shipment_id,
    confirmationNumber: row.confirmation_number,
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
