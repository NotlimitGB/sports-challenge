import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../db/prisma.js";

export type StravaTokenResponse = {
  token_type: string;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  expires_in: number;
  athlete: {
    id: number;
    firstname?: string;
    lastname?: string;
  };
};

export type StravaActivity = {
  id: number;
  name: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  start_date: string;
  sport_type?: string;
  trainer?: boolean;
  commute?: boolean;
  manual?: boolean;
};

export function getUserIdFromQuery(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("userId is required");
  }

  return value.trim();
}

export function getStravaAuthUrl(userId: string) {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const redirectUri = process.env.STRAVA_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    throw new Error("Strava OAuth environment variables are not configured");
  }

  const url = new URL("https://www.strava.com/oauth/authorize");

  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("approval_prompt", "auto");
  url.searchParams.set("scope", "read,activity:read");
  url.searchParams.set("state", userId);

  return url.toString();
}

export async function exchangeStravaCode(
  code: string,
): Promise<StravaTokenResponse> {
  const form = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID!,
    client_secret: process.env.STRAVA_CLIENT_SECRET!,
    code,
    grant_type: "authorization_code",
  });

  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Strava token exchange failed: ${response.status} ${text}`);
  }

  return response.json();
}

export async function refreshStravaToken(
  refreshToken: string,
): Promise<StravaTokenResponse> {
  const form = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID!,
    client_secret: process.env.STRAVA_CLIENT_SECRET!,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Strava token refresh failed: ${response.status} ${text}`);
  }

  return response.json();
}

export async function getStravaActivities(
  accessToken: string,
  afterUnix?: number,
  beforeUnix?: number,
): Promise<StravaActivity[]> {
  const url = new URL("https://www.strava.com/api/v3/athlete/activities");

  url.searchParams.set("per_page", "50");
  url.searchParams.set("page", "1");

  if (afterUnix) {
    url.searchParams.set("after", String(afterUnix));
  }

  if (beforeUnix) {
    url.searchParams.set("before", String(beforeUnix));
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Strava activities fetch failed: ${response.status} ${text}`,
    );
  }

  return response.json();
}

export async function syncStravaActivitiesForUser(
  userId: string,
  accessToken: string,
) {
  const activities = await getStravaActivities(accessToken);

  for (const activity of activities) {
    await prisma.stravaActivity.upsert({
      where: {
        stravaActivityId: BigInt(activity.id),
      },
      update: {
        userId,
        name: activity.name ?? null,
        sportType: activity.sport_type ?? null,
        startDate: new Date(activity.start_date),
        distanceMeters: activity.distance,
        movingTimeSeconds: activity.moving_time,
        elapsedTimeSeconds: activity.elapsed_time,
        trainer: activity.trainer ?? null,
        commute: activity.commute ?? null,
        manual: activity.manual ?? null,
        rawPayload: activity as unknown as Prisma.InputJsonValue,
      },
      create: {
        userId,
        stravaActivityId: BigInt(activity.id),
        name: activity.name ?? null,
        sportType: activity.sport_type ?? null,
        startDate: new Date(activity.start_date),
        distanceMeters: activity.distance,
        movingTimeSeconds: activity.moving_time,
        elapsedTimeSeconds: activity.elapsed_time,
        trainer: activity.trainer ?? null,
        commute: activity.commute ?? null,
        manual: activity.manual ?? null,
        rawPayload: activity as unknown as Prisma.InputJsonValue,
      },
    });
  }

  return activities.length;
}
