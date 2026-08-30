const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Zikkaron contracts", function () {
  async function deployAll() {
    const [admin, owner, buyer, tenant, titleOfficer, authority] = await ethers.getSigners();

    async function deploy(name) {
      const implementationFactory = await ethers.getContractFactory(name);
      const implementation = await implementationFactory.deploy();
      await implementation.waitForDeployment();
      const initData = implementationFactory.interface.encodeFunctionData(
        "initialize",
        [admin.address]
      );
      const proxyFactory = await ethers.getContractFactory("ZikkaronProxy");
      const proxy = await proxyFactory.deploy(
        await implementation.getAddress(),
        initData
      );
      await proxy.waitForDeployment();
      const proxied = await ethers.getContractAt(name, await proxy.getAddress());
      await expect(implementation.initialize(admin.address)).to.be.reverted;
      return proxied;
    }

    const userVerification = await deploy("UserVerification");
    const propertyRegistry = await deploy("PropertyRegistry");
    const possessionMemorial = await deploy("PossessionMemorial");
    const escrow = await deploy("EscrowPayment");
    const ownershipTransfer = await deploy("OwnershipTransfer");
    const rental = await deploy("RentalAgreement");

    await (await userVerification.grantTitleOfficer(titleOfficer.address)).wait();
    await (await userVerification.grantAuthorityOfficer(authority.address)).wait();
    await (await ownershipTransfer.grantTitleOfficer(titleOfficer.address)).wait();

    return {
      admin,
      owner,
      buyer,
      tenant,
      titleOfficer,
      authority,
      userVerification,
      propertyRegistry,
      possessionMemorial,
      escrow,
      ownershipTransfer,
      rental,
    };
  }

  it("registers KYC hash and verifies user", async function () {
    const { owner, admin, userVerification } = await deployAll();
    const hash = ethers.id("kyc-demo-owner");
    await (await userVerification.connect(owner).register(hash, "seller")).wait();
    await (await userVerification.connect(admin).verifyUser(owner.address)).wait();
    const rec = await userVerification.records(owner.address);
    expect(rec.verified).to.equal(true);
    expect(rec.kycHash).to.equal(hash);
  });

  it("registers property and records possession memorial event", async function () {
    const { owner, propertyRegistry, possessionMemorial } = await deployAll();
    const deed = ethers.id("deed-cid");
    const tx = await propertyRegistry
      .connect(owner)
      .registerProperty(deed, "123-45-678", "Maricopa", "AZ", 0);
    await tx.wait();
    const propertyId = 1n;

    const evidence = ethers.id("incident-photo");
    await (
      await possessionMemorial
        .connect(owner)
        .recordEvent(propertyId, 0, evidence, "bafyIncidentNote")
    ).wait();

    const ids = await possessionMemorial.getPropertyEventIds(propertyId);
    expect(ids.length).to.equal(1);
    const ev = await possessionMemorial.events(ids[0]);
    expect(ev.evidenceHash).to.equal(evidence);
  });

  it("creates authorized rental agreement for tenant", async function () {
    const { owner, tenant, rental } = await deployAll();
    const lease = ethers.id("lease-cid");
    const start = Math.floor(Date.now() / 1000);
    const end = start + 86400 * 365;
    await (
      await rental.connect(owner).createAgreement(1, tenant.address, lease, start, end)
    ).wait();
    const a = await rental.agreements(1);
    expect(a.authorizedOccupant).to.equal(true);
    expect(a.tenant).to.equal(tenant.address);
  });

  it("opens purchase deal only with disclaimer and fraud warning", async function () {
    const { owner, buyer, escrow } = await deployAll();
    await expect(
      escrow.connect(owner).openDeal(1, buyer.address, ethers.parseEther("1"), false, true)
    ).to.be.revertedWith("disclaimer required");

    await (
      await escrow.connect(owner).openDeal(1, buyer.address, ethers.parseEther("1"), true, true)
    ).wait();
    const d = await escrow.deals(1);
    expect(d.disclaimerAccepted).to.equal(true);
  });

  it("title officer simulates county verify on accepted transfer", async function () {
    const { owner, buyer, titleOfficer, ownershipTransfer } = await deployAll();
    const instrument = ethers.id("instrument");
    await (
      await ownershipTransfer
        .connect(owner)
        .proposeTransfer(1, buyer.address, instrument, "2026-001234", true)
    ).wait();
    await (await ownershipTransfer.connect(buyer).acceptTransfer(1)).wait();
    await (await ownershipTransfer.connect(titleOfficer).simulateCountyVerify(1)).wait();
    const t = await ownershipTransfer.transfers(1);
    expect(t.status).to.equal(2); // CountyVerifySimulated
  });

  it("pauses property memorial writes without affecting reads", async function () {
    const { admin, owner, propertyRegistry } = await deployAll();
    await (await propertyRegistry.connect(admin).pause()).wait();
    await expect(
      propertyRegistry
        .connect(owner)
        .registerProperty(ethers.id("paused-deed"), "PAUSED-1", "Maricopa", "AZ", 0)
    ).to.be.reverted;
    expect(await propertyRegistry.nextPropertyId()).to.equal(1n);
    await (await propertyRegistry.connect(admin).unpause()).wait();
  });
});
