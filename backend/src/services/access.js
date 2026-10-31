const { query } = require("../db/pool");
const { getProperty } = require("./properties");

const PRIVILEGED_ROLES = ["admin", "authority_officer", "title_officer"];

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

async function loadUser(req) {
  if (req.user) return req.user;
  if (!req.wallet) return null;
  const result = await query(`SELECT * FROM users WHERE LOWER(wallet_address) = $1`, [req.wallet]);
  req.user = result.rows[0] || null;
  return req.user;
}

function hasApprovedRole(user, roles) {
  if (!user || !user.role_approved) return false;
  return user.role === "admin" || roles.includes(user.role);
}

function isOwner(req, property) {
  return Boolean(req.wallet && property.owner_wallet?.toLowerCase() === req.wallet);
}

/**
 * Resolve how the caller may access a property: "owner", "privileged", or null.
 * Admin always counts as privileged.
 */
async function propertyAccessLevel(req, property, { owner = true, roles = PRIVILEGED_ROLES } = {}) {
  if (owner && isOwner(req, property)) return "owner";
  if (roles.length && hasApprovedRole(await loadUser(req), roles)) return "privileged";
  return null;
}

/**
 * Load a property and require the caller to be its owner and/or hold an approved role.
 * Throws 404 / 403 errors that the global error handler maps to responses.
 */
async function assertPropertyAccess(
  req,
  propertyOrId,
  { owner = true, roles = PRIVILEGED_ROLES, message = "Not authorized for this property" } = {}
) {
  const property =
    typeof propertyOrId === "object" && propertyOrId !== null
      ? propertyOrId
      : await getProperty(String(propertyOrId));
  if (!property) throw httpError(404, "Property not found");
  const level = await propertyAccessLevel(req, property, { owner, roles });
  if (!level) throw httpError(403, message);
  return { property, level };
}

module.exports = {
  PRIVILEGED_ROLES,
  assertPropertyAccess,
  propertyAccessLevel,
  hasApprovedRole,
  isOwner,
  loadUser,
  httpError,
};
