const { query } = require("../db/pool");

async function getProperty(id) {
  const result = await query(
    `SELECT p.*, u.fraud_risk_level AS owner_fraud_risk, u.kyc_verified AS owner_kyc_verified
     FROM properties p
     LEFT JOIN users u ON LOWER(u.wallet_address) = LOWER(p.owner_wallet)
     WHERE p.id::text = $1 OR p.apn = $1`,
    [id]
  );
  return result.rows[0] || null;
}

function mapProperty(p) {
  return {
    id: p.id,
    onchainPropertyId: p.onchain_property_id,
    ownerWallet: p.owner_wallet,
    addressLine1: p.address_line1,
    addressLine2: p.address_line2,
    city: p.city,
    state: p.state,
    zip: p.zip,
    county: p.county,
    apn: p.apn,
    legalDescription: p.legal_description,
    deedCid: p.deed_cid,
    occupancyStatus: p.occupancy_status,
    listingPaused: p.listing_paused,
    listPriceUsd: p.list_price_usd,
    ownerFraudRisk: p.owner_fraud_risk,
    ownerKycVerified: p.owner_kyc_verified,
    createdAt: p.created_at,
  };
}

/** Listing view safe for anonymous callers: no owner identity, deed, or risk flags. */
function mapPublicProperty(p) {
  return {
    id: p.id,
    onchainPropertyId: p.onchain_property_id,
    addressLine1: p.address_line1,
    addressLine2: p.address_line2,
    city: p.city,
    state: p.state,
    zip: p.zip,
    county: p.county,
    apn: p.apn,
    occupancyStatus: p.occupancy_status,
    listingPaused: p.listing_paused,
    listPriceUsd: p.list_price_usd,
    ownerKycVerified: p.owner_kyc_verified,
    createdAt: p.created_at,
  };
}

module.exports = { getProperty, mapProperty, mapPublicProperty };
