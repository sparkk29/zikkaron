# zikkaron-backend

Express + PostgreSQL API for Zikkaron (US).

```bash
docker compose up -d
npm run dev -w zikkaron-backend
npm run test -w zikkaron-backend   # requires API running
```

Key routes:

- `GET /health` → `product: Zikkaron`, `country: US`
- `/api/users/*` KYC register / verify
- `/api/properties/*` memorials + simulated legal verify
- `/api/occupancy/*` occupants, events, disputes
- `/api/authority/*` search, case, exports, acknowledge
- `/api/deals/*` purchase deals
- `/api/admin/*` queue + audit

Auth: demo `x-wallet-address` header (spoofable — see docs/flaw.md).
