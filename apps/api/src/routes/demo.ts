import { Router } from "express";
import {
  DEMO_WALLETS,
  findDemoWalletByAddress,
  pickUnusedDemoWallet,
} from "../config/demo.js";
import { prisma } from "../db/prisma.js";
import {
  getContractStatus,
  isContractConfigured,
  joinDemoParticipantOnChain,
} from "../services/contract.js";

const router = Router();

function serializeDemoUser(user: {
  id: string;
  displayName: string | null;
  balance: number;
  walletAddress: string | null;
  stravaAthleteId: bigint | null;
  stravaFirstname: string | null;
  stravaLastname: string | null;
}) {
  const demoWallet = findDemoWalletByAddress(user.walletAddress);

  return {
    id: user.id,
    displayName: user.displayName,
    balance: user.balance,
    walletAddress: user.walletAddress,
    demoWalletLabel: demoWallet?.label ?? null,
    contractReady: Boolean(
      user.walletAddress && demoWallet && isContractConfigured(),
    ),
    stravaAthleteId: user.stravaAthleteId
      ? user.stravaAthleteId.toString()
      : null,
    stravaFirstname: user.stravaFirstname,
    stravaLastname: user.stravaLastname,
  };
}

async function assignAvailableDemoWallet(userId: string) {
  const usedWallets = await prisma.user.findMany({
    where: {
      walletAddress: {
        in: DEMO_WALLETS.map((wallet) => wallet.address),
      },
      NOT: {
        id: userId,
      },
    },
    select: {
      walletAddress: true,
    },
  });
  const nextWallet = pickUnusedDemoWallet(
    usedWallets
      .map((user) => user.walletAddress)
      .filter((walletAddress): walletAddress is string => Boolean(walletAddress)),
  );

  if (!nextWallet) {
    return null;
  }

  return prisma.user.update({
    where: { id: userId },
    data: {
      walletAddress: nextWallet.address,
    },
  });
}

async function ensureDemoWallet(user: {
  id: string;
  walletAddress: string | null;
  displayName: string | null;
  balance: number;
  stravaAthleteId: bigint | null;
  stravaFirstname: string | null;
  stravaLastname: string | null;
}) {
  const existingDemoWallet = findDemoWalletByAddress(user.walletAddress);

  if (existingDemoWallet) {
    return user;
  }

  return (await assignAvailableDemoWallet(user.id)) ?? user;
}

function serializeContractSnapshot(
  contract: Awaited<ReturnType<typeof getContractStatus>>,
  walletAddress: string | null,
) {
  const demoWallet = findDemoWalletByAddress(walletAddress);

  return {
    ...contract,
    participantWallet: walletAddress,
    demoWalletLabel: demoWallet?.label ?? null,
  };
}

router.post("/start", async (_req, res) => {
  try {
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const displayName = `Demo Runner ${randomSuffix}`;

    const user = await prisma.user.create({
      data: {
        displayName,
        balance: 1000,
      },
    });
    const readyUser = await ensureDemoWallet(user);

    return res.json({
      ok: true,
      user: serializeDemoUser(readyUser),
    });
  } catch (error: any) {
    console.error("demo/start error:", error);

    return res.status(500).json({
      ok: false,
      error: "Failed to create demo user",
      details: error?.message ?? String(error),
    });
  }
});

router.get("/me", async (req, res) => {
  try {
    const userId = String(req.query.userId ?? "");

    if (!userId) {
      return res.status(400).json({
        ok: false,
        error: "userId is required",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({
        ok: false,
        error: "User not found",
      });
    }

    const readyUser = await ensureDemoWallet(user);

    return res.json({
      ok: true,
      user: serializeDemoUser(readyUser),
    });
  } catch (error: any) {
    console.error("demo/me error:", error);

    return res.status(500).json({
      ok: false,
      error: "Failed to fetch demo user",
      details: error?.message ?? String(error),
    });
  }
});

router.get("/contract-status", async (req, res) => {
  try {
    const userId = String(req.query.userId ?? "");

    if (!userId) {
      return res.status(400).json({
        ok: false,
        error: "userId is required",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({
        ok: false,
        error: "User not found",
      });
    }

    const readyUser = await ensureDemoWallet(user);
    const contract = await getContractStatus(readyUser.walletAddress);

    return res.json({
      ok: true,
      contract: serializeContractSnapshot(contract, readyUser.walletAddress),
    });
  } catch (error: any) {
    console.error("demo/contract-status error:", error);

    return res.status(500).json({
      ok: false,
      error: "Failed to fetch contract status",
      details: error?.message ?? String(error),
    });
  }
});

router.post("/join-contract", async (req, res) => {
  try {
    const userId = String(req.body.userId ?? "");

    if (!userId) {
      return res.status(400).json({
        ok: false,
        error: "userId is required",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({
        ok: false,
        error: "User not found",
      });
    }

    const readyUser = await ensureDemoWallet(user);
    const demoWallet = findDemoWalletByAddress(readyUser.walletAddress);

    if (!demoWallet) {
      return res.status(400).json({
        ok: false,
        error: "No demo wallet is assigned to this profile",
      });
    }

    const currentContractState = await getContractStatus(demoWallet.address);

    if (!currentContractState.available) {
      return res.status(503).json({
        ok: false,
        error:
          currentContractState.error ??
          "Contract integration is not configured",
        contract: serializeContractSnapshot(
          currentContractState,
          readyUser.walletAddress,
        ),
      });
    }

    if (currentContractState.joined) {
      return res.json({
        ok: true,
        alreadyJoined: true,
        joinResult: null,
        contract: serializeContractSnapshot(
          currentContractState,
          readyUser.walletAddress,
        ),
      });
    }

    const joinResult = await joinDemoParticipantOnChain(demoWallet.privateKey);
    const updatedContractState = await getContractStatus(demoWallet.address);

    return res.json({
      ok: true,
      alreadyJoined: false,
      joinResult,
      contract: serializeContractSnapshot(
        updatedContractState,
        readyUser.walletAddress,
      ),
    });
  } catch (error: any) {
    console.error("demo/join-contract error:", error);

    return res.status(500).json({
      ok: false,
      error: error?.shortMessage ?? error?.message ?? "Failed to join contract",
      details: error?.message ?? String(error),
    });
  }
});

export default router;
