/**
 * Regenerate docs/screenshots/*.jpg from a local demo stack.
 *
 * Prerequisites (see docs/screenshots/README.md):
 *   - API seeded with `npm run seed:demo -w zikkaron-backend`
 *   - Frontend production build served at APP_URL
 *   - `npm install --no-save puppeteer-core` and a local Chrome (CHROME_PATH)
 *
 * Signs in with the public demo wallets via a real SIWE message, so the API must use
 * SIWE_URI=APP_URL and CORS_ORIGIN=APP_URL.
 */
const path = require("path");
const puppeteer = require("puppeteer-core");
const { Wallet, id } = require("ethers");
const { SiweMessage } = require("siwe");

const APP = process.env.APP_URL || "http://localhost:3000";
const API = process.env.API_URL || "http://localhost:4000";
const CHROME =
  process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = path.resolve(__dirname, "../docs/screenshots");
const WIDTH = 1440;
const HEIGHT = 900;

const settle = (ms = 1200) => new Promise((resolve) => setTimeout(resolve, ms));

async function signedSiwe(label) {
  const wallet = new Wallet(id(`zikkaron-demo-${label}`));
  const nonce = await (
    await fetch(`${API}/api/auth/nonce?address=${wallet.address.toLowerCase()}`)
  ).json();
  const message = new SiweMessage({
    domain: nonce.domain,
    address: wallet.address,
    statement: nonce.statement,
    uri: nonce.uri,
    version: "1",
    chainId: nonce.chainId,
    nonce: nonce.nonce,
  }).prepareMessage();
  return { message, signature: await wallet.signMessage(message) };
}

async function signIn(page, label) {
  const payload = await signedSiwe(label);
  await page.goto(`${APP}/legal`, { waitUntil: "networkidle0" });
  const status = await page.evaluate(
    async (api, body) => {
      await fetch(`${api}/api/auth/logout`, { method: "POST", credentials: "include" });
      const res = await fetch(`${api}/api/auth/verify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.status;
    },
    API,
    payload
  );
  if (status !== 200) throw new Error(`SIWE sign-in for ${label} failed with ${status}`);
}

async function shot(page, route, name, { fullPage = false, before } = {}) {
  await page.goto(`${APP}${route}`, { waitUntil: "networkidle0" });
  await settle();
  if (before) {
    await before(page);
    await settle(800);
  }
  if (fullPage) {
    // Grow the viewport to the content so the sticky banner and fixed background render once.
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewport({ width: WIDTH, height, deviceScaleFactor: 1 });
    await settle(600);
  }
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: "jpeg", quality: 82 });
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  console.log(`saved docs/screenshots/${name}.jpg`);
}

async function findProperty(apn) {
  const { properties } = await (await fetch(`${API}/api/properties?limit=100`)).json();
  const match = properties.find((p) => p.apn === apn);
  if (!match) throw new Error(`Demo property ${apn} not found; run npm run seed:demo first`);
  return match;
}

(async () => {
  const vista = await findProperty("163-27-041");
  const juniper = await findProperty("135-44-118");

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--hide-scrollbars"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });

  await shot(page, "/", "home");
  await shot(page, "/properties", "properties-list", { fullPage: true });
  await shot(page, `/properties/${vista.id}`, "property-public-view");

  await signIn(page, "owner");
  await shot(page, `/properties/${vista.id}`, "property-owner-view", { fullPage: true });
  await shot(page, "/buy-sell", "buy-sell", {
    before: (p) => p.type("form input:nth-of-type(1)", juniper.id),
  });

  await signIn(page, "officer");
  await shot(page, "/authority", "authority-console", {
    fullPage: true,
    before: async (p) => {
      await p.type('input[placeholder="100 Memorial Way or APN"]', vista.apn);
      await Promise.all([
        p.waitForResponse((r) => r.url().includes("/api/authority/search")),
        p.click('form.panel button[type="submit"]'),
      ]);
      await settle(500);
      await Promise.all([
        p.waitForResponse((r) => r.url().includes("/api/authority/case/")),
        p.click(".grid button.panel"),
      ]);
    },
  });

  await signIn(page, "admin");
  await shot(page, "/admin", "admin", { fullPage: true });

  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
