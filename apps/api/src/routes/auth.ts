import { Router } from "express";
import { prisma } from "../db/prisma.js";
import type { ParticipantStatus } from "../generated/prisma/enums.js";
import {
  exchangeStravaCode,
  getStravaAuthUrl,
  syncStravaActivitiesForUser,
} from "../services/strava.js";
import { getUserIdFromQuery } from "../utils/user.js";

const router = Router();

const participantStatusPriority: Record<ParticipantStatus, number> = {
  joined: 1,
  failed: 2,
  refunded: 3,
  passed: 4,
  claimed: 5,
};

function pickParticipantStatus(
  currentStatus: ParticipantStatus,
  incomingStatus: ParticipantStatus,
) {
  return participantStatusPriority[currentStatus] >=
    participantStatusPriority[incomingStatus]
    ? currentStatus
    : incomingStatus;
}

function pickPassedState(
  currentPassed: boolean | null,
  incomingPassed: boolean | null,
) {
  if (currentPassed === true || incomingPassed === true) {
    return true;
  }

  if (currentPassed === false || incomingPassed === false) {
    return false;
  }

  return null;
}

function pickLatestDate(currentDate: Date | null, incomingDate: Date | null) {
  if (!currentDate) return incomingDate;
  if (!incomingDate) return currentDate;

  return currentDate >= incomingDate ? currentDate : incomingDate;
}

function pickEarliestDate(currentDate: Date, incomingDate: Date) {
  return currentDate <= incomingDate ? currentDate : incomingDate;
}

function pickValueByParticipantStatus<T>(
  currentStatus: ParticipantStatus,
  incomingStatus: ParticipantStatus,
  currentValue: T,
  incomingValue: T,
) {
  return participantStatusPriority[currentStatus] >=
    participantStatusPriority[incomingStatus]
    ? currentValue
    : incomingValue;
}

router.get("/strava/login", async (req, res) => {
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

    const authUrl = getStravaAuthUrl(userId);
    return res.redirect(authUrl);
  } catch (error: any) {
    return res.status(400).json({
      ok: false,
      error: error?.message ?? "Invalid userId",
    });
  }
});

router.get("/strava/callback", async (req, res) => {
  try {
    const code = req.query.code as string | undefined;
    const grantedScope = (req.query.scope as string | undefined) ?? "";
    const state = req.query.state as string | undefined;

    if (!code) {
      return res.status(400).json({
        ok: false,
        error: "Missing code",
      });
    }

    if (!state) {
      return res.status(400).json({
        ok: false,
        error: "Missing state",
      });
    }

    const userId = getUserIdFromQuery(state);

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({
        ok: false,
        error: "User not found",
      });
    }

    const tokenData = await exchangeStravaCode(code);
    const athleteId = BigInt(tokenData.athlete.id);

    const existingByAthlete = await prisma.user.findUnique({
      where: { stravaAthleteId: athleteId },
      include: { stravaToken: true },
    });

    if (existingByAthlete && existingByAthlete.id !== user.id) {
      await prisma.$transaction(async (tx) => {
        const oldParticipants = await tx.challengeParticipant.findMany({
          where: { userId: existingByAthlete.id },
        });

        const newParticipants = await tx.challengeParticipant.findMany({
          where: { userId: user.id },
        });
        const newParticipantsByChallengeId = new Map(
          newParticipants.map((participant) => [participant.challengeId, participant]),
        );

        for (const oldParticipant of oldParticipants) {
          const currentParticipant = newParticipantsByChallengeId.get(
            oldParticipant.challengeId,
          );

          if (!currentParticipant) {
            const movedParticipant = await tx.challengeParticipant.update({
              where: { id: oldParticipant.id },
              data: { userId: user.id },
            });

            newParticipantsByChallengeId.set(
              movedParticipant.challengeId,
              movedParticipant,
            );
            continue;
          }

          await tx.challengeActivityLink.updateMany({
            where: { participantId: oldParticipant.id },
            data: { participantId: currentParticipant.id },
          });

          await tx.challengeParticipant.update({
            where: { id: currentParticipant.id },
            data: {
              joinedAt: pickEarliestDate(
                currentParticipant.joinedAt,
                oldParticipant.joinedAt,
              ),
              joinedTxHash:
                currentParticipant.joinedTxHash ?? oldParticipant.joinedTxHash,
              totalDistanceMeters: Math.max(
                currentParticipant.totalDistanceMeters,
                oldParticipant.totalDistanceMeters,
              ),
              totalMovingTimeSeconds: Math.max(
                currentParticipant.totalMovingTimeSeconds,
                oldParticipant.totalMovingTimeSeconds,
              ),
              passed: pickPassedState(
                currentParticipant.passed,
                oldParticipant.passed,
              ),
              status: pickParticipantStatus(
                currentParticipant.status,
                oldParticipant.status,
              ),
              verifiedAt: pickLatestDate(
                currentParticipant.verifiedAt,
                oldParticipant.verifiedAt,
              ),
              earnedCredits: pickValueByParticipantStatus(
                currentParticipant.status,
                oldParticipant.status,
                currentParticipant.earnedCredits,
                oldParticipant.earnedCredits,
              ),
              rewardCreditedAt: pickValueByParticipantStatus(
                currentParticipant.status,
                oldParticipant.status,
                currentParticipant.rewardCreditedAt,
                oldParticipant.rewardCreditedAt,
              ),
              onchainResultSubmitted:
                currentParticipant.onchainResultSubmitted ||
                oldParticipant.onchainResultSubmitted,
              claimedTxHash:
                currentParticipant.claimedTxHash ?? oldParticipant.claimedTxHash,
            },
          });

          await tx.challengeParticipant.delete({
            where: { id: oldParticipant.id },
          });
        }

        await tx.user.update({
          where: { id: existingByAthlete.id },
          data: {
            stravaAthleteId: null,
            stravaFirstname: null,
            stravaLastname: null,
          },
        });

        await tx.user.update({
          where: { id: user.id },
          data: {
            balance: existingByAthlete.balance,
          },
        });

        await tx.stravaActivity.updateMany({
          where: { userId: existingByAthlete.id },
          data: { userId: user.id },
        });

        if (existingByAthlete.stravaToken) {
          await tx.stravaToken.delete({
            where: { userId: existingByAthlete.id },
          });
        }
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        stravaAthleteId: athleteId,
        stravaFirstname: tokenData.athlete.firstname ?? null,
        stravaLastname: tokenData.athlete.lastname ?? null,
      },
    });

    await prisma.stravaToken.upsert({
      where: { userId: updatedUser.id },
      update: {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: new Date(tokenData.expires_at * 1000),
        scope: grantedScope,
      },
      create: {
        userId: updatedUser.id,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: new Date(tokenData.expires_at * 1000),
        scope: grantedScope,
      },
    });

    try {
      await syncStravaActivitiesForUser(updatedUser.id, tokenData.access_token);
    } catch (syncError) {
      console.error("Initial Strava sync after auth failed:", syncError);
    }

    const redirectUrl = new URL(
      process.env.FRONTEND_URL || "http://127.0.0.1:5173",
    );
    redirectUrl.searchParams.set("userId", updatedUser.id);
    redirectUrl.searchParams.set("strava", "connected");

    return res.redirect(redirectUrl.toString());
  } catch (error: any) {
    console.error("Strava callback error:", error);

    return res.status(500).json({
      ok: false,
      error: "Strava callback failed",
      details: error?.message ?? String(error),
    });
  }
});

export default router;
