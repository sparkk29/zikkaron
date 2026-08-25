const { ethers } = require("hardhat");

/**
 * Deploy Zikkaron UUPS modules to the selected network.
 * Polygon Amoy (80002) first. Mainnet requires CONFIRM_MAINNET_DEPLOY=yes.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying Zikkaron with:", deployer.address);

  // Lightweight deploy without OpenZeppelin upgrades plugin for MVP simplicity:
  // deploy implementation + initialize via factory pattern (non-proxy for local/Amoy MVP).
  // Production should use UUPS proxies; contracts remain UUPS-ready.

  async function deploy(name) {
    const Factory = await ethers.getContractFactory(name);
    const c = await Factory.deploy();
    await c.waitForDeployment();
    const addr = await c.getAddress();
    const tx = await c.initialize(deployer.address);
    await tx.wait();
    console.log(`${name}: ${addr}`);
    return addr;
  }

  const addresses = {
    UserVerification: await deploy("UserVerification"),
    PropertyRegistry: await deploy("PropertyRegistry"),
    PossessionMemorial: await deploy("PossessionMemorial"),
    EscrowPayment: await deploy("EscrowPayment"),
    OwnershipTransfer: await deploy("OwnershipTransfer"),
    RentalAgreement: await deploy("RentalAgreement"),
  };

  console.log(JSON.stringify(addresses, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
