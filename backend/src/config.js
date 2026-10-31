/**
 * Startup configuration guard. Demo/test-only switches are refused in production.
 */
const DEMO_ONLY_FLAGS = ["ALLOW_HEADER_AUTH", "ALLOW_SIMULATED_SSO", "ALLOW_PRIVILEGED_BOOTSTRAP"];
const REQUIRED_IN_PRODUCTION = ["DATABASE_URL", "METRICS_TOKEN", "KYC_HASH_PEPPER"];

function isProduction(env = process.env) {
  return env.NODE_ENV === "production";
}

function configErrors(env = process.env) {
  if (!isProduction(env)) return [];
  const errors = [];
  for (const flag of DEMO_ONLY_FLAGS) {
    if (env[flag] === "true") errors.push(`${flag}=true is not allowed when NODE_ENV=production`);
  }
  for (const name of REQUIRED_IN_PRODUCTION) {
    if (!env[name]) errors.push(`${name} is required when NODE_ENV=production`);
  }
  return errors;
}

function assertSafeConfig(env = process.env) {
  const errors = configErrors(env);
  if (errors.length) {
    throw new Error(`Refusing to start with unsafe configuration:\n- ${errors.join("\n- ")}`);
  }
}

module.exports = { assertSafeConfig, configErrors, isProduction };
