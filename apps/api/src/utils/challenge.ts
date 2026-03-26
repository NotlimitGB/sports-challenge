import type { ChallengeStatus } from "../generated/prisma/enums.js";

const DEMO_CREDIT_WEI = 10n ** 15n;

type DepositAmountLike = {
  toString(): string;
};

function normalizeRewardCredits(value: number | string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("rewardCredits must be a non-negative number");
  }

  return Math.round(parsed);
}

export function rewardCreditsToDepositAmountWei(value: number | string) {
  const credits = normalizeRewardCredits(value);
  return (BigInt(credits) * DEMO_CREDIT_WEI).toString();
}

export function depositAmountWeiToRewardCredits(
  value: DepositAmountLike | string,
) {
  const rawValue = typeof value === "string" ? value : value.toString();
  return Number(BigInt(rawValue) / DEMO_CREDIT_WEI);
}

export function resolveChallengeStatus(
  challengeStartAt: Date,
  challengeEndAt: Date,
  registrationDeadline: Date,
  now = new Date(),
): ChallengeStatus {
  if (challengeEndAt.getTime() < now.getTime()) {
    return "finalized";
  }

  if (challengeStartAt.getTime() <= now.getTime()) {
    return "active";
  }

  if (registrationDeadline.getTime() >= now.getTime()) {
    return "registration";
  }

  return "registration";
}

export function serializeChallenge<
  T extends {
    depositAmountWei: DepositAmountLike;
    registrationDeadline: Date;
    challengeStartAt: Date;
    challengeEndAt: Date;
    status: string;
  },
>(challenge: T) {
  return {
    ...challenge,
    depositAmountWei: challenge.depositAmountWei.toString(),
    rewardCredits: depositAmountWeiToRewardCredits(challenge.depositAmountWei),
    registrationDeadline: challenge.registrationDeadline.toISOString(),
    challengeStartAt: challenge.challengeStartAt.toISOString(),
    challengeEndAt: challenge.challengeEndAt.toISOString(),
    status: resolveChallengeStatus(
      challenge.challengeStartAt,
      challenge.challengeEndAt,
      challenge.registrationDeadline,
    ),
  };
}
