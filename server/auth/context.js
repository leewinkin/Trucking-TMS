import { internalLegacyRoles } from "../migrations/organizations.js";

export function resolveOrganizationContextForUser(user, memberships = [], organizations = []) {
  const activeMemberships = memberships.filter((membership) => membership?.status === "active");
  if (activeMemberships.length === 1) {
    const membership = activeMemberships[0];
    const organization = organizations.find((item) => item.id === membership.organizationId) || null;
    if (organization) {
      return contextFromMembership(membership, organization);
    }
  }

  return contextFromLegacyUser(user, organizations);
}

export function contextFromMembership(membership, organization) {
  const organizationType = organization?.type || null;
  return {
    organizationId: organization?.id || null,
    organizationType,
    role: membership?.role || null,
    customerOrganizationId: organizationType === "customer" ? organization.id : null,
    agentOrganizationId: organizationType === "agent" ? organization.id : null,
    source: "membership"
  };
}

export function contextFromLegacyUser(user, organizations = []) {
  if (!user) {
    return null;
  }

  if (internalLegacyRoles.has(user.role)) {
    const internalOrganization = organizations.find((organization) => organization.type === "internal") || null;
    return {
      organizationId: internalOrganization?.id || null,
      organizationType: "internal",
      role: user.role,
      customerOrganizationId: null,
      agentOrganizationId: null,
      source: "legacy"
    };
  }

  if (user.role === "customer") {
    const customerOrganization =
      organizations.find(
        (organization) => organization.type === "customer" && organization.legacyCustomerId === user.customerId
      ) || null;
    return {
      organizationId: customerOrganization?.id || null,
      organizationType: "customer",
      role: "customer_admin",
      customerOrganizationId: customerOrganization?.id || null,
      agentOrganizationId: null,
      source: "legacy"
    };
  }

  return {
    organizationId: null,
    organizationType: null,
    role: user.role || null,
    customerOrganizationId: null,
    agentOrganizationId: null,
    source: "legacy"
  };
}
