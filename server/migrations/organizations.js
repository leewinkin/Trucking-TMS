export const internalOrganizationName = "Platform";
export const internalLegacyRoles = new Set(["admin", "operations", "staff"]);

export function createOrganizationMigrationSummary() {
  return {
    created: 0,
    updated: 0,
    skipped: 0,
    unresolved: 0,
    details: {
      organizationsCreated: 0,
      membershipsCreated: 0,
      recordsBackfilled: 0,
      unresolvedRecords: []
    }
  };
}

export function customerOrganizationIdByLegacyCustomerId(organizations, legacyCustomerId) {
  const id = String(legacyCustomerId || "").trim();
  if (!id) {
    return "";
  }
  return (
    organizations.find(
      (organization) => organization?.type === "customer" && String(organization.legacyCustomerId || "") === id
    )?.id || ""
  );
}

export function migrateJsonOrganizations(db, { createId, nowIso }) {
  const summary = createOrganizationMigrationSummary();
  const now = nowIso();
  db.organizations = Array.isArray(db.organizations) ? db.organizations : [];
  db.organizationUsers = Array.isArray(db.organizationUsers) ? db.organizationUsers : [];
  db.agentCustomerRelationships = Array.isArray(db.agentCustomerRelationships) ? db.agentCustomerRelationships : [];

  const internalOrganizations = db.organizations.filter((organization) => organization.type === "internal");
  let internalOrganization = internalOrganizations[0] || null;
  if (!internalOrganization) {
    internalOrganization = {
      id: "org_internal",
      type: "internal",
      name: internalOrganizationName,
      status: "active",
      legacyCustomerId: null,
      billingEmail: null,
      phone: null,
      createdAt: now,
      updatedAt: now
    };
    db.organizations.push(internalOrganization);
    markCreated(summary, "organizationsCreated");
  } else if (internalOrganizations.length > 1) {
    markUnresolved(summary, "organizations", "internal", "Multiple internal organizations exist.");
  }

  for (const customer of db.customers || []) {
    const legacyCustomerId = String(customer?.id || "").trim();
    if (!legacyCustomerId) {
      markUnresolved(summary, "customers", "", "Customer record is missing an id.");
      continue;
    }

    const existing = db.organizations.find(
      (organization) => organization.type === "customer" && organization.legacyCustomerId === legacyCustomerId
    );
    if (!existing) {
      db.organizations.push({
        id: createId("org"),
        type: "customer",
        name: String(customer.companyName || legacyCustomerId).trim(),
        status: customer.status === "disabled" ? "disabled" : "active",
        legacyCustomerId,
        billingEmail: String(customer.billingEmail || "").trim() || null,
        phone: String(customer.companyPhone || "").trim() || null,
        createdAt: customer.createdAt || now,
        updatedAt: now
      });
      markCreated(summary, "organizationsCreated");
      continue;
    }

    let changed = false;
    const next = {
      name: String(customer.companyName || existing.name || legacyCustomerId).trim(),
      status: customer.status === "disabled" ? "disabled" : "active",
      billingEmail: String(customer.billingEmail || "").trim() || null,
      phone: String(customer.companyPhone || "").trim() || null
    };
    for (const [key, value] of Object.entries(next)) {
      if (existing[key] !== value) {
        existing[key] = value;
        changed = true;
      }
    }
    if (changed) {
      existing.updatedAt = now;
      markUpdated(summary);
    } else {
      markSkipped(summary);
    }
  }

  for (const user of db.users || []) {
    const target = organizationTargetForLegacyUser(user, db.organizations, internalOrganization);
    if (!target) {
      markUnresolved(summary, "users", user?.id, "User cannot be mapped to an organization.");
      continue;
    }

    const activeMemberships = db.organizationUsers.filter(
      (membership) => membership.userId === user.id && membership.status === "active"
    );
    const matching = activeMemberships.find((membership) => membership.organizationId === target.organizationId);
    if (activeMemberships.length > 1) {
      markUnresolved(summary, "organizationUsers", user.id, "User has multiple active organization memberships.");
      continue;
    }
    if (activeMemberships.length === 1 && !matching) {
      markUnresolved(summary, "organizationUsers", user.id, "User already has an active membership in another organization.");
      continue;
    }

    if (!matching) {
      db.organizationUsers.push({
        id: createId("orguser"),
        organizationId: target.organizationId,
        userId: user.id,
        role: target.role,
        status: user.status === "disabled" ? "disabled" : "active",
        createdAt: now,
        updatedAt: now
      });
      markCreated(summary, "membershipsCreated");
      continue;
    }

    let changed = false;
    const nextStatus = user.status === "disabled" ? "disabled" : "active";
    if (matching.role !== target.role) {
      matching.role = target.role;
      changed = true;
    }
    if (matching.status !== nextStatus) {
      matching.status = nextStatus;
      changed = true;
    }
    if (changed) {
      matching.updatedAt = now;
      markUpdated(summary);
    } else {
      markSkipped(summary);
    }
  }

  backfillJsonRecords(db.quotes || [], db.organizations, summary, "quotes", ["customerOrganizationId", "agentOrganizationId", "createdByUserId", "createdByOrganizationId"]);
  backfillJsonRecords(db.shipments || [], db.organizations, summary, "shipments", ["customerOrganizationId", "agentOrganizationId", "createdByUserId", "createdByOrganizationId"]);
  backfillJsonRecords(db.invoices || [], db.organizations, summary, "invoices", ["customerOrganizationId", "agentOrganizationId"]);

  return { db, summary };
}

export function organizationTargetForLegacyUser(user, organizations, internalOrganization) {
  if (!user?.id) {
    return null;
  }
  if (internalLegacyRoles.has(user.role)) {
    return {
      organizationId: internalOrganization?.id || "",
      organizationType: "internal",
      role: user.role
    };
  }
  if (user.role === "customer") {
    const organizationId = customerOrganizationIdByLegacyCustomerId(organizations, user.customerId);
    if (!organizationId) {
      return null;
    }
    return {
      organizationId,
      organizationType: "customer",
      role: "customer_admin"
    };
  }
  return null;
}

function backfillJsonRecords(records, organizations, summary, collectionName, fields) {
  for (const record of records) {
    const organizationId = customerOrganizationIdByLegacyCustomerId(organizations, record?.customerId);
    if (!organizationId) {
      markUnresolved(summary, collectionName, record?.id || record?.invoiceNumber || "", "Record has missing or invalid customer ownership.");
      continue;
    }

    let changed = false;
    if (!record.customerOrganizationId) {
      record.customerOrganizationId = organizationId;
      changed = true;
    }
    for (const field of fields) {
      if (!Object.prototype.hasOwnProperty.call(record, field)) {
        record[field] = null;
        changed = true;
      }
    }
    if (changed) {
      markUpdated(summary, "recordsBackfilled");
    } else {
      markSkipped(summary);
    }
  }
}

function markCreated(summary, detailKey) {
  summary.created += 1;
  if (detailKey) {
    summary.details[detailKey] += 1;
  }
}

function markUpdated(summary, detailKey = null) {
  summary.updated += 1;
  if (detailKey) {
    summary.details[detailKey] += 1;
  }
}

function markSkipped(summary) {
  summary.skipped += 1;
}

function markUnresolved(summary, collection, id, reason) {
  summary.unresolved += 1;
  summary.details.unresolvedRecords.push({
    collection,
    id: String(id || ""),
    reason
  });
}
