import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createAppStore } from "../store.js";

const tempDir = await mkdtemp(path.join(tmpdir(), "tms-internal-users-"));
const dbPath = path.join(tempDir, "db.json");
const port = 4900 + Math.floor(Math.random() * 500);
let serverProcess = null;

try {
  await writeFile(dbPath, JSON.stringify(seedDb(), null, 2));
  serverProcess = await startServer(port, dbPath);

  const admin = createClient(port);
  await admin.login("admin@local.test", "Admin123!");

  const initialList = await admin.request("/api/internal-users");
  assert.equal(initialList.status, 200);
  assert.deepEqual(initialList.body.users.map((user) => user.role), ["admin", "operations", "staff"]);
  assertSafeUsers(initialList.body.users);

  const createdStaff = await admin.request("/api/internal-users", {
    method: "POST",
    body: { email: "new.staff@example.com", password: "Staff123!", role: "staff" }
  });
  assert.equal(createdStaff.status, 201);
  assert.equal(createdStaff.body.user.role, "staff");
  assertSafeUsers([createdStaff.body.user]);

  const createdSubAdmin = await admin.request("/api/internal-users", {
    method: "POST",
    body: { email: "new.ops@example.com", password: "Ops123!", role: "operations" }
  });
  assert.equal(createdSubAdmin.status, 201);
  assert.equal(createdSubAdmin.body.user.role, "operations");

  const promoted = await admin.request(`/api/internal-users/${createdStaff.body.user.id}`, {
    method: "PATCH",
    body: { role: "operations", status: "active" }
  });
  assert.equal(promoted.status, 200);
  assert.equal(promoted.body.user.role, "operations");

  const duplicateEmail = await admin.request("/api/internal-users", {
    method: "POST",
    body: { email: "NEW.OPS@example.com", password: "Ops123!", role: "staff" }
  });
  assert.equal(duplicateEmail.status, 409);

  const customerConvert = await admin.request("/api/internal-users/user_customer", {
    method: "PATCH",
    body: { role: "staff", status: "active" }
  });
  assert.equal(customerConvert.status, 404);

  const selfDisable = await admin.request("/api/internal-users/user_admin", {
    method: "PATCH",
    body: { status: "disabled" }
  });
  assert.equal(selfDisable.status, 403);

  const ops = createClient(port);
  await ops.login("ops@example.com", "Ops123!");
  const opsList = await ops.request("/api/internal-users");
  assert.equal(opsList.status, 200);
  assert.deepEqual(opsList.body.users.map((user) => user.role), ["staff"]);

  const opsCreateStaff = await ops.request("/api/internal-users", {
    method: "POST",
    body: { email: "ops.staff@example.com", password: "Staff123!", role: "staff" }
  });
  assert.equal(opsCreateStaff.status, 201);
  const opsCreateAdmin = await ops.request("/api/internal-users", {
    method: "POST",
    body: { email: "bad.admin@example.com", password: "Admin123!", role: "admin" }
  });
  assert.equal(opsCreateAdmin.status, 403);
  const opsCreateSubAdmin = await ops.request("/api/internal-users", {
    method: "POST",
    body: { email: "bad.ops@example.com", password: "Ops123!", role: "operations" }
  });
  assert.equal(opsCreateSubAdmin.status, 403);
  const opsEditAdmin = await ops.request("/api/internal-users/user_admin", {
    method: "PATCH",
    body: { status: "disabled" }
  });
  assert.equal(opsEditAdmin.status, 403);
  const opsEditSubAdmin = await ops.request("/api/internal-users/user_ops", {
    method: "PATCH",
    body: { status: "disabled" }
  });
  assert.equal(opsEditSubAdmin.status, 403);

  const activeStaff = createClient(port);
  await activeStaff.login("staff@example.com", "Staff123!");
  const disableStaff = await ops.request("/api/internal-users/user_staff", {
    method: "PATCH",
    body: { status: "disabled" }
  });
  assert.equal(disableStaff.status, 200);
  const invalidatedStaffSession = await activeStaff.request("/api/me");
  assert.equal(invalidatedStaffSession.status, 401);

  const resetTarget = await admin.request("/api/internal-users", {
    method: "POST",
    body: { email: "reset.staff@example.com", password: "Old123!", role: "staff" }
  });
  assert.equal(resetTarget.status, 201);
  const resetStaffClient = createClient(port);
  await resetStaffClient.login("reset.staff@example.com", "Old123!");
  const reset = await ops.request(`/api/internal-users/${resetTarget.body.user.id}/reset-password`, {
    method: "POST",
    body: { password: "New123!" }
  });
  assert.equal(reset.status, 200);
  const resetOldSession = await resetStaffClient.request("/api/me");
  assert.equal(resetOldSession.status, 401);

  const staff = createClient(port);
  await staff.login("ops.staff@example.com", "Staff123!");
  assert.equal((await staff.request("/api/internal-users")).status, 403);
  assert.equal((await staff.request("/api/internal-users", { method: "POST", body: { email: "x@example.com", password: "x", role: "staff" } })).status, 403);
  assert.equal((await staff.request(`/api/internal-users/${opsCreateStaff.body.user.id}`, { method: "PATCH", body: { status: "disabled" } })).status, 403);
  assert.equal((await staff.request(`/api/internal-users/${opsCreateStaff.body.user.id}/reset-password`, { method: "POST", body: { password: "x" } })).status, 403);

  const customer = createClient(port);
  await customer.login("customer@local.test", "Customer123!");
  assert.equal((await customer.request("/api/internal-users")).status, 403);
  assert.equal((await customer.request("/api/internal-users", { method: "POST", body: { email: "x2@example.com", password: "x", role: "staff" } })).status, 403);

  const db = JSON.parse(await readFile(dbPath, "utf8"));
  const syncedUser = db.users.find((user) => user.id === opsCreateStaff.body.user.id);
  const syncedMembership = db.organizationUsers.find((membership) => membership.userId === opsCreateStaff.body.user.id);
  assert.equal(syncedUser.role, syncedMembership.role);
  assert.equal(syncedUser.status, syncedMembership.status);
  assert.equal(syncedUser.customerId, null);

  const storeDbPath = path.join(tempDir, "store-db.json");
  await writeFile(storeDbPath, JSON.stringify(seedDb(), null, 2));
  const store = await createAppStore({ dataFile: storeDbPath, dbUrl: "" });
  await assert.rejects(
    () => store.updateInternalUser("user_admin", { role: "staff" }),
    /final active Admin/i
  );

  const appSource = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const htmlSource = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(htmlSource, /data-view="users"[\s\S]*data-i18n="User Management"/, "User Management nav should exist");
  assert.match(appSource, /function canManageInternalUsers\(\)[\s\S]*admin[\s\S]*operations/, "Admin and Sub-admin visibility guard should exist");
  assert.match(appSource, /usersNavButton[\s\S]*canManageInternalUsers\(\)/, "User Management nav should be role-aware");
  assert.match(appSource, /state\.user\?\.role === "admin" \? \["admin", "operations", "staff"\] : \["staff"\]/, "Sub-admin role choices should be fixed to Staff");
  assert.doesNotMatch(appSource, /portal[\s\S]{0,120}admin[\s\S]{0,120}operations/, "Customer portal form should not expose internal roles");

  console.log("internal user management tests passed");
} finally {
  if (serverProcess) {
    serverProcess.kill("SIGTERM");
  }
  await rm(tempDir, { recursive: true, force: true });
}

function assertSafeUsers(users) {
  for (const user of users) {
    const text = JSON.stringify(user);
    assert.doesNotMatch(text, /password_hash|password_salt|passwordHash|passwordSalt|token_hash|session/i);
    assert.deepEqual(Object.keys(user).sort(), ["createdAt", "email", "id", "role", "status"].sort());
  }
}

function createClient(portNumber) {
  let cookie = "";
  return {
    async login(email, password) {
      const response = await this.request("/api/login", {
        method: "POST",
        body: { email, password }
      });
      assert.equal(response.status, 200, `login failed for ${email}: ${JSON.stringify(response.body)}`);
      return response;
    },
    async request(pathname, options = {}) {
      const headers = {};
      if (options.body) {
        headers["Content-Type"] = "application/json";
      }
      if (cookie) {
        headers.Cookie = cookie;
      }
      const response = await fetch(`http://127.0.0.1:${portNumber}${pathname}`, {
        method: options.method || "GET",
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
      });
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) {
        cookie = setCookie.split(";")[0];
      }
      let body = {};
      try {
        body = await response.json();
      } catch {
        body = {};
      }
      return { status: response.status, body };
    }
  };
}

async function startServer(portNumber, dataFilePath) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      PORT: String(portNumber),
      FORCE_LOCAL_JSON_STORE: "1",
      DATA_FILE_PATH: dataFilePath,
      APP_SECRET: "internal-user-management-test-secret"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stderr.on("data", (chunk) => process.stderr.write(chunk));

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for test server")), 10000);
    child.once("exit", (code) => reject(new Error(`Test server exited early with ${code}`)));
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("Trucking TMS prototype running")) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });

  return child;
}

function seedDb() {
  const now = new Date().toISOString();
  return {
    customers: [
      {
        id: "cust_a",
        companyName: "Customer A",
        billingEmail: "customer-a@example.com",
        paymentTerms: "Net 15",
        allowedCarrierModes: ["demo"],
        allowedBooking: true,
        allowedBookingCarrierModes: ["demo"],
        status: "active",
        createdAt: now
      }
    ],
    tariffRules: [],
    users: [
      userRecord("user_admin", "admin@local.test", "Admin123!", "admin", null, "active"),
      userRecord("user_ops", "ops@example.com", "Ops123!", "operations", null, "active"),
      userRecord("user_staff", "staff@example.com", "Staff123!", "staff", null, "active"),
      userRecord("user_customer", "customer@local.test", "Customer123!", "customer", "cust_a", "active")
    ],
    sessions: [],
    organizations: [
      {
        id: "org_internal",
        type: "internal",
        name: "Platform",
        status: "active",
        legacyCustomerId: null,
        createdAt: now,
        updatedAt: now
      },
      {
        id: "org_customer",
        type: "customer",
        name: "Customer A",
        status: "active",
        legacyCustomerId: "cust_a",
        createdAt: now,
        updatedAt: now
      }
    ],
    organizationUsers: [
      membership("orguser_admin", "org_internal", "user_admin", "admin", "active"),
      membership("orguser_ops", "org_internal", "user_ops", "operations", "active"),
      membership("orguser_staff", "org_internal", "user_staff", "staff", "active"),
      membership("orguser_customer", "org_customer", "user_customer", "customer_admin", "active")
    ],
    agentCustomerRelationships: [],
    addressBookEntries: [],
    carrierPreferences: [],
    quotes: [],
    shipments: [],
    invoices: [],
    trackingEvents: []
  };
}

function userRecord(id, email, password, role, customerId, status) {
  const record = passwordRecord(password);
  return {
    id,
    email,
    role,
    customerId,
    status,
    passwordSalt: record.salt,
    passwordHash: record.hash,
    createdAt: new Date().toISOString(),
    lastLoginAt: null
  };
}

function passwordRecord(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return {
    salt,
    hash: crypto.pbkdf2Sync(String(password), salt, 120000, 32, "sha256").toString("hex")
  };
}

function membership(id, organizationId, userId, role, status) {
  return {
    id,
    organizationId,
    userId,
    role,
    status,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}
