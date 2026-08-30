const { ethers, network } = require("hardhat");

/**
 * Deploy Zikkaron UUPS modules to the selected network.
 * Polygon Amoy (80002) first. Mainnet requires CONFIRM_MAINNET_DEPLOY=yes.
 */
async function main() {
  if (network.name === "polygon" && process.env.CONFIRM_MAINNET_DEPLOY !== "yes") {
    throw new Error("Mainnet deployment requires CONFIRM_MAINNET_DEPLOY=yes");
  }

  const [deployer] = await ethers.getSigners();
  console.log("Deploying Zikkaron with:", deployer.address);

  async function deploy(name) {
    const implementationFactory = await ethers.getContractFactory(name);
    const implementation = await implementationFactory.deploy();
    await implementation.waitForDeployment();
    const initializationData = implementationFactory.interface.encodeFunctionData(
      "initialize",
      [deployer.address]
    );

    const proxyFactory = await ethers.getContractFactory("ZikkaronProxy");
    const proxy = await proxyFactory.deploy(
      await implementation.getAddress(),
      initializationData
    );
    await proxy.waitForDeployment();
    const proxyAddress = await proxy.getAddress();
    const proxied = await ethers.getContractAt(name, proxyAddress);

    const upgradeAdmin = process.env.UPGRADE_ADMIN_ADDRESS || deployer.address;
    if (upgradeAdmin.toLowerCase() !== deployer.address.toLowerCase()) {
      const adminRole = ethers.id("ADMIN");
      await (await proxied.grantRole(adminRole, upgradeAdmin)).wait();
      console.log(`${name}: upgrade admin granted to ${upgradeAdmin}`);
    }

    console.log(
      `${name}: proxy=${proxyAddress} implementation=${await implementation.getAddress()}`
    );
    return {
      proxy: proxyAddress,
      implementation: await implementation.getAddress(),
      upgradeAdmin,
    };
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
