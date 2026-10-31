# zikkaron-contracts

Solidity 0.8.24 Hardhat modules for Zikkaron memorial anchors on **Polygon Amoy (80002)**.

```bash
npm run compile -w zikkaron-contracts
npm run test -w zikkaron-contracts
npm run deploy:local -w zikkaron-contracts
```

The deploy script (`scripts/deploy.js`, logic in `scripts/deployZikkaron.js`) uses an ERC-1967
proxy for every UUPS module, binds the registry-gated modules to `PropertyRegistry`, and prints
both proxy and implementation addresses. Set `UPGRADE_ADMIN_ADDRESS` to a multisig or timelock
before a shared-network deployment: it receives `ADMIN` and `DEFAULT_ADMIN_ROLE`, and the
deployer renounces both. Mainnet requires `CONFIRM_MAINNET_DEPLOY=yes`.

Rental, ownership-transfer, escrow, and possession writes require the `PropertyRegistry`
claimant (`PropertyOwnerGated`, ERC-7201 namespaced storage). Escrow buyers can `claimRefund`
after the refund timeout. Slither runs in CI.

Core property, possession, and escrow writes have admin-controlled emergency pause switches.
The implementation contracts disable direct initialization; initialization occurs through the
proxy.

See root README and `docs/SYSTEM_DESIGN.md`.
