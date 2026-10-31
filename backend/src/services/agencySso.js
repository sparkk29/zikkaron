const crypto = require("crypto");
const { query } = require("../db/pool");
const { writeAudit, enqueueGovJob } = require("./audit");
const { createSession } = require("./siweAuth");

/**
 * Agency SSO stubs — OIDC/SAML adapters for future MoUs.
 * No live IdP calls in MVP. Simulated login binds an authority wallet session.
 */

async function listSsoAgencies() {
  const result = await query(
    `SELECT id, name, type, state, county_fips, status, sso_enabled, sso_protocol,
            sso_issuer, sso_client_id_placeholder, sso_metadata_url_placeholder,
            sso_redirect_uri_placeholder
     FROM agencies
     WHERE sso_enabled = TRUE
     ORDER BY name`
  );
  return result.rows.map(mapAgency);
}

async function getAgency(agencyId) {
  const result = await query(`SELECT * FROM agencies WHERE id = $1`, [agencyId]);
  return result.rows[0] || null;
}

async function startOidcStub(agencyId) {
  const agency = await getAgency(agencyId);
  if (!agency || !agency.sso_enabled) {
    throw Object.assign(new Error("Agency SSO not configured"), { status: 404 });
  }
  const state = crypto.randomBytes(16).toString("hex");
  await query(
    `INSERT INTO agency_sso_logins
       (agency_id, protocol, subject_placeholder, state_token, status, raw_claims)
     VALUES ($1, 'oidc', 'pending', $2, 'pending_redirect', $3)`,
    [
      agencyId,
      state,
      {
        note: "OIDC authorize URL is a placeholder — no live redirect in MVP",
        authorizeUrlPlaceholder: `${agency.sso_issuer}/authorize?client_id=${agency.sso_client_id_placeholder}&redirect_uri=${encodeURIComponent(agency.sso_redirect_uri_placeholder || "")}&state=${state}&response_type=code&scope=openid%20profile`,
      },
    ]
  );
  await enqueueGovJob("agency_mou_placeholder", {
    action: "oidc_start",
    agencyId,
    state,
  });
  return {
    protocol: "oidc",
    state,
    agency: mapAgency(agency),
    authorizeUrlPlaceholder: `${agency.sso_issuer}/authorize?client_id=${agency.sso_client_id_placeholder}&state=${state}`,
    notice:
      "Stub only. Live agency IdP redirect requires a signed MoU and real client credentials.",
  };
}

async function startSamlStub(agencyId) {
  const agency = await getAgency(agencyId);
  if (!agency || !agency.sso_enabled) {
    throw Object.assign(new Error("Agency SSO not configured"), { status: 404 });
  }
  const state = crypto.randomBytes(16).toString("hex");
  await query(
    `INSERT INTO agency_sso_logins
       (agency_id, protocol, subject_placeholder, state_token, status, raw_claims)
     VALUES ($1, 'saml', 'pending', $2, 'pending_redirect', $3)`,
    [
      agencyId,
      state,
      {
        note: "SAML AuthnRequest placeholder — no live ACS in MVP",
        metadataUrl: agency.sso_metadata_url_placeholder,
      },
    ]
  );
  return {
    protocol: "saml",
    state,
    agency: mapAgency(agency),
    metadataUrlPlaceholder: agency.sso_metadata_url_placeholder,
    notice: "SAML stub only. ACS and certificate exchange deferred to MoU pilots.",
  };
}

/**
 * Simulated agency SSO completion for demos/pilots without a live IdP.
 * Creates a SIWE-compatible session bound to the officer wallet + logs SSO claim.
 */
async function simulateAgencyLogin({
  agencyId,
  walletAddress,
  subjectPlaceholder,
  emailPlaceholder,
  displayName,
  protocol = "simulated",
}) {
  const agency = await getAgency(agencyId);
  if (!agency) {
    throw Object.assign(new Error("Agency not found"), { status: 404 });
  }
  const wallet = walletAddress.toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) {
    throw Object.assign(new Error("Valid wallet required to bind demo session"), { status: 400 });
  }

  // New wallets become pending officers (role_approved defaults to FALSE). Existing users
  // keep their role and approval; SSO must never grant or swap a role.
  const inserted = await query(
    `INSERT INTO users (wallet_address, role, display_name, agency_id, agency_name, badge_ref_placeholder,
                        role_approval_source)
     VALUES ($1, 'authority_officer', $2, $3, $4, $5, 'agency_sso_stub')
     ON CONFLICT (wallet_address) DO NOTHING
     RETURNING *`,
    [
      wallet,
      displayName || "Agency Officer (SSO stub)",
      agencyId,
      agency.name,
      subjectPlaceholder || "SSO-SUB-PLACEHOLDER",
    ]
  );
  let user = inserted.rows[0];
  if (!user) {
    const existing = await query(`SELECT * FROM users WHERE LOWER(wallet_address) = $1`, [wallet]);
    user = existing.rows[0];
    if (user.role !== "authority_officer") {
      throw Object.assign(
        new Error(
          `Wallet is already registered as ${user.role}; an administrator must assign authority_officer`
        ),
        { status: 409 }
      );
    }
    if (user.agency_id && user.agency_id !== agencyId) {
      throw Object.assign(new Error("Officer is linked to a different agency"), { status: 403 });
    }
    if (!user.agency_id) {
      const linked = await query(
        `UPDATE users SET agency_id = $1, agency_name = $2, updated_at = NOW()
         WHERE id = $3 RETURNING *`,
        [agencyId, agency.name, user.id]
      );
      user = linked.rows[0];
    }
  }

  const { token, session } = await createSession(wallet, "agency_sso_stub");

  const login = await query(
    `INSERT INTO agency_sso_logins
       (agency_id, protocol, subject_placeholder, email_placeholder, display_name,
        wallet_bound, session_id, status, raw_claims)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'simulated_ok', $8)
     RETURNING *`,
    [
      agencyId,
      protocol,
      subjectPlaceholder || `sub-${crypto.randomBytes(4).toString("hex")}`,
      emailPlaceholder || null,
      displayName || null,
      wallet,
      session.id,
      {
        simulated: true,
        agencyType: agency.type,
        notice: "Not a live IdP assertion. Handle under pilot policy only.",
      },
    ]
  );

  await writeAudit(wallet, "auth.agency_sso_simulated", "agency_sso_login", login.rows[0].id, {
    agencyId,
    protocol,
  });
  await enqueueGovJob("agency_mou_placeholder", {
    action: "sso_simulated_login",
    agencyId,
    loginId: login.rows[0].id,
  });

  return {
    token,
    wallet,
    expiresAt: session.expires_at,
    authMethod: "agency_sso_stub",
    user: {
      id: user.id,
      role: user.role,
      roleApproved: user.role_approved,
      agencyId,
      agencyName: agency.name,
    },
    login: {
      id: login.rows[0].id,
      protocol: login.rows[0].protocol,
      subjectPlaceholder: login.rows[0].subject_placeholder,
    },
    notice:
      "Simulated agency SSO only — not accredited LE access. Live OIDC/SAML requires MoU + IdP config.",
  };
}

function mapAgency(a) {
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    state: a.state,
    countyFips: a.county_fips,
    status: a.status,
    ssoEnabled: a.sso_enabled,
    ssoProtocol: a.sso_protocol,
    ssoIssuer: a.sso_issuer,
    ssoClientIdPlaceholder: a.sso_client_id_placeholder,
    ssoMetadataUrlPlaceholder: a.sso_metadata_url_placeholder,
    ssoRedirectUriPlaceholder: a.sso_redirect_uri_placeholder,
  };
}

module.exports = {
  listSsoAgencies,
  startOidcStub,
  startSamlStub,
  simulateAgencyLogin,
  getAgency,
};
