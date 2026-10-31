const { ethers } = require("hardhat");

const MODULES = [
  "UserVerification",
  "PropertyRegistry",
  "PossessionMemorial",
  "EscrowPayment",
  "OwnershipTransfer",
  "RentalAgreement",
];
const REGISTRY_BOUND = ["PossessionMemorial", "EscrowPayment", "OwnershipTransfer", "RentalAgreement"];

async function deployModule(name, deployer) {
  const implementationFactory = await ethers.getContractFactory(name, deployer);
  const implementation = await implementationFactory.deploy();
  await implementation.waitForDeployment();
  const initializationData = implementationFactory.interface.encodeFunctionData("initialize", [
    deployer.address,
  ]);

  const proxyFactory = await ethers.getContractFactory("ZikkaronProxy", deployer);
  const proxy = await proxyFactory.deploy(await implementation.getAddress(), initializationData);
  await proxy.waitForDeployment();
  return {
    contract: await ethers.getContractAt(name, await proxy.getAddress(), deployer),
    implementation: await implementation.getAddress(),
  };
}

/**
 * Move ADMIN (upgrade authority) and DEFAULT_ADMIN_ROLE (role administration) to upgradeAdmin and
 * renounce both from the deployer, then read the roles back so a partial handoff fails loudly.
 */
async function handOffAdmin(name, contract, deployer, upgradeAdmin) {
  const ADMIN = ethers.id("ADMIN");
  const DEFAULT_ADMIN_ROLE = await contract.DEFAULT_ADMIN_ROLE();

  await (await contract.grantRole(DEFAULT_ADMIN_ROLE, upgradeAdmin)).wait();
  await (await contract.grantRole(ADMIN, upgradeAdmin)).wait();
  await (await contract.renounceRole(ADMIN, deployer.address)).wait();
  await (await contract.renounceRole(DEFAULT_ADMIN_ROLE, deployer.address)).wait();

  const checks = [
    [await contract.hasRole(ADMIN, upgradeAdmin), true, "upgrade admin holds ADMIN"],
    [await contract.hasRole(DEFAULT_ADMIN_ROLE, upgradeAdmin), true, "upgrade admin holds DEFAULT_ADMIN_ROLE"],
    [await contract.hasRole(ADMIN, deployer.address), false, "deployer renounced ADMIN"],
    [await contract.hasRole(DEFAULT_ADMIN_ROLE, deployer.address), false, "deployer renounced DEFAULT_ADMIN_ROLE"],
  ];
  for (const [actual, expected, label] of checks) {
    if (actual !== expected) throw new Error(`${name}: role handoff check failed (${label})`);
  }
}

/**
 * Deploy every Zikkaron module behind a ZikkaronProxy, bind registry-gated modules to
 * PropertyRegistry, and optionally hand admin roles to a multisig/timelock.
 */
async function deployZikkaron({ deployer, upgradeAdmin, log = () => {} } = {}) {
  const deployed = {};
  for (const name of MODULES) {
    deployed[name] = await deployModule(name, deployer);
    log(`${name}: proxy=${await deployed[name].contract.getAddress()} implementation=${deployed[name].implementation}`);
  }

  const registryAddress = await deployed.PropertyRegistry.contract.getAddress();
  for (const name of REGISTRY_BOUND) {
    await (await deployed[name].contract.setPropertyRegistry(registryAddress)).wait();
  }

  const finalAdmin = upgradeAdmin || deployer.address;
  if (finalAdmin.toLowerCase() !== deployer.address.toLowerCase()) {
    for (const name of MODULES) {
      await handOffAdmin(name, deployed[name].contract, deployer, finalAdmin);
      log(`${name}: admin roles handed to ${finalAdmin}; deployer renounced`);
    }
  }

  const contracts = {};
  const addresses = {};
  for (const name of MODULES) {
    contracts[name] = deployed[name].contract;
    addresses[name] = {
      proxy: await deployed[name].contract.getAddress(),
      implementation: deployed[name].implementation,
      upgradeAdmin: finalAdmin,
    };
  }
  return { contracts, addresses };
}

module.exports = { deployZikkaron, MODULES, REGISTRY_BOUND };
