type SimpleChallengeRule = {
  allowedSportTypes: string[];
  minTotalDistanceMeters: number;
  minMovingTimeSecondsPerActivity: number;
  startAt: Date;
  endAt: Date;
};

type ActivityLike = {
  id: string;
  name: string | null;
  sportType: string | null;
  startDate: Date;
  distanceMeters: number;
  movingTimeSeconds: number;
};

const SPORT_TYPE_ALIASES: Record<string, string[]> = {
  activity: ["activity", "workout", "walk", "hike", "run", "ride"],
  hike: ["hike", "walk"],
  ride: ["ride", "virtualride", "ebikeride", "mountainbikeride", "gravelride"],
  run: ["run", "trailrun", "virtualrun"],
  walk: ["walk", "hike"],
};

function normalizeSportType(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/[\s_-]+/g, "") ?? "";
}

function isAllowedSportType(
  activitySportType: string | null,
  allowedSportTypes: string[],
) {
  const normalizedActivityType = normalizeSportType(activitySportType);

  if (!normalizedActivityType) {
    return false;
  }

  return allowedSportTypes.some((allowedType) => {
    const normalizedAllowedType = normalizeSportType(allowedType);
    const aliases =
      SPORT_TYPE_ALIASES[normalizedAllowedType] ?? [normalizedAllowedType];

    return aliases.includes(normalizedActivityType);
  });
}

export function verifyChallengeProgress(
  activities: ActivityLike[],
  rule: SimpleChallengeRule,
) {
  const accepted: ActivityLike[] = [];
  const rejected: Array<{ activity: ActivityLike; reason: string }> = [];

  for (const activity of activities) {
    if (!isAllowedSportType(activity.sportType, rule.allowedSportTypes)) {
      rejected.push({ activity, reason: "wrong_sport_type" });
      continue;
    }

    if (activity.startDate < rule.startAt || activity.startDate > rule.endAt) {
      rejected.push({ activity, reason: "outside_challenge_window" });
      continue;
    }

    if (activity.movingTimeSeconds < rule.minMovingTimeSecondsPerActivity) {
      rejected.push({ activity, reason: "too_short" });
      continue;
    }

    accepted.push(activity);
  }

  const totalDistanceMeters = accepted.reduce(
    (sum, activity) => sum + activity.distanceMeters,
    0,
  );

  return {
    passed: totalDistanceMeters >= rule.minTotalDistanceMeters,
    totalDistanceMeters,
    accepted,
    rejected,
  };
}
