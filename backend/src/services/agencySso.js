const crypto = require("crypto");
const { query } = require("../db/pool");
const { writeAudit, enqueueGovJob } = require("./audit");

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

  // Ensure authority_officer user linked to agency
  const userUpsert = await query(
    `INSERT INTO users (wallet_address, role, display_name, agency_id, agency_name, badge_ref_placeholder)
     VALUES ($1, 'authority_officer', $2, $3, $4, $5)
     ON CONFLICT (wallet_address) DO UPDATE SET
       role = 'authority_officer',
       display_name = COALESCE(EXCLUDED.display_name, users.display_name),
       agency_id = EXCLUDED.agency_id,
       agency_name = EXCLUDED.agency_name,
       updated_at = NOW()
     RETURNING *`,
    [
      wallet,
      displayName || "Agency Officer (SSO stub)",
      agencyId,
      agency.name,
      subjectPlaceholder || "SSO-SUB-PLACEHOLDER",
    ]
  );

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const session = await query(
    `INSERT INTO sessions (wallet_address, token_hash, auth_method, expires_at)
     VALUES ($1, $2, 'agency_sso_stub', $3)
     RETURNING id, wallet_address, auth_method, expires_at`,
    [wallet, tokenHash, expiresAt]
  );

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
      session.rows[0].id,
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
    expiresAt: session.rows[0].expires_at,
    authMethod: "agency_sso_stub",
    user: {
      id: userUpsert.rows[0].id,
      role: userUpsert.rows[0].role,
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
