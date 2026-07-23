import type { LocalUserState } from "./types";

const STORAGE_KEY = "landjuweel:user:v1";

export function defaultUserState(firstDay: string): LocalUserState {
  return {
    version: 1,
    favoriteProfileIds: [],
    plannedEventIds: [],
    lastSelectedDay: firstDay,
    dismissedNotices: [],
  };
}

export function loadUserState(
  firstDay: string,
  validProfileIds: ReadonlySet<number>,
  validEventIds: ReadonlySet<string>,
  validDays: ReadonlySet<string>,
): LocalUserState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return defaultUserState(firstDay);
    const parsed = JSON.parse(stored) as Partial<LocalUserState>;
    if (parsed.version !== 1) return defaultUserState(firstDay);
    return {
      version: 1,
      favoriteProfileIds: Array.isArray(parsed.favoriteProfileIds)
        ? parsed.favoriteProfileIds.filter(
            (id): id is number => typeof id === "number" && validProfileIds.has(id),
          )
        : [],
      plannedEventIds: Array.isArray(parsed.plannedEventIds)
        ? parsed.plannedEventIds.filter(
            (id): id is string => typeof id === "string" && validEventIds.has(id),
          )
        : [],
      lastSelectedDay:
        typeof parsed.lastSelectedDay === "string" && validDays.has(parsed.lastSelectedDay)
          ? parsed.lastSelectedDay
          : firstDay,
      dismissedNotices: Array.isArray(parsed.dismissedNotices)
        ? parsed.dismissedNotices.filter((id): id is string => typeof id === "string")
        : [],
    };
  } catch {
    return defaultUserState(firstDay);
  }
}

export function saveUserState(state: LocalUserState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
