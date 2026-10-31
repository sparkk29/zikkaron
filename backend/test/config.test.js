const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { configErrors, assertSafeConfig } = require("../src/config");

const SAFE_PRODUCTION = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://u:p@db/zikkaron",
  METRICS_TOKEN: "metrics-secret",
  KYC_HASH_PEPPER: "pepper-secret",
};

describe("startup configuration guard", () => {
  it("allows demo flags outside production", () => {
    assert.deepEqual(configErrors({ ALLOW_HEADER_AUTH: "true", ALLOW_SIMULATED_SSO: "true" }), []);
  });

  it("accepts a complete production configuration", () => {
    assert.doesNotThrow(() => assertSafeConfig(SAFE_PRODUCTION));
  });

  for (const flag of ["ALLOW_HEADER_AUTH", "ALLOW_SIMULATED_SSO", "ALLOW_PRIVILEGED_BOOTSTRAP"]) {
    it(`refuses ${flag}=true in production`, () => {
      assert.throws(() => assertSafeConfig({ ...SAFE_PRODUCTION, [flag]: "true" }), new RegExp(flag));
    });
  }

  for (const name of ["DATABASE_URL", "METRICS_TOKEN", "KYC_HASH_PEPPER"]) {
    it(`requires ${name} in production`, () => {
      const env = { ...SAFE_PRODUCTION };
      delete env[name];
      assert.throws(() => assertSafeConfig(env), new RegExp(name));
    });
  }
});
