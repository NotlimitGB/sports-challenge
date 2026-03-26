import { prisma } from "../db/prisma.js";
import { depositAmountWeiToRewardCredits } from "../utils/challenge.js";
import { verifyChallengeProgress } from "./challengeLogic.js";

type StoredActivityLike = {
  id: string;
  name: string | null;
  sportType: string | null;
  startDate: Date;
  distanceMeters: { toString(): string } | number;
  movingTimeSeconds: number;
};

type ChallengeLike = {
  id: string;
  requiredSportType: string;
  targetDistanceMeters: number;
  minMovingTimeSeconds: number;
  challengeStartAt: Date;
  challengeEndAt: Date;
  depositAmountWei: { toString(): string } | string;
};

type ParticipantLike = {
  id: string;
  status: string;
  passed: boolean | null;
  verifiedAt: Date | null;
  earnedCredits: number;
  rewardCreditedAt: Date | null;
  onchainResultSubmitted: boolean;
};

type UserLike = {
  id: string;
  balance: number;
};

export function normalizeStoredActivities(activities: StoredActivityLike[]) {
  return activities.map((activity) => ({
    id: activity.id,
    name: activity.name,
    sportType: activity.sportType,
    startDate: activity.startDate,
    distanceMeters: Number(activity.distanceMeters),
    movingTimeSeconds: activity.movingTimeSeconds,
  }));
}

export async function refreshChallengeParticipantProgress(args: {
  user: UserLike;
  challenge: ChallengeLike;
  participant: ParticipantLike;
  activities: ReturnType<typeof normalizeStoredActivities>;
}) {
  const { user, challenge, participant, activities } = args;
  const now = new Date();
  const hasEnded = challenge.challengeEndAt.getTime() <= now.getTime();
  const rewardCredits = depositAmountWeiToRewardCredits(
    challenge.depositAmountWei,
  );
  const result = verifyChallengeProgress(activities, {
    allowedSportTypes: [challenge.requiredSportType],
    minTotalDistanceMeters: challenge.targetDistanceMeters,
    minMovingTimeSecondsPerActivity: challenge.minMovingTimeSeconds,
    startAt: challenge.challengeStartAt,
    endAt: challenge.challengeEndAt,
  });
  const nextStatus = result.passed
    ? participant.status === "claimed"
      ? "claimed"
      : "passed"
    : hasEnded
      ? participant.status === "refunded"
        ? "refunded"
        : "failed"
      : "joined";
  const nextPassed = result.passed ? true : hasEnded ? false : null;
  const nextEarnedCredits =
    nextStatus === "claimed" || nextStatus === "passed"
      ? rewardCredits
      : nextStatus === "failed"
        ? -rewardCredits
        : 0;
  const balanceChangeNow = nextEarnedCredits - participant.earnedCredits;
  const creditedNow =
    nextStatus === "claimed" || nextStatus === "passed"
      ? Math.max(0, rewardCredits - Math.max(participant.earnedCredits, 0))
      : 0;
  const debitedNow =
    nextStatus === "failed"
      ? Math.max(0, rewardCredits - Math.max(-participant.earnedCredits, 0))
      : 0;
  const nextVerifiedAt =
    nextStatus === "joined" && participant.verifiedAt === null
      ? null
      : now;
  let updatedBalance = user.balance;

  const updatedParticipant = await prisma.$transaction(async (tx) => {
    const nextParticipant = await tx.challengeParticipant.update({
      where: { id: participant.id },
      data: {
        totalDistanceMeters: Math.round(result.totalDistanceMeters),
        totalMovingTimeSeconds: result.accepted.reduce(
          (sum, activity) => sum + activity.movingTimeSeconds,
          0,
        ),
        passed: nextPassed,
        status: nextStatus,
        verifiedAt: nextVerifiedAt,
        earnedCredits: nextEarnedCredits,
        rewardCreditedAt:
          balanceChangeNow !== 0 ? now : participant.rewardCreditedAt,
      },
    });

    await tx.challengeActivityLink.deleteMany({
      where: {
        challengeId: challenge.id,
        participantId: participant.id,
      },
    });

    if (result.accepted.length > 0) {
      await tx.challengeActivityLink.createMany({
        data: result.accepted.map((activity) => ({
          challengeId: challenge.id,
          participantId: participant.id,
          activityId: activity.id,
          countedDistanceMeters: activity.distanceMeters,
          countedMovingTimeSeconds: activity.movingTimeSeconds,
        })),
        skipDuplicates: true,
      });
    }

    if (balanceChangeNow !== 0) {
      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: {
          balance: {
            increment: balanceChangeNow,
          },
        },
      });

      updatedBalance = updatedUser.balance;
    }

    return nextParticipant;
  });

  return {
    updatedParticipant,
    updatedBalance,
    rewardCredits,
    result: {
      ...result,
      earnedCredits: nextEarnedCredits,
      balanceChangeNow,
      creditedNow,
      debitedNow,
    },
  };
}

export async function refreshChallengeProgressForUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error("User not found");
  }

  const [activities, participants] = await Promise.all([
    prisma.stravaActivity.findMany({
      where: { userId: user.id },
      orderBy: { startDate: "desc" },
    }),
    prisma.challengeParticipant.findMany({
      where: { userId: user.id },
      include: {
        challenge: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const normalizedActivities = normalizeStoredActivities(activities);
  let updatedBalance = user.balance;
  const refreshed = [];

  for (const participant of participants) {
    const next = await refreshChallengeParticipantProgress({
      user: {
        id: user.id,
        balance: updatedBalance,
      },
      challenge: participant.challenge,
      participant,
      activities: normalizedActivities,
    });

    updatedBalance = next.updatedBalance;
    refreshed.push(next);
  }

  return {
    balance: updatedBalance,
    refreshed,
  };
}
