# Screenshots

Captured from a local demo stack (production frontend build at 1440 px wide) seeded with
`npm run seed:demo -w zikkaron-backend`. All names, addresses, APNs, CIDs, and wallets are
fictional demo data.

| File | Shows | Signed in as |
|------|-------|--------------|
| `home.jpg` | Landing page and the persistent partnership banner | — |
| `properties-list.jpg` | Memorial registration form and public listings | — |
| `property-public-view.jpg` | Anonymous property view: private sections withheld | — |
| `property-owner-view.jpg` | Owner view: incident timeline, evidence upload, legal placeholders, pending dispute | Owner |
| `buy-sell.jpg` | Testnet escrow form; submit stays disabled until both acknowledgments are checked | Owner |
| `authority-console.jpg` | APN search, case view, and Authority Case Pack export controls | Authority officer |
| `admin.jpg` | KYC verify, lookup adapter, `government_api_queue`, and audit log | Admin |

## Regenerating

The capture script signs in with the public demo wallets through a real SIWE message, so the API
must trust the frontend origin. Run everything locally only — the demo flags below are refused
when `NODE_ENV=production`.

```bash
# 1. Database
docker compose up -d
npm run migrate -w zikkaron-backend

# 2. API with local demo flags (demo admin wallet is derived from a public string)
ALLOW_HEADER_AUTH=true ALLOW_PRIVILEGED_BOOTSTRAP=true \
BOOTSTRAP_ADMIN_WALLET=0x4426b8aaf0946a4e55e30a7e968c380024acbd62 \
CORS_ORIGIN=http://localhost:3000 SIWE_URI=http://localhost:3000 \
npm run dev -w zikkaron-backend

# 3. Demo data (idempotent)
npm run seed:demo -w zikkaron-backend

# 4. Production frontend build
npm run build -w zikkaron-frontend
npm run start -w zikkaron-frontend

# 5. Capture (uses a local Chrome; puppeteer-core is not a project dependency)
npm install --no-save puppeteer-core
node scripts/capture-screenshots.js
```

Set `APP_URL`, `API_URL`, or `CHROME_PATH` if your ports or Chrome location differ. The demo
wallets are deterministic and public — never fund them or reuse them outside local demos.
