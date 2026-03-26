const DEMO_CREDIT_WEI_MULTIPLIER = 10n ** 15n;

export function creditsToDepositWei(credits: number) {
  const normalizedCredits = Math.max(0, Math.floor(credits));
  return (BigInt(normalizedCredits) * DEMO_CREDIT_WEI_MULTIPLIER).toString();
}

export function depositWeiToCredits(value: { toString(): string } | string) {
  const rawValue = typeof value === "string" ? value : value.toString();

  try {
    return Number(BigInt(rawValue) / DEMO_CREDIT_WEI_MULTIPLIER);
  } catch {
    return 0;
  }
}

export function serializeChallenge<T extends { depositAmountWei: { toString(): string } }>(
  challenge: T,
) {
  return {
    ...challenge,
    depositAmountWei: challenge.depositAmountWei.toString(),
    rewardCredits: depositWeiToCredits(challenge.depositAmountWei),
  };
}
