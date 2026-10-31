const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { deployZikkaron, MODULES } = require("../scripts/deployZikkaron");

const ADMIN = ethers.id("ADMIN");
const AUTHORITY_OFFICER = ethers.id("AUTHORITY_OFFICER");
const EventType = { UnauthorizedOccupancyReported: 0, AgencyAckReceived: 4 };
const AMOUNT = ethers.parseEther("1");

describe("Zikkaron contracts", function () {
  async function deployAll() {
    const [admin, owner, buyer, tenant, titleOfficer, authority, stranger, multisig] =
      await ethers.getSigners();
    const { contracts } = await deployZikkaron({ deployer: admin });
    const {
      UserVerification: userVerification,
      PropertyRegistry: propertyRegistry,
      PossessionMemorial: possessionMemorial,
      EscrowPayment: escrow,
      OwnershipTransfer: ownershipTransfer,
      RentalAgreement: rental,
    } = contracts;

    await (await userVerification.grantTitleOfficer(titleOfficer.address)).wait();
    await (await userVerification.grantAuthorityOfficer(authority.address)).wait();
    await (await ownershipTransfer.grantTitleOfficer(titleOfficer.address)).wait();
    await (await possessionMemorial.grantRole(AUTHORITY_OFFICER, authority.address)).wait();

    await (
      await propertyRegistry
        .connect(owner)
        .registerProperty(ethers.id("deed-cid"), "123-45-678", "Maricopa", "AZ", 0)
    ).wait();
    const propertyId = 1n;

    return {
      admin,
      owner,
      buyer,
      tenant,
      titleOfficer,
      authority,
      stranger,
      multisig,
      propertyId,
      contracts,
      userVerification,
      propertyRegistry,
      possessionMemorial,
      escrow,
      ownershipTransfer,
      rental,
    };
  }

  describe("deployment", function () {
    it("locks implementations and binds registry-gated modules", async function () {
      const { contracts, propertyRegistry } = await loadFixture(deployAll);
      const registry = await propertyRegistry.getAddress();
      for (const name of ["PossessionMemorial", "EscrowPayment", "OwnershipTransfer", "RentalAgreement"]) {
        expect(await contracts[name].propertyRegistry()).to.equal(registry);
      }
      const [admin] = await ethers.getSigners();
      const implementation = await (await ethers.getContractFactory("EscrowPayment")).deploy();
      await expect(implementation.initialize(admin.address)).to.be.reverted;
    });

    it("only ADMIN can rebind the property registry", async function () {
      const { rental, stranger } = await loadFixture(deployAll);
      await expect(rental.connect(stranger).setPropertyRegistry(stranger.address))
        .to.be.revertedWithCustomError(rental, "AccessControlUnauthorizedAccount");
    });
  });

  describe("UserVerification", function () {
    it("registers KYC hash and verifies user", async function () {
      const { owner, admin, userVerification } = await loadFixture(deployAll);
      const hash = ethers.id("kyc-demo-owner");
      await (await userVerification.connect(owner).register(hash, "seller")).wait();
      await (await userVerification.connect(admin).verifyUser(owner.address)).wait();
      const rec = await userVerification.records(owner.address);
      expect(rec.verified).to.equal(true);
      expect(rec.kycHash).to.equal(hash);
    });

    it("resets verification when a user re-registers with a different KYC hash", async function () {
      const { owner, admin, userVerification } = await loadFixture(deployAll);
      await (await userVerification.connect(owner).register(ethers.id("kyc-a"), "seller")).wait();
      await (await userVerification.connect(admin).verifyUser(owner.address)).wait();

      await (await userVerification.connect(owner).register(ethers.id("kyc-a"), "buyer")).wait();
      expect((await userVerification.records(owner.address)).verified).to.equal(true);

      await expect(userVerification.connect(owner).register(ethers.id("kyc-b"), "seller"))
        .to.emit(userVerification, "VerificationReset")
        .withArgs(owner.address);
      const rec = await userVerification.records(owner.address);
      expect(rec.verified).to.equal(false);
      expect(rec.verifiedAt).to.equal(0n);
    });
  });

  describe("PropertyRegistry", function () {
    it("keys APNs with abi.encode so delimiter-bearing inputs cannot collide", async function () {
      const { propertyRegistry, owner, stranger } = await loadFixture(deployAll);
      expect(await propertyRegistry.apnKey("AZ", "A|B", "C")).to.not.equal(
        await propertyRegistry.apnKey("AZ", "A", "B|C")
      );
      await (
        await propertyRegistry.connect(owner).registerProperty(ethers.id("d1"), "C", "A|B", "AZ", 0)
      ).wait();
      await (
        await propertyRegistry.connect(stranger).registerProperty(ethers.id("d2"), "B|C", "A", "AZ", 0)
      ).wait();
      await expect(
        propertyRegistry.connect(stranger).registerProperty(ethers.id("d3"), "C", "A|B", "AZ", 0)
      ).to.be.revertedWith("apn exists");
    });

    it("exposes the claimed owner and zero for unknown properties", async function () {
      const { propertyRegistry, owner, propertyId } = await loadFixture(deployAll);
      expect(await propertyRegistry.claimedOwnerOf(propertyId)).to.equal(owner.address);
      expect(await propertyRegistry.claimedOwnerOf(999)).to.equal(ethers.ZeroAddress);
    });

    it("pauses property memorial writes without affecting reads", async function () {
      const { admin, owner, propertyRegistry } = await loadFixture(deployAll);
      await (await propertyRegistry.connect(admin).pause()).wait();
      await expect(
        propertyRegistry
          .connect(owner)
          .registerProperty(ethers.id("paused-deed"), "PAUSED-1", "Maricopa", "AZ", 0)
      ).to.be.reverted;
      expect(await propertyRegistry.nextPropertyId()).to.equal(2n);
      await (await propertyRegistry.connect(admin).unpause()).wait();
    });
  });

  describe("PossessionMemorial", function () {
    it("lets the owner record events and rejects strangers", async function () {
      const { owner, stranger, possessionMemorial, propertyId } = await loadFixture(deployAll);
      const evidence = ethers.id("incident-photo");
      await (
        await possessionMemorial
          .connect(owner)
          .recordEvent(propertyId, EventType.UnauthorizedOccupancyReported, evidence, "bafyIncidentNote")
      ).wait();
      const ids = await possessionMemorial.getPropertyEventIds(propertyId);
      expect(ids.length).to.equal(1);
      expect((await possessionMemorial.events(ids[0])).evidenceHash).to.equal(evidence);

      await expect(
        possessionMemorial
          .connect(stranger)
          .recordEvent(propertyId, EventType.UnauthorizedOccupancyReported, evidence, "")
      ).to.be.revertedWith("not property owner");
      await expect(
        possessionMemorial.connect(stranger).recordEvent(999, 0, evidence, "")
      ).to.be.revertedWith("property missing");
    });

    it("reserves agency acknowledgments for authority officers", async function () {
      const { owner, authority, possessionMemorial, propertyId } = await loadFixture(deployAll);
      const evidence = ethers.id("ack");
      await expect(
        possessionMemorial.connect(owner).recordEvent(propertyId, EventType.AgencyAckReceived, evidence, "")
      ).to.be.revertedWith("authority only");
      await (
        await possessionMemorial
          .connect(authority)
          .recordEvent(propertyId, EventType.AgencyAckReceived, evidence, "")
      ).wait();
    });
  });

  describe("RentalAgreement", function () {
    it("creates an authorized rental only for the property owner", async function () {
      const { owner, tenant, stranger, rental, propertyId } = await loadFixture(deployAll);
      const lease = ethers.id("lease-cid");
      const start = await time.latest();
      const end = start + 86400 * 365;

      await expect(
        rental.connect(stranger).createAgreement(propertyId, stranger.address, lease, start, end)
      ).to.be.revertedWith("not property owner");
      await expect(
        rental.connect(owner).createAgreement(999, tenant.address, lease, start, end)
      ).to.be.revertedWith("property missing");

      await (
        await rental.connect(owner).createAgreement(propertyId, tenant.address, lease, start, end)
      ).wait();
      const a = await rental.agreements(1);
      expect(a.authorizedOccupant).to.equal(true);
      expect(a.tenant).to.equal(tenant.address);
    });
  });

  describe("OwnershipTransfer", function () {
    it("title officer simulates county verify on an owner-proposed transfer", async function () {
      const { owner, buyer, stranger, titleOfficer, ownershipTransfer, propertyId } =
        await loadFixture(deployAll);
      const instrument = ethers.id("instrument");
      await expect(
        ownershipTransfer
          .connect(stranger)
          .proposeTransfer(propertyId, buyer.address, instrument, "2026-001234", true)
      ).to.be.revertedWith("not property owner");

      await (
        await ownershipTransfer
          .connect(owner)
          .proposeTransfer(propertyId, buyer.address, instrument, "2026-001234", true)
      ).wait();
      await (await ownershipTransfer.connect(buyer).acceptTransfer(1)).wait();
      await (await ownershipTransfer.connect(titleOfficer).simulateCountyVerify(1)).wait();
      expect((await ownershipTransfer.transfers(1)).status).to.equal(2); // CountyVerifySimulated
    });
  });

  describe("EscrowPayment", function () {
    async function fundedDeal() {
      const fixture = await loadFixture(deployAll);
      const { owner, buyer, escrow, propertyId } = fixture;
      await (await escrow.connect(owner).openDeal(propertyId, buyer.address, AMOUNT, true, true)).wait();
      await (await escrow.connect(buyer).fundDeal(1, { value: AMOUNT })).wait();
      return fixture;
    }

    it("opens purchase deals only for the owner, with disclaimer and fraud warning", async function () {
      const { owner, buyer, stranger, escrow, propertyId } = await loadFixture(deployAll);
      await expect(
        escrow.connect(owner).openDeal(propertyId, buyer.address, AMOUNT, false, true)
      ).to.be.revertedWith("disclaimer required");
      await expect(
        escrow.connect(owner).openDeal(propertyId, buyer.address, AMOUNT, true, false)
      ).to.be.revertedWith("fraud warning required");
      await expect(
        escrow.connect(stranger).openDeal(propertyId, buyer.address, AMOUNT, true, true)
      ).to.be.revertedWith("not property owner");

      await (await escrow.connect(owner).openDeal(propertyId, buyer.address, AMOUNT, true, true)).wait();
      expect((await escrow.deals(1)).disclaimerAccepted).to.equal(true);
    });

    it("only the buyer can fund, with the exact amount", async function () {
      const { owner, buyer, stranger, escrow, propertyId } = await loadFixture(deployAll);
      await (await escrow.connect(owner).openDeal(propertyId, buyer.address, AMOUNT, true, true)).wait();
      await expect(escrow.connect(stranger).fundDeal(1, { value: AMOUNT })).to.be.revertedWith("not buyer");
      await expect(escrow.connect(buyer).fundDeal(1, { value: AMOUNT - 1n })).to.be.revertedWith(
        "amount mismatch"
      );
      await expect(escrow.connect(buyer).fundDeal(1, { value: AMOUNT })).to.changeEtherBalances(
        [buyer, escrow],
        [-AMOUNT, AMOUNT]
      );
      expect(await escrow.fundedAt(1)).to.equal(BigInt(await time.latest()));
      await expect(escrow.connect(buyer).fundDeal(1, { value: AMOUNT })).to.be.revertedWith("not open");
    });

    it("admin release pays the seller exactly once", async function () {
      const { admin, owner, stranger, escrow } = await fundedDeal();
      await expect(escrow.connect(stranger).release(1)).to.be.revertedWithCustomError(
        escrow,
        "AccessControlUnauthorizedAccount"
      );
      await expect(escrow.connect(admin).release(1)).to.changeEtherBalances(
        [owner, escrow],
        [AMOUNT, -AMOUNT]
      );
      await expect(escrow.connect(admin).release(1)).to.be.revertedWith("not funded");
      await expect(escrow.connect(admin).refund(1)).to.be.revertedWith("not funded");
    });

    it("admin refund returns funds to the buyer", async function () {
      const { admin, buyer, stranger, escrow } = await fundedDeal();
      await expect(escrow.connect(stranger).refund(1)).to.be.revertedWithCustomError(
        escrow,
        "AccessControlUnauthorizedAccount"
      );
      await expect(escrow.connect(admin).refund(1)).to.changeEtherBalances(
        [buyer, escrow],
        [AMOUNT, -AMOUNT]
      );
      expect((await escrow.deals(1)).status).to.equal(3); // Refunded
    });

    it("buyer can reclaim funds after the refund timeout, even while paused", async function () {
      const { admin, buyer, stranger, escrow } = await fundedDeal();
      expect(await escrow.refundTimeout()).to.equal(await escrow.DEFAULT_REFUND_TIMEOUT());
      await expect(escrow.connect(buyer).claimRefund(1)).to.be.revertedWith("refund timeout active");

      await time.increase(Number(await escrow.refundTimeout()));
      await expect(escrow.connect(stranger).claimRefund(1)).to.be.revertedWith("not buyer");
      await (await escrow.connect(admin).pause()).wait();
      await expect(escrow.connect(buyer).claimRefund(1)).to.changeEtherBalances(
        [buyer, escrow],
        [AMOUNT, -AMOUNT]
      );
      await expect(escrow.connect(buyer).claimRefund(1)).to.be.revertedWith("not funded");
    });

    it("bounds the configurable refund timeout", async function () {
      const { admin, stranger, escrow } = await loadFixture(deployAll);
      await expect(escrow.connect(stranger).setRefundTimeout(86400 * 3)).to.be.revertedWithCustomError(
        escrow,
        "AccessControlUnauthorizedAccount"
      );
      await expect(escrow.connect(admin).setRefundTimeout(60)).to.be.revertedWith("timeout bounds");
      await expect(escrow.connect(admin).setRefundTimeout(86400 * 3))
        .to.emit(escrow, "RefundTimeoutUpdated")
        .withArgs(86400 * 3);
      expect(await escrow.refundTimeout()).to.equal(86400n * 3n);
    });
  });

  describe("upgrades and admin handoff", function () {
    it("ADMIN upgrades preserve state; others cannot upgrade", async function () {
      const { admin, owner, buyer, stranger, escrow, propertyRegistry, propertyId } =
        await loadFixture(deployAll);
      await (await escrow.connect(owner).openDeal(propertyId, buyer.address, AMOUNT, true, true)).wait();

      const nextImplementation = await (await ethers.getContractFactory("EscrowPayment")).deploy();
      await expect(
        escrow.connect(stranger).upgradeToAndCall(await nextImplementation.getAddress(), "0x")
      ).to.be.revertedWithCustomError(escrow, "AccessControlUnauthorizedAccount");

      await (await escrow.connect(admin).upgradeToAndCall(await nextImplementation.getAddress(), "0x")).wait();
      expect((await escrow.deals(1)).buyer).to.equal(buyer.address);
      expect(await escrow.nextDealId()).to.equal(2n);
      expect(await escrow.propertyRegistry()).to.equal(await propertyRegistry.getAddress());
    });

    it("hands ADMIN and DEFAULT_ADMIN_ROLE to the upgrade admin and strips the deployer", async function () {
      const [deployer, , , , , , , multisig] = await ethers.getSigners();
      const { contracts } = await deployZikkaron({ deployer, upgradeAdmin: multisig.address });

      for (const name of MODULES) {
        const contract = contracts[name];
        const DEFAULT_ADMIN_ROLE = await contract.DEFAULT_ADMIN_ROLE();
        expect(await contract.hasRole(ADMIN, deployer.address)).to.equal(false);
        expect(await contract.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)).to.equal(false);
        expect(await contract.hasRole(ADMIN, multisig.address)).to.equal(true);
        expect(await contract.hasRole(DEFAULT_ADMIN_ROLE, multisig.address)).to.equal(true);
      }

      const escrow = contracts.EscrowPayment;
      const nextImplementation = await (await ethers.getContractFactory("EscrowPayment")).deploy();
      const target = await nextImplementation.getAddress();
      await expect(escrow.connect(deployer).upgradeToAndCall(target, "0x")).to.be.revertedWithCustomError(
        escrow,
        "AccessControlUnauthorizedAccount"
      );
      await expect(escrow.connect(deployer).grantRole(ADMIN, deployer.address)).to.be.revertedWithCustomError(
        escrow,
        "AccessControlUnauthorizedAccount"
      );
      await (await escrow.connect(multisig).upgradeToAndCall(target, "0x")).wait();
    });
  });
});
