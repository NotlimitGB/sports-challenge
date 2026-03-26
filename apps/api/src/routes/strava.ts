import { Router } from "express";
import { DEMO_WALLET_ADDRESS } from "../config/demo.js";
import { prisma } from "../db/prisma.js";
import {
  refreshStravaToken,
  syncStravaActivitiesForUser,
} from "../services/strava.js";
import {
  normalizeStoredActivities,
  refreshChallengeParticipantProgress,
  refreshChallengeProgressForUser,
} from "../services/challengeProgress.js";
import { submitResultOnChain } from "../services/contract.js";
import { getUserIdFromQuery } from "../utils/user.js";

const router = Router();

router.get("/sync-activities", async (req, res) => {
  try {
    const userId = getUserIdFromQuery(req.query.userId);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { stravaToken: true },
    });

    if (!user || !user.stravaToken) {
      return res.status(404).json({
        ok: false,
        error: "User or Strava token not found",
      });
    }

    let accessToken = user.stravaToken.accessToken;

    if (new Date(user.stravaToken.expiresAt).getTime() <= Date.now()) {
      const refreshed = await refreshStravaToken(user.stravaToken.refreshToken);

      await prisma.stravaToken.update({
        where: { userId: user.id },
        data: {
          accessToken: refreshed.access_token,
          refreshToken: refreshed.refresh_token,
          expiresAt: new Date(refreshed.expires_at * 1000),
          scope: "read,activity:read",
        },
      });

      accessToken = refreshed.access_token;
    }
    const saved = await syncStravaActivitiesForUser(user.id, accessToken);
    const refreshed = await refreshChallengeProgressForUser(user.id);

    return res.json({
      ok: true,
      saved,
      refreshedChallenges: refreshed.refreshed.length,
      balance: refreshed.balance,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      ok: false,
      error: "Failed to sync activities",
    });
  }
});

router.get("/activities", async (req, res) => {
  try {
    const userId = getUserIdFromQuery(req.query.userId);

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({
        ok: false,
        error: "User not found",
      });
    }

    const activities = await prisma.stravaActivity.findMany({
      where: { userId: user.id },
      orderBy: { startDate: "desc" },
    });

    const safeActivities = activities.map((activity) => ({
      ...activity,
      stravaActivityId: activity.stravaActivityId.toString(),
      distanceMeters: Number(activity.distanceMeters),
    }));

    return res.json({
      ok: true,
      count: safeActivities.length,
      activities: safeActivities,
    });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({
      ok: false,
      error: "Failed to fetch activities from database",
      details: error?.message ?? String(error),
    });
  }
});

router.get("/check-challenge", async (req, res) => {
  try {
    const userId = getUserIdFromQuery(req.query.userId);
    const challengeId = String(req.query.challengeId ?? "");

    if (!challengeId) {
      return res.status(400).json({
        ok: false,
        error: "challengeId is required",
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

    const participant = await prisma.challengeParticipant.findUnique({
      where: {
        challengeId_userId: {
          challengeId: challenge.id,
          userId: user.id,
        },
      },
    });

    if (!participant) {
      return res.status(404).json({
        ok: false,
        error: "Participant not found for this challenge",
      });
    }

    const activities = await prisma.stravaActivity.findMany({
      where: { userId: user.id },
      orderBy: { startDate: "desc" },
    });

    const progress = await refreshChallengeParticipantProgress({
      user,
      challenge,
      participant,
      activities: normalizeStoredActivities(activities),
    });
    let updatedParticipant = progress.updatedParticipant;
    const updatedBalance = progress.updatedBalance;
    const rewardCredits = progress.rewardCredits;
    const result = progress.result;

    let onChainResult: { txHash: string; blockNumber: number | null } | null =
      null;
    let onChainError: string | null = null;

    if (
      !updatedParticipant.onchainResultSubmitted &&
      updatedParticipant.status !== "joined"
    ) {
      try {
        onChainResult = await submitResultOnChain(
          user.walletAddress ?? DEMO_WALLET_ADDRESS,
          result.passed,
        );

        updatedParticipant = await prisma.challengeParticipant.update({
          where: { id: participant.id },
          data: {
            onchainResultSubmitted: true,
          },
        });
      } catch (error: any) {
        console.error("submitResultOnChain error:", error);
        onChainError = error?.shortMessage ?? error?.message ?? String(error);
      }
    }

    return res.json({
      ok: true,
      challenge: {
        id: challenge.id,
        title: challenge.title,
        requiredSportType: challenge.requiredSportType,
        targetDistanceMeters: challenge.targetDistanceMeters,
        minMovingTimeSeconds: challenge.minMovingTimeSeconds,
        rewardCredits,
      },
      participant: updatedParticipant,
      result: {
        passed: result.passed,
        totalDistanceMeters: result.totalDistanceMeters,
        totalMovingTimeSeconds: result.accepted.reduce(
          (sum, activity) => sum + activity.movingTimeSeconds,
          0,
        ),
        acceptedCount: result.accepted.length,
        rejectedCount: result.rejected.length,
        earnedCredits: result.earnedCredits,
        balanceChangeNow: result.balanceChangeNow,
        creditedNow: result.creditedNow,
        debitedNow: result.debitedNow,
        accepted: result.accepted,
        rejected: result.rejected,
      },
      balance: updatedBalance,
      onChainResult,
      onChainError,
    });
  } catch (error: any) {
    console.error("check-challenge error:", error);

    return res.status(500).json({
      ok: false,
      error: "Failed to check challenge",
      details: error?.message ?? String(error),
      code: error?.code ?? null,
      shortMessage: error?.shortMessage ?? null,
    });
  }
});

export default router;
