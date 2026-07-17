export function buildPublicUser(user, organizationContext = null) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    customerId: user.customerId || null,
    status: user.status,
    organizationContext
  };
}
