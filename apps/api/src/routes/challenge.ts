import { Router } from "express";
import { DEMO_WALLET_ADDRESS } from "../config/demo.js";
import { prisma } from "../db/prisma.js";
import { refreshChallengeProgressForUser } from "../services/challengeProgress.js";
import {
  depositAmountWeiToRewardCredits,
  resolveChallengeStatus,
  rewardCreditsToDepositAmountWei,
  serializeChallenge,
} from "../utils/challenge.js";

const router = Router();

function parseDateInput(value: unknown, fieldName: string) {
  const parsed = new Date(String(value ?? ""));

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} must be a valid date`);
  }

  return parsed;
}

function parseIntegerInput(
  value: unknown,
  fieldName: string,
  minimumValue = 0,
) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < minimumValue) {
    throw new Error(`${fieldName} must be at least ${minimumValue}`);
  }

  return Math.round(parsed);
}

function buildChallengePayload(body: Record<string, unknown>, organizer: string) {
  const title = String(body.title ?? "").trim();

  if (!title) {
    throw new Error("title is required");
  }

  const description = String(body.description ?? "").trim() || null;
  const requiredSportType = String(body.requiredSportType ?? "Walk").trim() || "Walk";
  const targetDistanceMeters = parseIntegerInput(
    body.targetDistanceMeters,
    "targetDistanceMeters",
    1,
  );
  const minMovingTimeSeconds = parseIntegerInput(
    body.minMovingTimeSeconds ?? 0,
    "minMovingTimeSeconds",
    0,
  );
  const rewardCredits = parseIntegerInput(
    body.rewardCredits ?? 10,
    "rewardCredits",
    0,
  );
  const registrationDeadline = parseDateInput(
    body.registrationDeadline,
    "registrationDeadline",
  );
  const challengeStartAt = parseDateInput(
    body.challengeStartAt,
    "challengeStartAt",
  );
  const challengeEndAt = parseDateInput(body.challengeEndAt, "challengeEndAt");

  if (challengeEndAt.getTime() < challengeStartAt.getTime()) {
    throw new Error("challengeEndAt must be later than challengeStartAt");
  }

  return {
    challengeData: {
      title,
      description,
      depositAmountWei: rewardCreditsToDepositAmountWei(rewardCredits),
      requiredSportType,
      targetDistanceMeters,
      minMovingTimeSeconds,
      registrationDeadline,
      challengeStartAt,
      challengeEndAt,
      status: resolveChallengeStatus(
        challengeStartAt,
        challengeEndAt,
        registrationDeadline,
      ),
      organizerWalletAddress: organizer,
    },
    rewardCredits,
  };
}

router.post("/create", async (req, res) => {
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

    const { challengeData } = buildChallengePayload(
      req.body as Record<string, unknown>,
      user.walletAddress ?? DEMO_WALLET_ADDRESS,
    );
    const autoJoin = req.body.autoJoin !== false;

    const result = await prisma.$transaction(async (tx) => {
      const challenge = await tx.challenge.create({
        data: challengeData,
      });

      const participant = autoJoin
        ? await tx.challengeParticipant.create({
            data: {
              challengeId: challenge.id,
              userId: user.id,
              status: "joined",
            },
          })
        : null;

      return {
        challenge,
        participant,
      };
    });

    return res.json({
      ok: true,
      challenge: serializeChallenge(result.challenge),
      participant: result.participant,
    });
  } catch (error: any) {
    console.error(error);

    const message = error?.message ?? String(error);
    const isValidationError =
      message.includes("required") ||
      message.includes("must be") ||
      message.includes("valid date");

    return res.status(isValidationError ? 400 : 500).json({
      ok: false,
      error: message,
    });
  }
});

router.get("/list", async (_req, res) => {
  try {
    const now = new Date();
    const challenges = await prisma.challenge.findMany({
      where: {
        challengeEndAt: {
          gt: now,
        },
      },
      orderBy: [{ challengeEndAt: "asc" }, { createdAt: "desc" }],
    });

    return res.json({
      ok: true,
      count: challenges.length,
      challenges: challenges.map(serializeChallenge),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      ok: false,
      error: "Failed to fetch challenges",
    });
  }
});

router.post("/join", async (req, res) => {
  try {
    const userId = String(req.body.userId ?? "");
    const challengeId = String(req.body.challengeId ?? "");

    if (!userId || !challengeId) {
      return res.status(400).json({
        ok: false,
        error: "userId and challengeId are required",
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

    const challenge = await prisma.challenge.findUnique({
      where: { id: challengeId },
    });

    if (!challenge) {
      return res.status(404).json({
        ok: false,
        error: "Challenge not found",
      });
    }

    const participant = await prisma.challengeParticipant.upsert({
      where: {
        challengeId_userId: {
          challengeId: challenge.id,
          userId: user.id,
        },
      },
      update: {},
      create: {
        challengeId: challenge.id,
        userId: user.id,
        status: "joined",
      },
    });

    return res.json({
      ok: true,
      participant,
      challenge: serializeChallenge(challenge),
    });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({
      ok: false,
      error: "Failed to join challenge",
      details: error?.message ?? String(error),
    });
  }
});

router.get("/history", async (req, res) => {
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

    const refreshed = await refreshChallengeProgressForUser(user.id);

    const participants = await prisma.challengeParticipant.findMany({
      where: { userId: user.id },
      include: {
        challenge: true,
        activityLinks: true,
      },
      orderBy: [{ verifiedAt: "desc" }, { createdAt: "desc" }],
    });

    const history = participants.map((participant) => {
      const rewardCredits = depositAmountWeiToRewardCredits(
        participant.challenge.depositAmountWei,
      );

      return {
        id: participant.id,
        challengeId: participant.challengeId,
        joinedAt: participant.joinedAt.toISOString(),
        verifiedAt: participant.verifiedAt?.toISOString() ?? null,
        passed: participant.passed,
        status: participant.status,
        result:
          participant.passed === true
            ? "passed"
            : participant.status === "failed"
              ? "failed"
              : "in_progress",
        totalDistanceMeters: participant.totalDistanceMeters,
        totalMovingTimeSeconds: participant.totalMovingTimeSeconds,
        countedActivities: participant.activityLinks.length,
        rewardCredits,
        earnedCredits: participant.earnedCredits,
        rewardCreditedAt: participant.rewardCreditedAt?.toISOString() ?? null,
        challenge: serializeChallenge(participant.challenge),
      };
    });

    return res.json({
      ok: true,
      count: history.length,
      balance: refreshed.balance,
      history,
    });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({
      ok: false,
      error: "Failed to fetch challenge history",
      details: error?.message ?? String(error),
    });
  }
});

router.get("/participants", async (_req, res) => {
  try {
    const participants = await prisma.challengeParticipant.findMany({
      include: {
        user: true,
        challenge: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const safeParticipants = participants.map((participant) => ({
      ...participant,
      user: {
        ...participant.user,
        stravaAthleteId: participant.user.stravaAthleteId
          ? participant.user.stravaAthleteId.toString()
          : null,
      },
      challenge: serializeChallenge(participant.challenge),
      rewardCredits: depositAmountWeiToRewardCredits(
        participant.challenge.depositAmountWei,
      ),
      earnedCredits: participant.earnedCredits,
      rewardCreditedAt: participant.rewardCreditedAt?.toISOString() ?? null,
    }));

    return res.json({
      ok: true,
      count: safeParticipants.length,
      participants: safeParticipants,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      ok: false,
      error: "Failed to fetch participants",
    });
  }
});

export default router;
