const { ethers, network } = require("hardhat");
const { deployZikkaron } = require("./deployZikkaron");

/**
 * Deploy Zikkaron UUPS modules to the selected network.
 * Polygon Amoy (80002) first. Mainnet requires CONFIRM_MAINNET_DEPLOY=yes.
 * Set UPGRADE_ADMIN_ADDRESS to a multisig/timelock: the deployer then renounces all admin roles.
 */
async function main() {
  if (network.name === "polygon" && process.env.CONFIRM_MAINNET_DEPLOY !== "yes") {
    throw new Error("Mainnet deployment requires CONFIRM_MAINNET_DEPLOY=yes");
  }

  const [deployer] = await ethers.getSigners();
  console.log("Deploying Zikkaron with:", deployer.address);

  const upgradeAdmin = process.env.UPGRADE_ADMIN_ADDRESS;
  if (upgradeAdmin && !ethers.isAddress(upgradeAdmin)) {
    throw new Error("UPGRADE_ADMIN_ADDRESS is not a valid address");
  }
  if (!upgradeAdmin) {
    console.warn("UPGRADE_ADMIN_ADDRESS not set: the deployer key keeps upgrade authority.");
  }

  const { addresses } = await deployZikkaron({ deployer, upgradeAdmin, log: console.log });
  console.log(JSON.stringify(addresses, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
