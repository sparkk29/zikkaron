/**
 * Government lookup adapter interface.
 * Implementations: simulated (default), http_placeholder (optional live URL).
 * Never claims official county authenticity — assistive cross-check only.
 */

/**
 * @typedef {Object} CountyRecordRequest
 * @property {string} [propertyId]
 * @property {string} apn
 * @property {string} state
 * @property {string} county
 * @property {string} [deedCid]
 * @property {string} [instrumentNumberPlaceholder]
 */

/**
 * @typedef {Object} AssessorApnRequest
 * @property {string} [propertyId]
 * @property {string} apn
 * @property {string} state
 * @property {string} county
 * @property {string} [addressLine1]
 * @property {string} [zip]
 */

/**
 * @typedef {Object} LookupResult
 * @property {string} adapter
 * @property {string} lookupType
 * @property {'matched'|'mismatch'|'not_found'|'simulated'|'error'|'unknown'} matchStatus
 * @property {object} request
 * @property {object} response
 */

class GovernmentLookupAdapter {
  /** @returns {string} */
  get name() {
    throw new Error("not implemented");
  }

  /** @param {CountyRecordRequest} _req @returns {Promise<LookupResult>} */
  async lookupCountyRecord(_req) {
    throw new Error("not implemented");
  }

  /** @param {AssessorApnRequest} _req @returns {Promise<LookupResult>} */
  async lookupAssessorApn(_req) {
    throw new Error("not implemented");
  }
}

class SimulatedLookupAdapter extends GovernmentLookupAdapter {
  get name() {
    return "simulated";
  }

  async lookupCountyRecord(req) {
    const hasInstrument = Boolean(req.instrumentNumberPlaceholder);
    return {
      adapter: this.name,
      lookupType: "county_record",
      matchStatus: "simulated",
      request: req,
      response: {
        simulated: true,
        found: true,
        instrumentNumberPlaceholder: req.instrumentNumberPlaceholder || "SIM-INST-0000",
        bookPagePlaceholder: "SIM-BOOK/1",
        deedCidPresented: req.deedCid || null,
        notes: hasInstrument
          ? "Simulated county index hit for presented instrument placeholder."
          : "Simulated county index — no live recorder API. Human verify required.",
        disclaimer:
          "Assistive memorial cross-check only. Not an official county record or seal.",
      },
    };
  }

  async lookupAssessorApn(req) {
    const apnOk = Boolean(req.apn && req.state && req.county);
    return {
      adapter: this.name,
      lookupType: "assessor_apn",
      matchStatus: apnOk ? "simulated" : "not_found",
      request: req,
      response: {
        simulated: true,
        apn: req.apn,
        parcelStatus: apnOk ? "active_placeholder" : "missing",
        situsAddressPlaceholder: req.addressLine1 || null,
        ownerNameRedacted: true,
        notes: "Simulated assessor APN binding check. Assessor remains source of truth.",
        disclaimer:
          "Assistive APN binding only. Not an official assessor extract.",
      },
    };
  }
}

/**
 * Optional HTTP adapter — calls COUNTY_LOOKUP_URL / ASSESSOR_LOOKUP_URL if set.
 * Expects JSON { matchStatus, ... } from partner middleware. Failures soft-fall to error.
 */
class HttpPlaceholderLookupAdapter extends GovernmentLookupAdapter {
  get name() {
    return "http_placeholder";
  }

  async #post(url, body, lookupType, req) {
    if (!url) {
      return {
        adapter: this.name,
        lookupType,
        matchStatus: "error",
        request: req,
        response: {
          error: "Lookup URL not configured",
          hint: "Set COUNTY_LOOKUP_URL or ASSESSOR_LOOKUP_URL for live partner middleware.",
        },
      };
    }
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.GOV_LOOKUP_API_KEY
            ? { Authorization: `Bearer ${process.env.GOV_LOOKUP_API_KEY}` }
            : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(Number(process.env.GOV_LOOKUP_TIMEOUT_MS || 8000)),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          adapter: this.name,
          lookupType,
          matchStatus: "error",
          request: req,
          response: { status: res.status, data },
        };
      }
      return {
        adapter: this.name,
        lookupType,
        matchStatus: data.matchStatus || "unknown",
        request: req,
        response: {
          ...data,
          disclaimer:
            data.disclaimer ||
            "Partner middleware response — assistive only; county/assessor remain authoritative.",
        },
      };
    } catch (err) {
      return {
        adapter: this.name,
        lookupType,
        matchStatus: "error",
        request: req,
        response: { error: err.message },
      };
    }
  }

  async lookupCountyRecord(req) {
    return this.#post(process.env.COUNTY_LOOKUP_URL, req, "county_record", req);
  }

  async lookupAssessorApn(req) {
    return this.#post(process.env.ASSESSOR_LOOKUP_URL, req, "assessor_apn", req);
  }
}

function getLookupAdapter() {
  const mode = (process.env.GOV_LOOKUP_ADAPTER || "simulated").toLowerCase();
  if (mode === "http" || mode === "http_placeholder") {
    return new HttpPlaceholderLookupAdapter();
  }
  return new SimulatedLookupAdapter();
}

module.exports = {
  GovernmentLookupAdapter,
  SimulatedLookupAdapter,
  HttpPlaceholderLookupAdapter,
  getLookupAdapter,
};
