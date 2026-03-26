import { useEffect, useState } from "react";
import "./App.css";

type Challenge = {
  id: string;
  title: string;
  description?: string | null;
  requiredSportType: string;
  targetDistanceMeters: number;
  minMovingTimeSeconds: number;
  status: string;
  rewardCredits: number;
  registrationDeadline: string;
  challengeStartAt: string;
  challengeEndAt: string;
};

type Activity = {
  id: string;
  name: string | null;
  sportType: string | null;
  startDate: string;
  distanceMeters: number;
  movingTimeSeconds: number;
};

type DemoUser = {
  id: string;
  displayName: string | null;
  balance: number;
  walletAddress: string | null;
  demoWalletLabel?: string | null;
  contractReady?: boolean;
  stravaAthleteId: string | null;
  stravaFirstname?: string | null;
  stravaLastname?: string | null;
};

type SavedDemoProfile = Pick<
  DemoUser,
  "id" | "displayName" | "balance" | "walletAddress" | "demoWalletLabel"
>;

type ContractSnapshot = {
  available: boolean;
  contractAddress: string | null;
  participantWallet: string | null;
  demoWalletLabel: string | null;
  joined: boolean;
  verified: boolean;
  passed: boolean;
  claimed: boolean;
  participantCount: number | null;
  depositAmountWei: string | null;
  totalPoolWei: string | null;
  finalized: boolean;
  error: string | null;
};

type ChallengeHistoryEntry = {
  id: string;
  challengeId: string;
  joinedAt: string;
  verifiedAt: string | null;
  passed: boolean | null;
  status: string;
  result: string;
  totalDistanceMeters: number;
  totalMovingTimeSeconds: number;
  countedActivities: number;
  rewardCredits: number;
  earnedCredits: number;
  challenge: Challenge;
};

type ChallengeFormState = {
  title: string;
  description: string;
  requiredSportType: string;
  targetDistanceMeters: string;
  minMovingTimeSeconds: string;
  rewardCredits: string;
  registrationDeadline: string;
  challengeStartAt: string;
  challengeEndAt: string;
  autoJoin: boolean;
};

const API_URL = "http://127.0.0.1:4000";
const SAVED_PROFILES_STORAGE_KEY = "sports-challenge-demo-profiles";

function readSavedProfiles() {
  if (typeof window === "undefined") {
    return [] as SavedDemoProfile[];
  }

  try {
    const rawValue = window.localStorage.getItem(SAVED_PROFILES_STORAGE_KEY);

    if (!rawValue) {
      return [] as SavedDemoProfile[];
    }

    const parsedValue = JSON.parse(rawValue);

    if (!Array.isArray(parsedValue)) {
      return [] as SavedDemoProfile[];
    }

    return parsedValue
      .filter(
        (profile): profile is SavedDemoProfile =>
          profile &&
          typeof profile === "object" &&
          typeof profile.id === "string" &&
          typeof profile.displayName !== "undefined",
      )
      .slice(0, 8);
  } catch (error) {
    console.error("Failed to read saved demo profiles", error);
    return [] as SavedDemoProfile[];
  }
}

function persistSavedProfiles(profiles: SavedDemoProfile[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    SAVED_PROFILES_STORAGE_KEY,
    JSON.stringify(profiles.slice(0, 8)),
  );
}

function toSavedDemoProfile(user: DemoUser): SavedDemoProfile {
  return {
    id: user.id,
    displayName: user.displayName,
    balance: user.balance,
    walletAddress: user.walletAddress,
    demoWalletLabel: user.demoWalletLabel ?? null,
  };
}

function upsertSavedProfiles(
  profiles: SavedDemoProfile[],
  nextProfile: DemoUser,
) {
  return [
    toSavedDemoProfile(nextProfile),
    ...profiles.filter((profile) => profile.id !== nextProfile.id),
  ].slice(0, 8);
}

function formatCompactId(
  value: string | null | undefined,
  startLength = 6,
  endLength = 4,
) {
  if (!value) {
    return "не назначен";
  }

  if (value.length <= startLength + endLength + 1) {
    return value;
  }

  return `${value.slice(0, startLength)}...${value.slice(-endLength)}`;
}

function formatWalletAddress(value: string | null | undefined) {
  if (!value) {
    return "Тестовый адрес еще не назначен";
  }

  return formatCompactId(value, 8, 6);
}

function formatMeters(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 км";

  const kilometers = value / 1000;
  const digits = kilometers >= 10 ? 0 : 1;

  return `${kilometers.toFixed(digits)} км`;
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0 мин";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);

  if (hours === 0) {
    return `${Math.max(minutes, 1)} мин`;
  }

  if (minutes === 0) {
    return `${hours} ч`;
  }

  return `${hours} ч ${minutes} мин`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDateRange(startAt: string, endAt: string) {
  return `${formatDate(startAt)} - ${formatDate(endAt)}`;
}

function formatStatus(status: string) {
  const normalized = status
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const statusLabels: Record<string, string> = {
    active: "Активен",
    cancelled: "Отменен",
    connected: "Подключено",
    draft: "Черновик",
    failed: "Не выполнен",
    finalized: "Завершен",
    in_progress: "В процессе",
    joined: "Участвует",
    missing: "Отсутствует",
    passed: "Выполнен",
    ready: "Готово",
    refunded: "Возвращен",
    registration: "Регистрация",
    synced: "Синхронизировано",
    verification: "Проверка",
  };

  return (
    statusLabels[normalized] ??
    status.replace(/[_-]+/g, " ").replace(/^\S/, (char) => char.toUpperCase())
  );
}

function getStatusTone(status: string) {
  const normalized = status.toLowerCase();

  if (!status) return "neutral";
  if (
    [
      "failed",
      "error",
      "missing",
      "ошиб",
      "не удалось",
      "не найден",
      "не выполн",
    ].some((item) => normalized.includes(item))
  ) {
    return "error";
  }
  if (
    [
      "connected",
      "joined",
      "synced",
      "passed",
      "active",
      "ready",
      "подключ",
      "вступ",
      "синхрон",
      "выполнен",
      "готов",
      "создан",
      "загруж",
    ].some((item) => normalized.includes(item))
  ) {
    return "success";
  }

  return "neutral";
}

function formatCredits(value: number) {
  const pluralRules = new Intl.PluralRules("ru-RU");
  const rule = pluralRules.select(Math.abs(value));
  const suffix =
    rule === "one" ? "кредит" : rule === "few" ? "кредита" : "кредитов";

  return `${value} ${suffix}`;
}

function formatSportType(value: string | null | undefined) {
  const sportTypeLabels: Record<string, string> = {
    Activity: "Активность",
    Hike: "Поход",
    Ride: "Велозаезд",
    Run: "Бег",
    Unknown: "Неизвестно",
    Walk: "Ходьба",
  };

  if (!value) {
    return "Неизвестно";
  }

  return sportTypeLabels[value] ?? value;
}

function localizeDemoProfileName(value: string | null | undefined) {
  if (!value) {
    return "Демо-спортсмен";
  }

  return value.replace(/^Demo Runner\b/, "Демо-спортсмен");
}

function localizeChallengeText(value: string | null | undefined) {
  if (!value) {
    return value ?? "";
  }

  const knownTexts: Record<string, string> = {
    "Connect Strava, sync your activities, and cover at least 3 km during the active demo window.":
      "Подключите Strava, синхронизируйте активности и пройдите минимум 3 км в пределах активного демо-челленджа.",
    "Demo walking challenge": "Демо-челлендж по ходьбе",
    "Retro test challenge": "Ретро-челлендж для теста",
    "Use backdated dates to quickly verify Strava activities and demo rewards.":
      "Используйте прошлые даты, чтобы быстро проверить активности из Strava и начисление демо-наград.",
  };

  return knownTexts[value] ?? value;
}

function updateUrlSession(userId: string, stravaConnected = false) {
  const url = new URL(window.location.href);
  url.searchParams.set("userId", userId);

  if (stravaConnected) {
    url.searchParams.set("strava", "connected");
  } else {
    url.searchParams.delete("strava");
  }

  window.history.replaceState({}, "", url);
}

function clearUrlSession() {
  const url = new URL(window.location.href);
  url.searchParams.delete("userId");
  url.searchParams.delete("strava");
  window.history.replaceState({}, "", url);
}

function toDateTimeInputValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function buildDefaultChallengeForm(): ChallengeFormState {
  const now = new Date();
  const registrationDeadline = new Date(now);
  registrationDeadline.setHours(registrationDeadline.getHours() - 2);

  const challengeStartAt = new Date(now);
  challengeStartAt.setDate(challengeStartAt.getDate() - 7);

  const challengeEndAt = new Date(now);
  challengeEndAt.setDate(challengeEndAt.getDate() + 1);

  return {
    title: "Ретро-челлендж для теста",
    description: "Опиши свой челендж",
    requiredSportType: "Walk",
    targetDistanceMeters: "3000",
    minMovingTimeSeconds: "60",
    rewardCredits: "25",
    registrationDeadline: toDateTimeInputValue(registrationDeadline),
    challengeStartAt: toDateTimeInputValue(challengeStartAt),
    challengeEndAt: toDateTimeInputValue(challengeEndAt),
    autoJoin: true,
  };
}

export default function App() {
  const [initialSession] = useState(() => {
    const params = new URLSearchParams(window.location.search);

    return {
      userId: params.get("userId") ?? "",
      stravaConnected: params.get("strava") === "connected",
    };
  });

  const [userId, setUserId] = useState(initialSession.userId);
  const [demoUser, setDemoUser] = useState<DemoUser | null>(null);
  const [savedProfiles, setSavedProfiles] = useState<SavedDemoProfile[]>(() =>
    readSavedProfiles(),
  );
  const [contractSnapshot, setContractSnapshot] = useState<ContractSnapshot | null>(
    null,
  );
  const [status, setStatus] = useState(
    initialSession.stravaConnected
      ? "Strava подключена к демо-профилю"
      : "Подготавливаем демо-профиль",
  );
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [challengeHistory, setChallengeHistory] = useState<
    ChallengeHistoryEntry[]
  >([]);
  const [selectedChallengeId, setSelectedChallengeId] = useState("");
  const [challengeForm, setChallengeForm] = useState(() =>
    buildDefaultChallengeForm(),
  );
  const [isCreatingChallenge, setIsCreatingChallenge] = useState(false);
  const [activeAction, setActiveAction] = useState<
    | "refresh"
    | "newProfile"
    | "switchProfile"
    | "join"
    | "joinContract"
    | "sync"
    | "check"
    | null
  >(null);

  const selectedChallengeProgress =
    challengeHistory.find(
      (entry) => entry.challengeId === selectedChallengeId,
    ) ?? null;
  const activeChallenges = challenges.filter(
    (challenge) => new Date(challenge.challengeEndAt).getTime() > Date.now(),
  );
  const joinedChallengeIds = new Set(
    challengeHistory.map((entry) => entry.challengeId),
  );
  const availableChallenges = activeChallenges.filter(
    (challenge) => !joinedChallengeIds.has(challenge.id),
  );
  const selectedAvailableChallenge =
    availableChallenges.find((challenge) => challenge.id === selectedChallengeId) ??
    null;
  const selectedChallenge =
    activeChallenges.find((challenge) => challenge.id === selectedChallengeId) ??
    selectedChallengeProgress?.challenge ??
    null;
  const totalDistanceMeters = activities.reduce(
    (sum, activity) => sum + activity.distanceMeters,
    0,
  );
  const totalMovingTimeSeconds = activities.reduce(
    (sum, activity) => sum + activity.movingTimeSeconds,
    0,
  );
  const passedChallenges = challengeHistory.filter(
    (entry) => entry.passed,
  ).length;
  const earnedCredits = challengeHistory.reduce(
    (sum, entry) => sum + entry.earnedCredits,
    0,
  );
  const statusTone = getStatusTone(status);
  const profileName = localizeDemoProfileName(demoUser?.displayName);
  const hasSavedProfiles = savedProfiles.length > 1;
  const stravaName =
    [demoUser?.stravaFirstname, demoUser?.stravaLastname]
      .filter(Boolean)
      .join(" ")
      .trim() || "Не подключено";

  const contractStatusLabel = !contractSnapshot?.available
    ? "Недоступен"
    : contractSnapshot.joined
      ? "Участвует"
      : "Не присоединился";
  const contractMetaText = !contractSnapshot?.available
    ? contractSnapshot?.error || "Нужен локальный RPC и адрес контракта."
    : `${contractSnapshot.participantCount ?? 0} участников | депозит ${formatCompactId(
        contractSnapshot.depositAmountWei,
        7,
        4,
      )} wei`;

  function rememberProfile(profile: DemoUser) {
    setSavedProfiles((currentProfiles) => {
      const nextProfiles = upsertSavedProfiles(currentProfiles, profile);
      persistSavedProfiles(nextProfiles);
      return nextProfiles;
    });
  }

  function removeSavedProfile(profileId: string) {
    const nextProfiles = savedProfiles.filter((profile) => profile.id !== profileId);
    persistSavedProfiles(nextProfiles);
    setSavedProfiles(nextProfiles);
    return nextProfiles;
  }

  async function refreshWorkspace(targetUserId = userId) {
    if (!targetUserId) {
      return;
    }

    await Promise.all([loadChallenges(), loadActivities(targetUserId)]);
    await loadDemoUser(targetUserId);
    await Promise.all([
      loadChallengeHistory(targetUserId),
      loadContractStatus(targetUserId),
    ]);
  }

  async function createDemoSession() {
    const res = await fetch(`${API_URL}/demo/start`, {
      method: "POST",
    });
    const data = await res.json();

    if (!data.ok) {
      throw new Error(data.error || "Не удалось создать демо-профиль");
    }

    const nextUser = data.user as DemoUser;
    updateUrlSession(nextUser.id);
    setUserId(nextUser.id);
    setDemoUser(nextUser);
    rememberProfile(nextUser);
    setActivities([]);
    setChallengeHistory([]);
    setContractSnapshot(null);
    setStatus("Демо-профиль создан");

    return nextUser.id;
  }

  async function loadDemoUser(targetUserId: string) {
    const res = await fetch(`${API_URL}/demo/me?userId=${targetUserId}`);
    const data = await res.json();

    if (!data.ok) {
      throw new Error(data.error || "Не удалось загрузить демо-профиль");
    }

    const nextUser = data.user as DemoUser;
    setDemoUser(nextUser);
    rememberProfile(nextUser);

    return nextUser;
  }

  async function loadContractStatus(targetUserId = userId) {
    if (!targetUserId) return;

    const res = await fetch(`${API_URL}/demo/contract-status?userId=${targetUserId}`);
    const data = await res.json();

    if (!data.ok) {
      throw new Error(data.error || "Не удалось загрузить статус контракта");
    }

    setContractSnapshot(data.contract as ContractSnapshot);
  }

  async function loadChallenges() {
    const res = await fetch(`${API_URL}/challenge/list`);
    const data = await res.json();

    if (!data.ok) {
      throw new Error(data.error || "Не удалось загрузить челленджи");
    }

    setChallenges(data.challenges);
    setSelectedChallengeId((currentId) => {
      if (
        data.challenges.some(
          (challenge: Challenge) => challenge.id === currentId,
        )
      ) {
        return currentId;
      }

      return data.challenges[0]?.id ?? "";
    });
  }

  async function loadActivities(targetUserId = userId) {
    if (!targetUserId) return;

    const res = await fetch(
      `${API_URL}/strava/activities?userId=${targetUserId}`,
    );
    const data = await res.json();

    if (!data.ok) {
      throw new Error(data.error || "Не удалось загрузить активности");
    }

    setActivities(data.activities);
  }

  async function loadChallengeHistory(targetUserId = userId) {
    if (!targetUserId) return;

    const res = await fetch(
      `${API_URL}/challenge/history?userId=${targetUserId}`,
    );
    const data = await res.json();

    if (!data.ok) {
      throw new Error(data.error || "Не удалось загрузить историю челленджей");
    }

    setChallengeHistory(data.history);

    if (typeof data.balance === "number") {
      setDemoUser((currentUser) =>
        currentUser
          ? {
              ...currentUser,
              balance: data.balance,
            }
          : currentUser,
      );
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        let activeUserId = initialSession.userId;

        if (!activeUserId) {
          const res = await fetch(`${API_URL}/demo/start`, {
            method: "POST",
          });
          const data = await res.json();

          if (!data.ok) {
            throw new Error(data.error || "Не удалось создать демо-профиль");
          }

          const nextUser = data.user as DemoUser;
          activeUserId = nextUser.id;
          updateUrlSession(activeUserId);

          if (!cancelled) {
            setUserId(activeUserId);
            setDemoUser(nextUser);
            rememberProfile(nextUser);
            setActivities([]);
            setChallengeHistory([]);
            setContractSnapshot(null);
          }
        }

        if (cancelled) {
          return;
        }

        const [
          demoUserResponse,
          challengesResponse,
          historyResponse,
          activitiesResponse,
          contractStatusResponse,
        ] = await Promise.all([
          fetch(`${API_URL}/demo/me?userId=${activeUserId}`),
          fetch(`${API_URL}/challenge/list`),
          fetch(`${API_URL}/challenge/history?userId=${activeUserId}`),
          fetch(`${API_URL}/strava/activities?userId=${activeUserId}`),
          fetch(`${API_URL}/demo/contract-status?userId=${activeUserId}`),
        ]);

        const demoUserData = await demoUserResponse.json();
        const challengesData = await challengesResponse.json();
        const historyData = await historyResponse.json();
        const activitiesData = await activitiesResponse.json();
        const contractStatusData = await contractStatusResponse.json();

        if (!cancelled && demoUserData.ok) {
          const nextUser = demoUserData.user as DemoUser;
          setDemoUser(nextUser);
          rememberProfile(nextUser);
        }

        if (!cancelled && challengesData.ok) {
          setChallenges(challengesData.challenges);
          setSelectedChallengeId((currentId) => {
            if (
              challengesData.challenges.some(
                (challenge: Challenge) => challenge.id === currentId,
              )
            ) {
              return currentId;
            }

            return challengesData.challenges[0]?.id ?? "";
          });
        }

        if (!cancelled && historyData.ok) {
          setChallengeHistory(historyData.history);

          if (typeof historyData.balance === "number") {
            setDemoUser((currentUser) =>
              currentUser
                ? {
                    ...currentUser,
                    balance: historyData.balance,
                  }
                : currentUser,
            );
          }
        }

        if (!cancelled && activitiesData.ok) {
          setActivities(activitiesData.activities);
        }

        if (!cancelled && contractStatusData.ok) {
          setContractSnapshot(contractStatusData.contract as ContractSnapshot);
        }

        if (!cancelled) {
          setStatus(
            initialSession.stravaConnected
              ? "Strava подключена к демо-профилю"
              : "Демо-профиль готов",
          );
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setStatus("Не удалось запустить демо-профиль");
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [initialSession.stravaConnected, initialSession.userId]);

  async function startFreshDemoSession() {
    setActiveAction("newProfile");

    try {
      const nextUserId = await createDemoSession();
      setSelectedChallengeId("");

      await refreshWorkspace(nextUserId);

      setStatus("Новый демо-профиль создан");
    } catch (error) {
      console.error(error);
      setStatus("Не удалось создать новый демо-профиль");
    } finally {
      setActiveAction(null);
    }
  }

  async function switchDemoProfile(nextUserId: string) {
    if (!nextUserId || nextUserId === userId) {
      return;
    }

    setActiveAction("switchProfile");
    setStatus("Переключаем demo-профиль");
    updateUrlSession(nextUserId);
    setUserId(nextUserId);
    setActivities([]);
    setChallengeHistory([]);
    setContractSnapshot(null);

    try {
      await refreshWorkspace(nextUserId);
      setStatus("Профиль переключен");
    } catch (error) {
      console.error(error);
      setStatus("Не удалось переключить профиль");
    } finally {
      setActiveAction(null);
    }
  }

  async function removeCurrentSavedProfile() {
    if (!userId) {
      setStatus("Нет активного demo-профиля для удаления");
      return;
    }

    const nextProfiles = removeSavedProfile(userId);
    const nextActiveProfile = nextProfiles[0];

    if (nextActiveProfile) {
      await switchDemoProfile(nextActiveProfile.id);
      return;
    }

    clearUrlSession();
    setUserId("");
    setDemoUser(null);
    setActivities([]);
    setChallengeHistory([]);
    setContractSnapshot(null);
    setSelectedChallengeId("");
    setStatus("Профиль удален из локального списка");
  }

  function connectStrava() {
    if (!userId) {
      setStatus("Демо-профиль еще загружается");
      return;
    }

    window.location.href = `${API_URL}/auth/strava/login?userId=${userId}`;
  }

  async function joinContract() {
    if (!userId) {
      setStatus("Демо-профиль еще загружается");
      return;
    }

    setActiveAction("joinContract");

    try {
      const res = await fetch(`${API_URL}/demo/join-contract`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
        }),
      });
      const data = await res.json();

      if (!data.ok) {
        if (data.contract) {
          setContractSnapshot(data.contract as ContractSnapshot);
        }
        setStatus(data.error || "Не удалось войти в тестовый контракт");
        return;
      }

      setContractSnapshot(data.contract as ContractSnapshot);
      await loadDemoUser(userId);

      if (data.alreadyJoined) {
        setStatus("Этот demo-профиль уже участвует в тестовом контракте");
        return;
      }

      const txHash = data.joinResult?.txHash
        ? formatCompactId(data.joinResult.txHash, 10, 8)
        : "без tx";

      setStatus(`Demo-профиль вошел в контракт. Tx: ${txHash}`);
    } catch (error) {
      console.error(error);
      setStatus("Не удалось войти в тестовый контракт");
    } finally {
      setActiveAction(null);
    }
  }

  async function joinChallenge() {
    if (!userId || !selectedAvailableChallenge) {
      setStatus("Выберите челлендж для демо-профиля");
      return;
    }

    setActiveAction("join");

    try {
      const res = await fetch(`${API_URL}/challenge/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          challengeId: selectedAvailableChallenge.id,
        }),
      });

      const data = await res.json();

      if (!data.ok) {
        setStatus(data.error || "Не удалось вступить в челлендж");
        return;
      }

      await Promise.all([loadChallengeHistory(userId), loadChallenges()]);
      setStatus(
        `Вы вступили в челлендж «${localizeChallengeText(data.challenge.title)}»`,
      );
    } catch (error) {
      console.error(error);
      setStatus("Не удалось вступить в челлендж");
    } finally {
      setActiveAction(null);
    }
  }

  async function syncActivities() {
    if (!userId) {
      setStatus("Демо-профиль еще загружается");
      return;
    }

    setActiveAction("sync");

    try {
      const res = await fetch(
        `${API_URL}/strava/sync-activities?userId=${userId}`,
      );
      const data = await res.json();

      if (data.ok) {
        setStatus(`Активности синхронизированы: ${data.saved}`);
        await Promise.all([
          loadActivities(userId),
          loadDemoUser(userId),
          loadChallengeHistory(userId),
          loadChallenges(),
          loadContractStatus(userId),
        ]);
      } else {
        setStatus(data.error || "Не удалось синхронизировать активности");
      }
    } catch (error) {
      console.error(error);
      setStatus("Не удалось синхронизировать активности");
    } finally {
      setActiveAction(null);
    }
  }

  async function checkChallenge() {
    if (!userId || !selectedChallengeId) {
      setStatus("Выберите челлендж для демо-профиля");
      return;
    }

    setActiveAction("check");

    try {
      const res = await fetch(
        `${API_URL}/strava/check-challenge?userId=${userId}&challengeId=${selectedChallengeId}`,
      );
      const data = await res.json();

      if (!data.ok) {
        setStatus(data.error || "Не удалось проверить челлендж");
        return;
      }

      setDemoUser((currentUser) =>
        currentUser
          ? {
              ...currentUser,
              balance: data.balance,
            }
          : currentUser,
      );

      await Promise.all([
        loadDemoUser(userId),
        loadChallengeHistory(userId),
        loadContractStatus(userId),
      ]);

      if (data.result.passed) {
        const rewardNote = data.result.balanceChangeNow > 0
          ? ` Награда: +${formatCredits(data.result.creditedNow)}.`
          : data.result.earnedCredits
            ? ` Награда уже начислена: ${formatCredits(data.result.earnedCredits)}.`
            : "";

        setStatus(
          `Челлендж выполнен. Дистанция: ${formatMeters(data.result.totalDistanceMeters)}.${rewardNote}`,
        );
        return;
      }

      if (data.participant.status === "failed") {
        setStatus(
          "Окно челленджа завершилось: подтвержденной дистанции не хватило",
        );
      } else {
        setStatus("Челлендж еще в процессе");
      }
    } catch (error) {
      console.error(error);
      setStatus("Не удалось проверить челлендж");
    } finally {
      setActiveAction(null);
    }
  }

  async function refreshCurrentWorkspace() {
    if (!userId) {
      return;
    }

    setActiveAction("refresh");

    try {
      await refreshWorkspace(userId);
      setStatus(
        "\u0414\u0430\u043d\u043d\u044b\u0435 \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u044b",
      );
    } catch (error) {
      console.error(error);
      setStatus(
        "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u0434\u0430\u043d\u043d\u044b\u0435",
      );
    } finally {
      setActiveAction(null);
    }
  }

  async function createChallenge() {
    if (!userId) {
      setStatus("Демо-профиль еще загружается");
      return;
    }

    setIsCreatingChallenge(true);

    try {
      const res = await fetch(`${API_URL}/challenge/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          title: challengeForm.title,
          description: challengeForm.description,
          requiredSportType: challengeForm.requiredSportType,
          targetDistanceMeters: Number(challengeForm.targetDistanceMeters),
          minMovingTimeSeconds: Number(challengeForm.minMovingTimeSeconds),
          rewardCredits: Number(challengeForm.rewardCredits),
          registrationDeadline: new Date(
            challengeForm.registrationDeadline,
          ).toISOString(),
          challengeStartAt: new Date(
            challengeForm.challengeStartAt,
          ).toISOString(),
          challengeEndAt: new Date(challengeForm.challengeEndAt).toISOString(),
          autoJoin: challengeForm.autoJoin,
        }),
      });

      const data = await res.json();

      if (!data.ok) {
        setStatus(data.error || "Не удалось создать челлендж");
        return;
      }

      setSelectedChallengeId(data.challenge.id);
      await Promise.all([loadChallenges(), loadChallengeHistory(userId)]);
      setChallengeForm(buildDefaultChallengeForm());
      setStatus(
        data.participant
          ? "Челлендж создан и добавлен в вашу историю"
          : "Челлендж создан",
      );
    } catch (error) {
      console.error(error);
      setStatus("Не удалось создать челлендж");
    } finally {
      setIsCreatingChallenge(false);
    }
  }

  return (
    <div className="app-shell">
      <main className="dashboard">
        <section className="hero panel">
          <div className="hero__copy">
            <p className="eyebrow">Спортивный челлендж</p>
            <h1 className="hero__title">
              Демо-валюта, ретро-челленджи и полный сценарий тестирования.
            </h1>
            <p className="hero__description">
              Эта панель позволяет создавать демо-челленджи с любыми датами,
              включая прошлые периоды активности, затем подключать Strava,
              вступать, проверять результат и смотреть историю наград в одном
              месте.
            </p>
            <button
              className="button button--ghost"
              onClick={refreshCurrentWorkspace}
              disabled={!userId || activeAction !== null || isCreatingChallenge}
            >
              {
                "\u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u0434\u0430\u043d\u043d\u044b\u0435"
              }
            </button>
          </div>

          <div className="hero__stats">
            <article className="stat-card">
              <span className="stat-card__label">Демо-профиль</span>
              <strong className="stat-card__value">{profileName}</strong>
            </article>
            <article className="stat-card">
              <span className="stat-card__label">Баланс</span>
              <strong className="stat-card__value">
                {formatCredits(demoUser?.balance ?? 0)}
              </strong>
            </article>
            <article className="stat-card">
              <span className="stat-card__label">Активности</span>
              <strong className="stat-card__value">{activities.length}</strong>
            </article>
            <article className="stat-card">
              <span className="stat-card__label">Пройденная дистанция</span>
              <strong className="stat-card__value">
                {formatMeters(totalDistanceMeters)}
              </strong>
            </article>
            <article className="stat-card">
              <span className="stat-card__label">Выполнено челленджей</span>
              <strong className="stat-card__value">{passedChallenges}</strong>
            </article>
            <article className="stat-card">
              <span className="stat-card__label">Заработано кредитов</span>
              <strong className="stat-card__value">
                {formatCredits(earnedCredits)}
              </strong>
            </article>
          </div>
        </section>

        <section className="panel command-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Панель управления</p>
              <h2 className="section-title">Центр управления демо-режимом</h2>
            </div>
            <div className={`status-pill status-pill--${statusTone}`}>
              {status || "Готово к следующему действию"}
            </div>
          </div>

          {hasSavedProfiles ? (
            <div className="profile-switcher">
              <span className="profile-switcher__label">Быстрое переключение профилей</span>
              <div className="profile-switcher__list">
                {savedProfiles.map((profile) => (
                  <button
                    key={profile.id}
                    className={`profile-chip${
                      profile.id === userId ? " is-active" : ""
                    }`}
                    onClick={() => void switchDemoProfile(profile.id)}
                    disabled={
                      profile.id === userId ||
                      activeAction !== null ||
                      isCreatingChallenge
                    }
                    type="button"
                  >
                    <strong>{localizeDemoProfileName(profile.displayName)}</strong>
                    <span>{formatWalletAddress(profile.walletAddress)}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="identity-grid">
            <article className="identity-card">
              <span className="identity-card__label">ID профиля</span>
              <strong className="identity-card__value">
                {userId || "Создаем демо-профиль"}
              </strong>
              <p className="identity-card__meta">
                Демо-пользователи создаются локально для проверки всего
                сценария.
              </p>
            </article>

            <article className="identity-card">
              <span className="identity-card__label">Выбранный челлендж</span>
              <strong className="identity-card__value">
                {localizeChallengeText(selectedChallenge?.title) ||
                  "Выберите цель"}
              </strong>
              <p className="identity-card__meta">
                {selectedChallenge
                  ? `${formatMeters(selectedChallenge.targetDistanceMeters)} цель | ${formatCredits(selectedChallenge.rewardCredits)}`
                  : "Выберите челлендж ниже, чтобы вступить или проверить его."}
              </p>
            </article>

            <article className="identity-card">
              <span className="identity-card__label">Связка со Strava</span>
              <strong className="identity-card__value">{stravaName}</strong>
              <p className="identity-card__meta">
                {demoUser?.stravaAthleteId
                  ? `ID атлета ${demoUser.stravaAthleteId} | ${formatDuration(totalMovingTimeSeconds)} в движении`
                  : "Пока не подключено"}
              </p>
            </article>
            <article className="identity-card">
              <span className="identity-card__label">
                {
                  "\u041f\u0440\u043e\u0433\u0440\u0435\u0441\u0441 \u043f\u043e \u0446\u0435\u043b\u0438"
                }
              </span>
              <strong className="identity-card__value">
                {selectedChallengeProgress
                  ? formatStatus(selectedChallengeProgress.result)
                  : "\u041f\u043e\u043a\u0430 \u043d\u0435\u0442 \u0443\u0447\u0430\u0441\u0442\u0438\u044f"}
              </strong>
              <p className="identity-card__meta">
                {selectedChallengeProgress
                  ? `${formatMeters(selectedChallengeProgress.totalDistanceMeters)} | ${formatCredits(selectedChallengeProgress.earnedCredits)}`
                  : "\u0412\u0441\u0442\u0443\u043f\u0438\u0442\u0435 \u0432 \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u044b\u0439 \u0447\u0435\u043b\u043b\u0435\u043d\u0434\u0436, \u0447\u0442\u043e\u0431\u044b \u043e\u0442\u0441\u043b\u0435\u0436\u0438\u0432\u0430\u0442\u044c \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442."}
              </p>
            </article>
            <article className="identity-card">
              <span className="identity-card__label">Тестовый контракт</span>
              <strong className="identity-card__value">{contractStatusLabel}</strong>
              <p className="identity-card__meta">{contractMetaText}</p>
            </article>
          </div>

          <div className="action-row">
            <button
              className="button button--primary"
              onClick={startFreshDemoSession}
              disabled={activeAction !== null || isCreatingChallenge}
            >
              Новый демо-профиль
            </button>
            <button
              className="button button--ghost"
              onClick={removeCurrentSavedProfile}
              disabled={!userId || activeAction !== null || isCreatingChallenge}
              type="button"
            >
              Убрать текущий профиль
            </button>
            <button
              className="button button--secondary"
              onClick={joinContract}
              disabled={!userId || activeAction !== null || isCreatingChallenge}
            >
              Войти в тестовый контракт
            </button>
            <button
              className="button button--secondary"
              onClick={connectStrava}
              disabled={!userId || activeAction !== null || isCreatingChallenge}
            >
              Подключить Strava
            </button>
            <button
              className="button button--secondary"
              onClick={syncActivities}
              disabled={!userId || activeAction !== null || isCreatingChallenge}
            >
              Синхронизировать активности
            </button>
            <button
              className="button button--ghost"
              onClick={checkChallenge}
              disabled={
                !userId ||
                !selectedChallengeId ||
                activeAction !== null ||
                isCreatingChallenge
              }
            >
              Проверить челлендж
            </button>
          </div>
        </section>

        <section className="panel creation-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Создание челленджа</p>
              <h2 className="section-title">Конструктор ретро-челленджа</h2>
            </div>
            <div className="mini-summary">
              <span>Поддерживаются прошлые даты</span>
              <span>Можно вступить сразу</span>
            </div>
          </div>

          <div className="form-grid">
            <label className="field-group field-group--span-2">
              <span className="field-label">Название</span>
              <input
                className="field-input"
                value={challengeForm.title}
                onChange={(event) =>
                  setChallengeForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                placeholder="Повтор вечерней прогулки"
              />
            </label>

            <label className="field-group field-group--span-2">
              <span className="field-label">Описание</span>
              <textarea
                className="field-input field-textarea"
                value={challengeForm.description}
                onChange={(event) =>
                  setChallengeForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="Быстрый тестовый челлендж для импортированных активностей из Strava."
              />
            </label>

            <label className="field-group">
              <span className="field-label">Тип активности</span>
              <select
                className="field-input"
                value={challengeForm.requiredSportType}
                onChange={(event) =>
                  setChallengeForm((current) => ({
                    ...current,
                    requiredSportType: event.target.value,
                  }))
                }
              >
                <option value="Walk">Ходьба</option>
                <option value="Run">Бег</option>
                <option value="Ride">Велозаезд</option>
                <option value="Hike">Поход</option>
              </select>
            </label>

            <label className="field-group">
              <span className="field-label">Целевая дистанция, м</span>
              <input
                className="field-input"
                type="number"
                min="1"
                value={challengeForm.targetDistanceMeters}
                onChange={(event) =>
                  setChallengeForm((current) => ({
                    ...current,
                    targetDistanceMeters: event.target.value,
                  }))
                }
              />
            </label>

            <label className="field-group">
              <span className="field-label">Мин. время движения, сек</span>
              <input
                className="field-input"
                type="number"
                min="0"
                value={challengeForm.minMovingTimeSeconds}
                onChange={(event) =>
                  setChallengeForm((current) => ({
                    ...current,
                    minMovingTimeSeconds: event.target.value,
                  }))
                }
              />
            </label>

            <label className="field-group">
              <span className="field-label">Награда, кредиты</span>
              <input
                className="field-input"
                type="number"
                min="0"
                value={challengeForm.rewardCredits}
                onChange={(event) =>
                  setChallengeForm((current) => ({
                    ...current,
                    rewardCredits: event.target.value,
                  }))
                }
              />
            </label>

            <label className="field-group">
              <span className="field-label">Дедлайн регистрации</span>
              <input
                className="field-input"
                type="datetime-local"
                value={challengeForm.registrationDeadline}
                onChange={(event) =>
                  setChallengeForm((current) => ({
                    ...current,
                    registrationDeadline: event.target.value,
                  }))
                }
              />
            </label>

            <label className="field-group">
              <span className="field-label">Начало челленджа</span>
              <input
                className="field-input"
                type="datetime-local"
                value={challengeForm.challengeStartAt}
                onChange={(event) =>
                  setChallengeForm((current) => ({
                    ...current,
                    challengeStartAt: event.target.value,
                  }))
                }
              />
            </label>

            <label className="field-group">
              <span className="field-label">Конец челленджа</span>
              <input
                className="field-input"
                type="datetime-local"
                value={challengeForm.challengeEndAt}
                onChange={(event) =>
                  setChallengeForm((current) => ({
                    ...current,
                    challengeEndAt: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <div className="field-actions">
            <label className="field-checkbox">
              <input
                type="checkbox"
                checked={challengeForm.autoJoin}
                onChange={(event) =>
                  setChallengeForm((current) => ({
                    ...current,
                    autoJoin: event.target.checked,
                  }))
                }
              />
              <span>Сразу добавить этот челлендж в мою историю</span>
            </label>

            <div className="action-row">
              <button
                className="button button--primary"
                onClick={createChallenge}
                disabled={
                  !userId || isCreatingChallenge || activeAction !== null
                }
              >
                {isCreatingChallenge ? "Создаем..." : "Создать челлендж"}
              </button>
              <button
                className="button button--ghost"
                onClick={() => setChallengeForm(buildDefaultChallengeForm())}
                type="button"
              >
                Сбросить ретро-шаблон
              </button>
            </div>
          </div>
        </section>

        <div className="content-grid">
          <section className="panel section-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Челленджи</p>
                <h2 className="section-title">Выберите следующую цель</h2>
              </div>
              <button
                className="button button--primary"
                onClick={joinChallenge}
                disabled={!userId || !selectedAvailableChallenge}
              >
                Вступить в выбранный челлендж
              </button>
            </div>

            {selectedAvailableChallenge ? (
              <div className="selected-banner">
                <div>
                  <span className="selected-banner__label">Сейчас выбран</span>
                  <strong className="selected-banner__title">
                    {localizeChallengeText(selectedAvailableChallenge.title)}
                  </strong>
                </div>
                <div className="selected-banner__meta">
                  <span>
                    {formatMeters(selectedAvailableChallenge.targetDistanceMeters)}
                  </span>
                  <span>{formatCredits(selectedAvailableChallenge.rewardCredits)}</span>
                  <span>{formatStatus(selectedAvailableChallenge.status)}</span>
                </div>
              </div>
            ) : null}

            {availableChallenges.length === 0 ? (
              <div className="empty-state">
                Челленджей пока нет. Создайте новый выше, чтобы быстро пройти
                полный тестовый сценарий.
              </div>
            ) : (
              <div className="challenge-grid">
                {availableChallenges.map((challenge) => (
                  <article
                    key={challenge.id}
                    className={`challenge-card${
                      selectedChallengeId === challenge.id ? " is-selected" : ""
                    }`}
                  >
                    <div className="card-head">
                      <span className="tag tag--accent">
                        {formatSportType(
                          challenge.requiredSportType || "Activity",
                        )}
                      </span>
                      <span
                        className={`tag tag--${getStatusTone(challenge.status)}`}
                      >
                        {formatStatus(challenge.status)}
                      </span>
                    </div>

                    <h3 className="card-title">
                      {localizeChallengeText(challenge.title)}
                    </h3>
                    <p className="card-description">
                      {localizeChallengeText(challenge.description) ||
                        "Описание пока не добавлено."}
                    </p>
                    <p className="card-caption">
                      {formatDateRange(
                        challenge.challengeStartAt,
                        challenge.challengeEndAt,
                      )}
                    </p>

                    <div className="metric-grid">
                      <div className="metric-card">
                        <span className="metric-card__label">Цель</span>
                        <strong className="metric-card__value">
                          {formatMeters(challenge.targetDistanceMeters)}
                        </strong>
                      </div>
                      <div className="metric-card">
                        <span className="metric-card__label">
                          Мин. время движения
                        </span>
                        <strong className="metric-card__value">
                          {formatDuration(challenge.minMovingTimeSeconds)}
                        </strong>
                      </div>
                      <div className="metric-card">
                        <span className="metric-card__label">Награда</span>
                        <strong className="metric-card__value">
                          {formatCredits(challenge.rewardCredits)}
                        </strong>
                      </div>
                      <div className="metric-card">
                        <span className="metric-card__label">Регистрация</span>
                        <strong className="metric-card__value">
                          {formatDate(challenge.registrationDeadline)}
                        </strong>
                      </div>
                    </div>

                    <div className="card-actions">
                      <button
                        className="button button--ghost"
                        onClick={() => setSelectedChallengeId(challenge.id)}
                      >
                        {selectedChallengeId === challenge.id
                          ? "Выбран"
                          : "Выбрать челлендж"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="panel section-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Активности</p>
                <h2 className="section-title">Лента последних тренировок</h2>
              </div>
              <div className="mini-summary">
                <span>Загружено: {activities.length}</span>
                <span>{formatMeters(totalDistanceMeters)}</span>
              </div>
            </div>

            {activities.length === 0 ? (
              <div className="empty-state">
                Активности пока не загружены. Подключите Strava и выполните
                синхронизацию, чтобы заполнить этот список.
              </div>
            ) : (
              <div className="activity-list">
                {activities.map((activity) => (
                  <article key={activity.id} className="activity-card">
                    <div className="card-head">
                      <div>
                        <h3 className="card-title">
                          {activity.name || "Активность без названия"}
                        </h3>
                        <p className="card-description">
                          {formatDate(activity.startDate)}
                        </p>
                      </div>
                      <span className="tag tag--soft">
                        {formatSportType(activity.sportType || "Unknown")}
                      </span>
                    </div>

                    <div className="activity-metrics">
                      <div className="metric-card">
                        <span className="metric-card__label">Дистанция</span>
                        <strong className="metric-card__value">
                          {formatMeters(activity.distanceMeters)}
                        </strong>
                      </div>
                      <div className="metric-card">
                        <span className="metric-card__label">
                          Время движения
                        </span>
                        <strong className="metric-card__value">
                          {formatDuration(activity.movingTimeSeconds)}
                        </strong>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="panel section-panel history-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">История</p>
              <h2 className="section-title">Результаты челленджей и награды</h2>
            </div>
            <div className="mini-summary">
              <span>Участий: {challengeHistory.length}</span>
              <span>Выполнено: {passedChallenges}</span>
              <span>Заработано: {formatCredits(earnedCredits)}</span>
            </div>
          </div>

          {challengeHistory.length === 0 ? (
            <div className="empty-state">
              Вступите в челлендж или создайте свой, чтобы собрать историю
              результатов, подтвержденной дистанции и демо-наград.
            </div>
          ) : (
            <div className="history-grid">
              {challengeHistory.map((entry) => (
                <article key={entry.id} className="history-card">
                  <div className="card-head">
                    <div>
                      <h3 className="card-title">
                        {localizeChallengeText(entry.challenge.title)}
                      </h3>
                      <p className="card-description">
                        {formatDateRange(
                          entry.challenge.challengeStartAt,
                          entry.challenge.challengeEndAt,
                        )}
                      </p>
                    </div>
                    <span className={`tag tag--${getStatusTone(entry.result)}`}>
                      {formatStatus(entry.result)}
                    </span>
                  </div>

                  <div className="metric-grid metric-grid--history">
                    <div className="metric-card">
                      <span className="metric-card__label">Подтверждено</span>
                      <strong className="metric-card__value">
                        {`${formatMeters(entry.totalDistanceMeters)} / ${formatMeters(entry.challenge.targetDistanceMeters)}`}
                      </strong>
                    </div>
                    <div className="metric-card">
                      <span className="metric-card__label">Время движения</span>
                      <strong className="metric-card__value">
                        {formatDuration(entry.totalMovingTimeSeconds)}
                      </strong>
                    </div>
                    <div className="metric-card">
                      <span className="metric-card__label">Награда</span>
                      <strong className="metric-card__value">
                        {formatCredits(entry.rewardCredits)}
                      </strong>
                    </div>
                    <div className="metric-card">
                      <span className="metric-card__label">Получено</span>
                      <strong className="metric-card__value">
                        {formatCredits(entry.earnedCredits)}
                      </strong>
                    </div>
                  </div>

                  <div className="history-meta">
                    <span>
                      Засчитано активностей: {entry.countedActivities}
                    </span>
                    <span>Вступление: {formatDate(entry.joinedAt)}</span>
                    <span>
                      {entry.verifiedAt
                        ? `Проверено: ${formatDate(entry.verifiedAt)}`
                        : "Еще не проверено"}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
