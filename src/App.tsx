import {
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronRight,
  Clock3,
  Compass,
  Heart,
  Info,
  LifeBuoy,
  ListChecks,
  LocateFixed,
  Map as MapIcon,
  MapPinned,
  Search,
  Sparkles,
  Undo2,
  ZoomIn,
  ZoomOut,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { loadUserState, saveUserState } from "./storage";
import type {
  AppTab,
  Category,
  FestivalData,
  FestivalEvent,
  FestivalProfile,
  LocalUserState,
} from "./types";

const CATEGORY_COLORS: Record<Category, string> = {
  "Live Music": "#d8ff4f",
  "DJ & Electronic": "#ff4fd8",
  "Workshops & Hands-on": "#ff9c52",
  "Wellness & Ritual": "#79f3c5",
  "Theatre & Performance": "#9c7cff",
  "Art & Installations": "#62e7ff",
  "Talks & Community": "#ffd86a",
  "Kids & Family": "#ff738f",
  "Activities & Pop-ups": "#c7a2ff",
};

const TAB_ITEMS: Array<{
  id: AppTab;
  label: string;
  icon: typeof Sparkles;
}> = [
  { id: "now", label: "Now", icon: Sparkles },
  { id: "schedule", label: "Schedule", icon: CalendarDays },
  { id: "explore", label: "Explore", icon: Compass },
  { id: "plan", label: "My Plan", icon: ListChecks },
  { id: "map", label: "Map", icon: MapIcon },
];

const FESTIVAL_TIME_ZONE = "Europe/Amsterdam";
const FESTIVAL_UTC_OFFSET = "+02:00";
const ENGLISH_TITLE_OVERRIDES: Record<string, string> = {
  "(H)oer Hollandse spelletjes": "Wildly Dutch Games",
  "Kids Show door Jozefien": "Kids' Show by Jozefien",
  "Klei Jezelf Blij Workshop": "Clay Yourself Happy Workshop",
  "Lach Workshop": "Laughter Workshop",
  Poppenkastvoorstelling: "Puppet Show",
  "Spirit Songs door Anouk Anansi": "Spirit Songs by Anouk Anansi",
  "Stemvork Healing door Shamatty": "Tuning Fork Healing by Shamatty",
  "Workshop Lino Stempelen": "Lino Stamp Workshop",
  "XXL spellen: Schaken, Jenga, Twister": "XXL Games: Chess, Jenga & Twister",
};
const VIEW_MEMORY: {
  schedule: {
    query: string;
    category: Category | "All";
    favoritesOnly: boolean;
  };
  explore: {
    category: Category | null;
    collection: string | null;
  };
} = {
  schedule: { query: "", category: "All", favoritesOnly: false },
  explore: { category: null, collection: null },
};

type AppRoute =
  | { kind: "tab"; tab: AppTab; venue?: string }
  | { kind: "event"; eventId: string; from: AppTab }
  | { kind: "info"; from: AppTab; topic?: string; entry?: string };

type UndoNotice = {
  message: string;
  eventId: string;
};

const DIALOG_STACK: symbol[] = [];

function festivalTimestamp(iso: string): number {
  return Date.parse(`${iso}:00${FESTIVAL_UTC_OFFSET}`);
}

function festivalDateKey(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: FESTIVAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function parseRoute(hash = window.location.hash): AppRoute {
  const raw = hash.replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const params = new URLSearchParams(query);
  if (path.startsWith("event/")) {
    const from = params.get("from") as AppTab | null;
    return {
      kind: "event",
      eventId: decodeURIComponent(path.slice("event/".length)),
      from: TAB_ITEMS.some((item) => item.id === from) ? from! : "schedule",
    };
  }
  if (path === "info") {
    const from = params.get("from") as AppTab | null;
    return {
      kind: "info",
      from: TAB_ITEMS.some((item) => item.id === from) ? from! : "now",
      topic: params.get("topic") ?? undefined,
      entry: params.get("entry") ?? undefined,
    };
  }
  const tabPath = (path || "now") as AppTab;
  const tab = TAB_ITEMS.some((item) => item.id === tabPath) ? tabPath : "now";
  return { kind: "tab", tab, venue: params.get("venue") ?? undefined };
}

function routeHash(route: AppRoute): string {
  if (route.kind === "event") {
    return `#/event/${encodeURIComponent(route.eventId)}?from=${route.from}`;
  }
  if (route.kind === "info") {
    const params = new URLSearchParams({ from: route.from });
    if (route.topic) params.set("topic", route.topic);
    if (route.entry) params.set("entry", route.entry);
    return `#/info?${params.toString()}`;
  }
  const params = new URLSearchParams();
  if (route.venue) params.set("venue", route.venue);
  const query = params.toString();
  return `#/${route.tab}${query ? `?${query}` : ""}`;
}

function normalizeFestivalData(data: FestivalData): FestivalData {
  return {
    ...data,
    events: data.events.map((event) => ({
      ...event,
      title: ENGLISH_TITLE_OVERRIDES[event.title] ?? event.title,
    })),
    profiles: data.profiles.map((profile) => ({
      ...profile,
      name: ENGLISH_TITLE_OVERRIDES[profile.name] ?? profile.name,
    })),
    info: data.info.map((topic) => ({
      ...topic,
      title:
        topic.title === "Everything about the Alles kids and Ruigoord."
          ? "Everything about children and Ruigoord"
          : topic.title,
      entries: topic.entries.map((entry) =>
        entry.id === "2-1"
          ? {
              ...entry,
              description:
                "Thu 14:00 – 04:00\nFri 12:00 – 05:00\nSat 12:00 – 04:00\nSun 12:00 – 05:00",
              descriptionIsExcerpt: false,
            }
          : entry.id === "1-11"
            ? {
                ...entry,
                description: entry.description.replace(
                  "Natural High-veld",
                  "Natural High field",
                ),
              }
            : entry,
      ),
    })),
  };
}

function assetUrl(path: string | null): string | null {
  if (!path) return null;
  return `${import.meta.env.BASE_URL}${path}`;
}

function classNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function categoryStyle(category: Category): CSSProperties {
  return { "--category-color": CATEGORY_COLORS[category] } as CSSProperties;
}

function formatTimeRange(event: FestivalEvent): string {
  return `${event.start} - ${event.end}`;
}

function isHappening(event: FestivalEvent, now: Date): boolean {
  const timestamp = now.getTime();
  return (
    festivalTimestamp(event.startIso) <= timestamp &&
    festivalTimestamp(event.endIso) > timestamp
  );
}

function eventsOverlap(left: FestivalEvent, right: FestivalEvent): boolean {
  return (
    festivalTimestamp(left.startIso) < festivalTimestamp(right.endIso) &&
    festivalTimestamp(left.endIso) > festivalTimestamp(right.startIso)
  );
}

function useFestivalNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const interval = window.setInterval(refresh, 60_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return now;
}

function useDialogFocus(onClose: () => void) {
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const dialogToken = Symbol("dialog");
    const isFirstDialog = DIALOG_STACK.length === 0;
    DIALOG_STACK.push(dialogToken);
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const background = [
      document.querySelector<HTMLElement>(".app-header"),
      document.querySelector<HTMLElement>("#main-content"),
      document.querySelector<HTMLElement>(".bottom-nav"),
    ].filter((element): element is HTMLElement => Boolean(element));
    if (isFirstDialog) {
      background.forEach((element) => {
        element.inert = true;
        element.setAttribute("aria-hidden", "true");
      });
    }

    const dialog = dialogRef.current;
    const focusables = () =>
      dialog
        ? Array.from(
            dialog.querySelectorAll<HTMLElement>(
              'button:not([disabled]), a[href], input:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
            ),
          ).filter((element) => !element.hasAttribute("hidden"))
        : [];
    window.requestAnimationFrame(() => (focusables()[0] ?? dialog)?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (DIALOG_STACK[DIALOG_STACK.length - 1] !== dialogToken) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        dialog?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      const tokenIndex = DIALOG_STACK.indexOf(dialogToken);
      if (tokenIndex >= 0) DIALOG_STACK.splice(tokenIndex, 1);
      if (DIALOG_STACK.length === 0) {
        background.forEach((element) => {
          element.inert = false;
          element.removeAttribute("aria-hidden");
        });
      }
      previousFocus?.focus();
    };
  }, [onClose]);
  return dialogRef;
}

function useFestivalData(): {
  data: FestivalData | null;
  loading: boolean;
  error: string | null;
} {
  const [data, setData] = useState<FestivalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`${import.meta.env.BASE_URL}data/festival.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`Programme request failed (${response.status})`);
        return response.json() as Promise<FestivalData>;
      })
      .then((festival) => {
        if (alive) setData(normalizeFestivalData(festival));
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : "Could not load programme");
      });
    return () => {
      alive = false;
    };
  }, []);
  return { data, loading: !data && !error, error };
}

function App() {
  const { data, loading, error } = useFestivalData();
  const initialRoute = useMemo(() => parseRoute(), []);
  const [tab, setTab] = useState<AppTab>(
    initialRoute.kind === "tab" ? initialRoute.tab : initialRoute.from,
  );
  const [exploreCategory, setExploreCategory] = useState<Category | null>(null);
  const [userState, setUserState] = useState<LocalUserState | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<FestivalEvent | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [infoTarget, setInfoTarget] = useState<{ topic?: string; entry?: string }>({});
  const [selectedVenue, setSelectedVenue] = useState(
    initialRoute.kind === "tab" ? initialRoute.venue ?? null : null,
  );
  const [pendingConflict, setPendingConflict] = useState<{
    event: FestivalEvent;
    conflicts: FestivalEvent[];
  } | null>(null);
  const [undoNotice, setUndoNotice] = useState<UndoNotice | null>(null);
  const [storageUnavailable, setStorageUnavailable] = useState(false);

  const applyRoute = useCallback((route: AppRoute, scroll = true) => {
    const routeTab = route.kind === "tab" ? route.tab : route.from;
    setTab(routeTab);
    setSelectedEvent(
      route.kind === "event" && data
        ? data.events.find((event) => event.id === route.eventId) ?? null
        : null,
    );
    setShowInfo(route.kind === "info");
    setInfoTarget(
      route.kind === "info" ? { topic: route.topic, entry: route.entry } : {},
    );
    setSelectedVenue(route.kind === "tab" ? route.venue ?? null : null);
    if (scroll) window.scrollTo({ top: 0, behavior: "auto" });
  }, [data]);

  const pushRoute = useCallback((route: AppRoute, overlay = false) => {
    window.history.pushState(
      { landjuweel: true, overlay },
      "",
      `${window.location.pathname}${window.location.search}${routeHash(route)}`,
    );
    applyRoute(route);
  }, [applyRoute]);

  const replaceRoute = useCallback((route: AppRoute) => {
    window.history.replaceState(
      { landjuweel: true, overlay: false },
      "",
      `${window.location.pathname}${window.location.search}${routeHash(route)}`,
    );
    applyRoute(route);
  }, [applyRoute]);

  const closeOverlay = useCallback(() => {
    if (window.history.state?.overlay) {
      window.history.back();
    } else {
      replaceRoute({ kind: "tab", tab });
    }
  }, [replaceRoute, tab]);

  useEffect(() => {
    if (!window.location.hash) {
      replaceRoute({ kind: "tab", tab: "now" });
      return;
    }
    applyRoute(parseRoute(), false);
  }, [applyRoute, replaceRoute]);

  useEffect(() => {
    const onPopState = () => applyRoute(parseRoute());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [applyRoute]);

  useEffect(() => {
    if (data && !userState) {
      const today = festivalDateKey(new Date());
      const initialDay = data.days.some((day) => day.date === today)
        ? today
        : data.days[0].date;
      setUserState(
        loadUserState(
          initialDay,
          new Set(data.profiles.map((profile) => profile.id)),
          new Set(data.events.map((event) => event.id)),
          new Set(data.days.map((day) => day.date)),
        ),
      );
    }
  }, [data, userState]);

  useEffect(() => {
    if (userState && !saveUserState(userState)) setStorageUnavailable(true);
  }, [userState]);

  useEffect(() => {
    if (!undoNotice) return;
    const timeout = window.setTimeout(() => setUndoNotice(null), 7000);
    return () => window.clearTimeout(timeout);
  }, [undoNotice]);

  useEffect(() => {
    if (tab === "explore" && exploreCategory) setExploreCategory(null);
  }, [exploreCategory, tab]);

  if (loading) return <LoadingView />;
  if (error || !data || !userState) return <ErrorView message={error ?? "Programme unavailable"} />;

  const profiles = new Map(data.profiles.map((profile) => [profile.id, profile]));

  const updateUserState = (recipe: (current: LocalUserState) => LocalUserState) => {
    setUserState((current) => (current ? recipe(current) : current));
  };

  const toggleFavorite = (profileId: number) => {
    updateUserState((current) => {
      const favoriteProfileIds = current.favoriteProfileIds.includes(profileId)
        ? current.favoriteProfileIds.filter((id) => id !== profileId)
        : [...current.favoriteProfileIds, profileId];
      return { ...current, favoriteProfileIds };
    });
  };

  const toggleFavoriteGroup = (profileIds: number[]) => {
    updateUserState((current) => {
      const allFavorited = profileIds.every((id) => current.favoriteProfileIds.includes(id));
      const favoriteProfileIds = allFavorited
        ? current.favoriteProfileIds.filter((id) => !profileIds.includes(id))
        : [...new Set([...current.favoriteProfileIds, ...profileIds])];
      return { ...current, favoriteProfileIds };
    });
  };

  const togglePlanned = (eventId: string) => {
    const event = data.events.find((item) => item.id === eventId);
    if (!event) return;
    if (userState.plannedEventIds.includes(eventId)) {
      updateUserState((current) => ({
        ...current,
        plannedEventIds: current.plannedEventIds.filter((id) => id !== eventId),
      }));
      setUndoNotice({ eventId, message: `${event.title} left your plan.` });
      return;
    }
    const conflicts = data.events.filter(
      (item) =>
        userState.plannedEventIds.includes(item.id) &&
        eventsOverlap(event, item),
    );
    if (conflicts.length > 0) {
      setPendingConflict({ event, conflicts });
      return;
    }
    updateUserState((current) => ({
      ...current,
      plannedEventIds: [...current.plannedEventIds, eventId],
    }));
  };

  const selectDay = (date: string) => {
    updateUserState((current) => ({ ...current, lastSelectedDay: date }));
  };

  const navigateTab = (nextTab: AppTab, venue?: string) => {
    pushRoute({ kind: "tab", tab: nextTab, venue });
  };

  const openEvent = (event: FestivalEvent) => {
    pushRoute({ kind: "event", eventId: event.id, from: tab }, true);
  };

  const openInfo = (topic?: string, entry?: string) => {
    pushRoute({ kind: "info", from: tab, topic, entry }, true);
  };

  return (
    <div className="app-shell">
      <PsychedelicBackdrop />
      <a className="skip-link" href="#main-content">Skip to programme</a>
      <header className="app-header">
        <button className="brand-lockup" onClick={() => navigateTab("now")} aria-label="Go to Now">
          <span className="brand-mark">
            <img src={assetUrl("icon-512.png") ?? ""} alt="" />
          </span>
          <span>
            <strong>Landjuweel</strong>
            <small>Pocket field guide</small>
          </span>
        </button>
        <div className="header-actions">
          <button className="help-button" onClick={() => openInfo("topic-1", "1-11")}>
            <LifeBuoy size={18} />
            <span>Help / PsyCare</span>
          </button>
        </div>
      </header>

      <main className="app-main" id="main-content">
        {tab === "now" && (
          <NowView
            data={data}
            userState={userState}
            profiles={profiles}
            onEvent={openEvent}
            onPlan={togglePlanned}
            onFavorite={toggleFavoriteGroup}
            onNavigate={navigateTab}
            onExplore={(category) => {
              setExploreCategory(category);
              navigateTab("explore");
            }}
          />
        )}
        {tab === "schedule" && (
          <ScheduleView
            data={data}
            userState={userState}
            profiles={profiles}
            initialCategory={exploreCategory}
            onSelectDay={selectDay}
            onEvent={openEvent}
            onPlan={togglePlanned}
            onFavorite={toggleFavoriteGroup}
          />
        )}
        {tab === "explore" && (
          <ExploreView
            data={data}
            userState={userState}
            profiles={profiles}
            initialCategory={exploreCategory}
            onSelectDay={selectDay}
            onEvent={openEvent}
            onPlan={togglePlanned}
            onFavorite={toggleFavoriteGroup}
          />
        )}
        {tab === "plan" && (
          <PlanView
            data={data}
            userState={userState}
            profiles={profiles}
            onEvent={openEvent}
            onPlan={togglePlanned}
            onFavorite={toggleFavoriteGroup}
            onNavigate={navigateTab}
          />
        )}
        {tab === "map" && (
          <MapView
            data={data}
            selectedVenue={selectedVenue}
            onVenue={(venue) => navigateTab("map", venue)}
            onEvent={openEvent}
            onShowInfo={() => openInfo()}
          />
        )}
      </main>

      <nav className="bottom-nav" aria-label="Primary">
        {TAB_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={classNames("bottom-nav__item", tab === item.id && "is-active")}
              onClick={() => navigateTab(item.id)}
              aria-current={tab === item.id ? "page" : undefined}
            >
              <Icon size={21} strokeWidth={tab === item.id ? 2.6 : 2} />
              <span>{item.label}</span>
              {item.id === "plan" && userState.plannedEventIds.length > 0 && (
                <b>{userState.plannedEventIds.length}</b>
              )}
            </button>
          );
        })}
      </nav>

      {selectedEvent && (
        <EventSheet
          event={selectedEvent}
          profiles={profiles}
          favoriteProfileIds={userState.favoriteProfileIds}
          planned={userState.plannedEventIds.includes(selectedEvent.id)}
          onClose={closeOverlay}
          onFavorite={toggleFavorite}
          onFavoriteGroup={() => toggleFavoriteGroup(selectedEvent.profileIds)}
          onPlan={() => togglePlanned(selectedEvent.id)}
        />
      )}
      {showInfo && (
        <InfoSheet
          data={data}
          initialTopic={infoTarget.topic}
          highlightedEntry={infoTarget.entry}
          onClose={closeOverlay}
        />
      )}
      {pendingConflict && (
        <ConflictPrompt
          event={pendingConflict.event}
          conflicts={pendingConflict.conflicts}
          onCancel={() => setPendingConflict(null)}
          onConfirm={() => {
            updateUserState((current) => ({
              ...current,
              plannedEventIds: [...current.plannedEventIds, pendingConflict.event.id],
            }));
            setPendingConflict(null);
          }}
        />
      )}
      {undoNotice && (
        <div className="undo-toast" role="status">
          <span>{undoNotice.message}</span>
          <button
            onClick={() => {
              updateUserState((current) => ({
                ...current,
                plannedEventIds: current.plannedEventIds.includes(undoNotice.eventId)
                  ? current.plannedEventIds
                  : [...current.plannedEventIds, undoNotice.eventId],
              }));
              setUndoNotice(null);
            }}
          >
            <Undo2 size={17} /> Undo
          </button>
        </div>
      )}
      {storageUnavailable && (
        <div className="storage-warning" role="status">
          Your plan cannot be saved on this device. Private browsing may be blocking storage.
          <button onClick={() => setStorageUnavailable(false)} aria-label="Dismiss storage warning">
            <X size={17} />
          </button>
        </div>
      )}
    </div>
  );
}

function LoadingView() {
  return (
    <div className="state-view">
      <PsychedelicBackdrop />
      <div className="loading-orbit" aria-hidden="true">
        <span />
      </div>
      <p className="eyebrow">Consulting the tiny oracle</p>
      <h1>Unfolding the programme...</h1>
    </div>
  );
}

function ErrorView({ message }: { message: string }) {
  return (
    <div className="state-view">
      <PsychedelicBackdrop />
      <Compass size={42} />
      <p className="eyebrow">Well, that's odd</p>
      <h1>The programme wandered off</h1>
      <p>{message}</p>
      <button className="primary-button" onClick={() => window.location.reload()}>
        Summon it again
      </button>
    </div>
  );
}

function PsychedelicBackdrop() {
  return (
    <div className="psychedelic-backdrop" aria-hidden="true">
      <span className="psychedelic-backdrop__orb psychedelic-backdrop__orb--one" />
      <span className="psychedelic-backdrop__orb psychedelic-backdrop__orb--two" />
      <span className="psychedelic-backdrop__orb psychedelic-backdrop__orb--three" />
    </div>
  );
}

function NowView({
  data,
  userState,
  profiles,
  onEvent,
  onPlan,
  onFavorite,
  onNavigate,
  onExplore,
}: {
  data: FestivalData;
  userState: LocalUserState;
  profiles: Map<number, FestivalProfile>;
  onEvent: (event: FestivalEvent) => void;
  onPlan: (id: string) => void;
  onFavorite: (ids: number[]) => void;
  onNavigate: (tab: AppTab) => void;
  onExplore: (category: Category) => void;
}) {
  const now = useFestivalNow();
  const today = festivalDateKey(now);
  const activeDay = data.days.some((day) => day.date === today)
    ? today
    : userState.lastSelectedDay;
  const day = data.days.find((item) => item.date === activeDay) ?? data.days[0];
  const dayEvents = data.events.filter((event) => event.festivalDate === day.date);
  const happening = data.events.filter((event) => isHappening(event, now));
  const upcoming = data.events
    .filter((event) => festivalTimestamp(event.startIso) > now.getTime())
    .sort((left, right) => festivalTimestamp(left.startIso) - festivalTimestamp(right.startIso))
    .slice(0, 8);
  const planned = data.events
    .filter((event) => userState.plannedEventIds.includes(event.id))
    .filter((event) => festivalTimestamp(event.endIso) > now.getTime())
    .sort((a, b) => festivalTimestamp(a.startIso) - festivalTimestamp(b.startIso));
  const nextPlanned = planned[0];
  const festivalStart = Math.min(...data.events.map((event) => festivalTimestamp(event.startIso)));
  const festivalEnd = Math.max(...data.events.map((event) => festivalTimestamp(event.endIso)));
  const festivalIsLive = now.getTime() >= festivalStart && now.getTime() < festivalEnd;
  const currentCards = happening.length > 0 ? happening : upcoming;

  return (
    <div className="view-stack">
      {nextPlanned && (
        <section className="next-plan-card">
          <div>
            <p className="eyebrow">Next on your highly scientific plan</p>
            <h2>{nextPlanned.title}</h2>
            <p>{nextPlanned.dayLabel} · {formatTimeRange(nextPlanned)} · {nextPlanned.venue}</p>
          </div>
          <button className="icon-button icon-button--acid" onClick={() => onEvent(nextPlanned)} aria-label={`Open ${nextPlanned.title}`}>
            <ChevronRight size={20} />
          </button>
        </section>
      )}

      <SectionHeading
        eyebrow={happening.length > 0 ? "Already in progress" : "Not yet, keen bean"}
        title={happening.length > 0 ? "Happening right now" : "Coming up shortly"}
        action={<button onClick={() => onNavigate("schedule")}>See all</button>}
      />
      {currentCards.length > 0 ? (
        <div className="event-grid event-grid--horizontal">
          {currentCards.slice(0, 8).map((event) => (
            <EventCard
              key={event.id}
              event={event}
              profile={profiles.get(event.profileIds[0])}
              favorite={event.profileIds.every((id) => userState.favoriteProfileIds.includes(id))}
              planned={userState.plannedEventIds.includes(event.id)}
              onOpen={() => onEvent(event)}
              onPlan={() => onPlan(event.id)}
              onFavorite={() => onFavorite(event.profileIds)}
              compact
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Sparkles size={30} />}
          title="The programme is between dimensions"
          body={`Nothing is live around ${day.name} right now. The full schedule still knows everything.`}
          action={<button className="primary-button" onClick={() => onNavigate("schedule")}>Open schedule</button>}
        />
      )}

      <details className="hero-details" open={!festivalIsLive}>
        <summary>
          <span>{festivalIsLive ? "Show festival artwork" : "Welcome to Landjuweel"}</span>
          <ChevronRight size={18} />
        </summary>
        <div className="hero-block">
          <section className="hero-card">
            <img
              className="hero-card__art"
              src={assetUrl("landjuweel-dali-hero.png") ?? ""}
              alt="Surreal watercolor elephants crossing the Dutch wetlands toward Landjuweel"
              width={1735}
              height={907}
            />
          </section>
        </div>
      </details>
      <div className="hero-card__actions">
        <button className="primary-button" onClick={() => onNavigate("schedule")}>
          Schedule <ChevronRight size={18} />
        </button>
        <button className="secondary-button" onClick={() => onNavigate("map")}>
          <MapPinned size={17} /> Map
        </button>
      </div>

      <div className="stat-strip" aria-label="Festival summary">
        <button type="button" onClick={() => onNavigate("schedule")}>
          <strong>{data.meta.eventCount}</strong>
          <span>happenings</span>
          <small>Browse the beautiful mess <ChevronRight size={13} /></small>
        </button>
        <button type="button" onClick={() => onNavigate("map")}>
          <strong>{new Set(data.events.map((event) => event.venue)).size}</strong>
          <span>places</span>
          <small>Go get pleasantly lost <ChevronRight size={13} /></small>
        </button>
        <button type="button" onClick={() => onNavigate("plan")}>
          <strong>{userState.plannedEventIds.length}</strong>
          <span>in your plan</span>
          <small>Inspect your good intentions <ChevronRight size={13} /></small>
        </button>
      </div>

      <SectionHeading eyebrow="Pick a rabbit hole" title="Browse by vibe" />
      <div className="category-mosaic">
        {data.categories.slice(0, 6).map((category) => {
          const count = data.events.filter((event) => event.category === category).length;
          return (
            <button
              key={category}
              className="category-tile"
              style={categoryStyle(category)}
              onClick={() => onExplore(category)}
            >
              <span>{String(count).padStart(2, "0")}</span>
              <strong>{category}</strong>
              <ChevronRight size={18} />
            </button>
          );
        })}
      </div>
      <DisclaimerCard meta={data.meta} />
    </div>
  );
}

function ScheduleView({
  data,
  userState,
  profiles,
  initialCategory,
  onSelectDay,
  onEvent,
  onPlan,
  onFavorite,
}: {
  data: FestivalData;
  userState: LocalUserState;
  profiles: Map<number, FestivalProfile>;
  initialCategory: Category | null;
  onSelectDay: (date: string) => void;
  onEvent: (event: FestivalEvent) => void;
  onPlan: (id: string) => void;
  onFavorite: (ids: number[]) => void;
}) {
  const [query, setQuery] = useState(VIEW_MEMORY.schedule.query);
  const [category, setCategory] = useState<Category | "All">(
    initialCategory ?? VIEW_MEMORY.schedule.category,
  );
  const [favoritesOnly, setFavoritesOnly] = useState(
    VIEW_MEMORY.schedule.favoritesOnly,
  );
  useEffect(() => {
    VIEW_MEMORY.schedule = { query, category, favoritesOnly };
  }, [category, favoritesOnly, query]);
  const day = data.days.find((item) => item.date === userState.lastSelectedDay) ?? data.days[0];
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.events.filter((event) => {
      if (event.festivalDate !== day.date) return false;
      if (category !== "All" && event.category !== category) return false;
      if (
        favoritesOnly &&
        !event.profileIds.some((id) => userState.favoriteProfileIds.includes(id))
      ) return false;
      if (!needle) return true;
      return `${event.title} ${event.description} ${event.venue} ${event.category} ${event.tags.join(" ")}`
        .toLowerCase()
        .includes(needle);
    });
  }, [category, data.events, day.date, favoritesOnly, query, userState.favoriteProfileIds]);

  const grouped = useMemo(() => {
    const groups = new Map<string, FestivalEvent[]>();
    filtered.forEach((event) => {
      const key = event.start;
      groups.set(key, [...(groups.get(key) ?? []), event]);
    });
    return [...groups.entries()].sort(
      ([, left], [, right]) => left[0].sortMinutes - right[0].sortMinutes,
    );
  }, [filtered]);

  return (
    <div className="view-stack">
      <PageIntro
        eyebrow="The whole glorious mess"
        title="Build something resembling a plan"
        description="Search everything, save the exact times you fancy, then pretend you will not change your mind later."
      />
      <DaySelector days={data.days} selected={day.date} onSelect={onSelectDay} />

      <label className="search-field">
        <Search size={19} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search artists, workshops, places..."
          aria-label="Search the schedule"
        />
        {query && (
          <button onClick={() => setQuery("")} aria-label="Clear search"><X size={17} /></button>
        )}
      </label>

      <div className="filter-row" aria-label="Schedule filters">
        <button
          className={classNames("filter-chip", category === "All" && "is-active")}
          onClick={() => setCategory("All")}
          aria-pressed={category === "All"}
        >
          All
        </button>
        {data.categories.map((item) => (
          <button
            key={item}
            className={classNames("filter-chip", category === item && "is-active")}
            style={categoryStyle(item)}
            onClick={() => setCategory(item)}
            aria-pressed={category === item}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="schedule-toolbar">
        <p><strong>{filtered.length}</strong> possibilities for {day.name}</p>
        <button
          className={classNames("favorite-filter", favoritesOnly && "is-active")}
          onClick={() => setFavoritesOnly((value) => !value)}
          aria-pressed={favoritesOnly}
        >
          <Heart size={16} fill={favoritesOnly ? "currentColor" : "none"} /> Favorites
        </button>
      </div>

      {grouped.length === 0 ? (
        <EmptyState
          icon={<Search size={30} />}
          title="Nope. Nothing lives here."
          body="Try another phrase or category. The favorites filter may also be feeling dramatic."
        />
      ) : (
        <div className="agenda">
          {grouped.map(([time, events]) => (
            <section className="agenda-group" key={`${day.date}-${time}`}>
              <time>{time}</time>
              <div className="agenda-group__events">
                {events.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    profile={profiles.get(event.profileIds[0])}
                    favorite={event.profileIds.every((id) => userState.favoriteProfileIds.includes(id))}
                    planned={userState.plannedEventIds.includes(event.id)}
                    onOpen={() => onEvent(event)}
                    onPlan={() => onPlan(event.id)}
                    onFavorite={() => onFavorite(event.profileIds)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ExploreView({
  data,
  userState,
  profiles,
  initialCategory,
  onSelectDay,
  onEvent,
  onPlan,
  onFavorite,
}: {
  data: FestivalData;
  userState: LocalUserState;
  profiles: Map<number, FestivalProfile>;
  initialCategory: Category | null;
  onSelectDay: (date: string) => void;
  onEvent: (event: FestivalEvent) => void;
  onPlan: (id: string) => void;
  onFavorite: (ids: number[]) => void;
}) {
  const [activeCategory, setActiveCategory] = useState<Category>(
    initialCategory ?? VIEW_MEMORY.explore.category ?? data.categories[0],
  );
  const [collection, setCollection] = useState<string | null>(
    initialCategory ? null : VIEW_MEMORY.explore.collection,
  );
  const [visibleCount, setVisibleCount] = useState(24);
  const day = data.days.find((item) => item.date === userState.lastSelectedDay) ?? data.days[0];
  useEffect(() => {
    VIEW_MEMORY.explore = { category: activeCategory, collection };
  }, [activeCategory, collection]);
  const collectionRules: Array<{ label: string; tag: string; icon: ReactNode }> = [
    { label: "Dance until time gets blurry", tag: "Late night", icon: <Sparkles size={18} /> },
    { label: "Make things with your hands", tag: "Interactive", icon: <Compass size={18} /> },
    { label: "Tiny humans welcome", tag: "Family friendly", icon: <Heart size={18} /> },
    { label: "Fresh air, allegedly", tag: "Outdoors", icon: <MapPinned size={18} /> },
  ];
  useEffect(() => setVisibleCount(24), [activeCategory, collection, day.date]);
  const matching = data.events.filter((event) => {
    if (event.festivalDate !== day.date) return false;
    return collection
      ? event.tags.includes(collection)
      : event.category === activeCategory;
  });
  const visible = matching.slice(0, visibleCount);

  return (
    <div className="view-stack">
      <PageIntro
        eyebrow="Choose your own detour"
        title="Find your weird"
        description="Pick a mood, poke around, and see what happens. This is how sensible plans become better stories."
      />
      <DaySelector days={data.days} selected={day.date} onSelect={onSelectDay} />

      <div className="collection-grid">
        {collectionRules.map((item) => (
          <button
            key={item.tag}
            className={classNames("collection-card", collection === item.tag && "is-active")}
            onClick={() => setCollection(collection === item.tag ? null : item.tag)}
            aria-pressed={collection === item.tag}
          >
            <span>{item.icon}</span>
            <strong>{item.label}</strong>
            <small>
              {data.events.filter(
                (event) => event.festivalDate === day.date && event.tags.includes(item.tag),
              ).length} on {day.name}
            </small>
          </button>
        ))}
      </div>

      <SectionHeading eyebrow="Useful pigeonholes" title="Browse by type" />
      <div className="category-list">
        {data.categories.map((category) => (
          <button
            key={category}
            className={classNames("category-list__item", activeCategory === category && !collection && "is-active")}
            style={categoryStyle(category)}
            onClick={() => {
              setActiveCategory(category);
              setCollection(null);
            }}
            aria-pressed={activeCategory === category && !collection}
          >
            <span />
            <strong>{category}</strong>
            <b>
              {data.events.filter(
                (event) => event.festivalDate === day.date && event.category === category,
              ).length}
            </b>
          </button>
        ))}
      </div>

      <SectionHeading
        eyebrow={`${visible.length} of ${matching.length} on ${day.name}`}
        title={collection ? collectionRules.find((item) => item.tag === collection)?.label ?? collection : activeCategory}
      />
      <div className="event-grid">
        {visible.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            profile={profiles.get(event.profileIds[0])}
            favorite={event.profileIds.every((id) => userState.favoriteProfileIds.includes(id))}
            planned={userState.plannedEventIds.includes(event.id)}
            onOpen={() => onEvent(event)}
            onPlan={() => onPlan(event.id)}
            onFavorite={() => onFavorite(event.profileIds)}
          />
        ))}
      </div>
      {visible.length < matching.length && (
        <button
          className="load-more-button"
          onClick={() => setVisibleCount((count) => Math.min(count + 24, matching.length))}
        >
          Show 24 more <span>{matching.length - visible.length} still hiding</span>
        </button>
      )}
    </div>
  );
}

function PlanView({
  data,
  userState,
  profiles,
  onEvent,
  onPlan,
  onFavorite,
  onNavigate,
}: {
  data: FestivalData;
  userState: LocalUserState;
  profiles: Map<number, FestivalProfile>;
  onEvent: (event: FestivalEvent) => void;
  onPlan: (id: string) => void;
  onFavorite: (ids: number[]) => void;
  onNavigate: (tab: AppTab) => void;
}) {
  const planned = data.events
    .filter((event) => userState.plannedEventIds.includes(event.id))
    .sort((left, right) => left.startIso.localeCompare(right.startIso));
  const conflictPairs: Array<[FestivalEvent, FestivalEvent]> = [];
  planned.forEach((event, index) => {
    planned.slice(index + 1).forEach((other) => {
      if (eventsOverlap(event, other)) conflictPairs.push([event, other]);
    });
  });
  const conflictPartners = new Map<string, FestivalEvent[]>();
  conflictPairs.forEach(([left, right]) => {
    conflictPartners.set(left.id, [...(conflictPartners.get(left.id) ?? []), right]);
    conflictPartners.set(right.id, [...(conflictPartners.get(right.id) ?? []), left]);
  });
  const favorites = data.profiles.filter((profile) =>
    userState.favoriteProfileIds.includes(profile.id),
  );

  return (
    <div className="view-stack">
      <PageIntro
        eyebrow="Your extremely official unofficial plan"
        title="My Plan"
        description="It lives only in this browser. No account, no tracking, and no little algorithm judging your taste."
      />
      <div className="plan-summary">
        <div><strong>{planned.length}</strong><span>planned moments</span></div>
        <div><strong>{favorites.length}</strong><span>favorite profiles</span></div>
        <div className={classNames(conflictPairs.length > 0 && "has-conflict")}>
          <strong>{conflictPairs.length}</strong><span>clashes</span>
        </div>
      </div>

      {planned.length === 0 ? (
        <EmptyState
          icon={<CalendarPlus size={32} />}
          title="A beautiful blank mess"
          body="Add exact performances from the schedule. You can still heart artists while refusing to commit to a time."
          action={<button className="primary-button" onClick={() => onNavigate("schedule")}>Browse schedule</button>}
        />
      ) : (
        data.days.map((day) => {
          const dayEvents = planned.filter((event) => event.festivalDate === day.date);
          if (dayEvents.length === 0) return null;
          return (
            <section key={day.date} className="plan-day">
              <SectionHeading eyebrow={day.name} title={day.label} />
              <div className="plan-timeline">
                {dayEvents.map((event) => (
                  <div className={classNames("plan-entry", conflictPartners.has(event.id) && "has-conflict")} key={event.id}>
                    <time>{event.start}</time>
                    <EventCard
                      event={event}
                      profile={profiles.get(event.profileIds[0])}
                      favorite={event.profileIds.every((id) => userState.favoriteProfileIds.includes(id))}
                      planned
                      conflict={conflictPartners.has(event.id)}
                      conflictLabel={
                        conflictPartners.has(event.id)
                          ? `Clashes with ${conflictPartners.get(event.id)!.map((item) => item.title).join(", ")}`
                          : undefined
                      }
                      onOpen={() => onEvent(event)}
                      onPlan={() => onPlan(event.id)}
                      onFavorite={() => onFavorite(event.profileIds)}
                    />
                  </div>
                ))}
              </div>
            </section>
          );
        })
      )}

      {favorites.length > 0 && (
        <>
          <SectionHeading eyebrow="Keep close" title="Favorite profiles" />
          <div className="profile-row">
            {favorites.map((profile) => (
              <button
                key={profile.id}
                className="profile-bubble"
                onClick={() => {
                  const event = data.events.find((item) => item.profileIds.includes(profile.id));
                  if (event) onEvent(event);
                }}
              >
                <ProfileImage profile={profile} />
                <span>{profile.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MapView({
  data,
  selectedVenue,
  onVenue,
  onEvent,
  onShowInfo,
}: {
  data: FestivalData;
  selectedVenue: string | null;
  onVenue: (venue: string) => void;
  onEvent: (event: FestivalEvent) => void;
  onShowInfo: () => void;
}) {
  const [mapType, setMapType] = useState<"festival" | "camping">("festival");
  const [venueQuery, setVenueQuery] = useState("");
  const [zoom, setZoom] = useState(1);
  const mapRef = useRef<HTMLDivElement>(null);
  const venueEntries = useMemo(() => {
    const entries = new Map<string, { key: string; name: string; events: FestivalEvent[] }>();

    data.events.forEach((event) => {
      const name = event.venue.trim().replace(/\s+/g, " ");
      const key = name.normalize("NFKC").toLocaleLowerCase("en");
      const existing = entries.get(key);

      if (existing) {
        existing.events.push(event);
      } else {
        entries.set(key, { key, name, events: [event] });
      }
    });

    return [...entries.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [data.events]);
  const selectedVenueKey = selectedVenue
    ?.trim()
    .replace(/\s+/g, " ")
    .normalize("NFKC")
    .toLocaleLowerCase("en");
  const selectedVenueEntry = venueEntries.find((entry) => entry.key === selectedVenueKey);
  const activeVenueName = selectedVenueEntry?.name ?? selectedVenue;
  const venues = venueEntries.filter((entry) =>
    entry.name.toLocaleLowerCase("en").includes(venueQuery.trim().toLocaleLowerCase("en")),
  );
  const venueGroups = venues.reduce<
    Array<{
      key: string;
      name: string;
      nested: boolean;
      venues: typeof venueEntries;
    }>
  >((groups, venue) => {
    const separatorIndex = venue.name.indexOf(" · ");
    const nested = separatorIndex >= 0;
    const name = nested ? venue.name.slice(0, separatorIndex) : venue.name;
    const key = name.normalize("NFKC").toLocaleLowerCase("en");
    const existing = groups.find((group) => group.key === key && group.nested === nested);

    if (existing) {
      existing.venues.push(venue);
    } else {
      groups.push({ key, name, nested, venues: [venue] });
    }

    return groups;
  }, []);
  const venueEvents = selectedVenueEntry
    ? [...selectedVenueEntry.events].sort(
        (left, right) => festivalTimestamp(left.startIso) - festivalTimestamp(right.startIso),
      )
    : [];

  useEffect(() => {
    if (!selectedVenue) return;
    setMapType("festival");
    window.requestAnimationFrame(() =>
      mapRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }, [selectedVenue]);

  return (
    <div className="view-stack">
      <PageIntro
        eyebrow="Forty-one places. Excellent odds of getting lost."
        title="Where am I again?"
        description="Drag the official map, use the big zoom buttons, or tap a place to see what happens there."
      />
      <div className="segmented-control" aria-label="Map type">
        <button
          className={classNames(mapType === "festival" && "is-active")}
          onClick={() => setMapType("festival")}
          aria-pressed={mapType === "festival"}
        >
          Festival
        </button>
        <button
          className={classNames(mapType === "camping" && "is-active")}
          onClick={() => setMapType("camping")}
          aria-pressed={mapType === "camping"}
        >
          Camping
        </button>
      </div>
      {selectedVenue && (
        <section className="selected-venue" aria-live="polite">
          <div>
            <p className="eyebrow">Selected place</p>
            <h2>{activeVenueName}</h2>
            <p>{venueEvents.length} happenings across the festival</p>
          </div>
          <MapPinned size={24} />
        </section>
      )}
      <div className="map-shell" ref={mapRef}>
        <div className="map-frame">
          <div
            className="map-canvas"
            style={{
              width: `${zoom * 100}%`,
              minWidth: `${42 * zoom}rem`,
            }}
          >
            <img
              src={assetUrl(data.maps[mapType]) ?? ""}
              alt={`${mapType === "festival" ? "Festival" : "Camping"} map`}
              loading="lazy"
            />
          </div>
          <span>
            <LocateFixed size={15} />
            {activeVenueName ? `${activeVenueName} selected` : "Drag to investigate"}
          </span>
        </div>
        <div className="map-zoom" aria-label="Map zoom">
          <button
            onClick={() => setZoom((value) => Math.min(2.5, value + 0.25))}
            aria-label="Zoom map in"
            disabled={zoom >= 2.5}
          >
            <ZoomIn size={21} />
          </button>
          <button
            onClick={() => setZoom(1)}
            aria-label="Reset map zoom"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={() => setZoom((value) => Math.max(1, value - 0.25))}
            aria-label="Zoom map out"
            disabled={zoom <= 1}
          >
            <ZoomOut size={21} />
          </button>
        </div>
      </div>
      {selectedVenue && (
        <section className="venue-programme">
          <SectionHeading eyebrow="At this place" title="Happenings here" />
          <div>
            {venueEvents.map((event) => (
              <button key={event.id} onClick={() => onEvent(event)}>
                <time>{event.dayLabel} · {event.start}</time>
                <strong>{event.title}</strong>
                <ChevronRight size={18} />
              </button>
            ))}
          </div>
        </section>
      )}
      <button className="info-banner" onClick={onShowInfo}>
        <span><Info size={21} /></span>
        <div>
          <strong>Useful things before chaos begins</strong>
          <small>Opening times, camping, care, family info, and other sensible bits</small>
        </div>
        <ChevronRight size={20} />
      </button>
      <SectionHeading eyebrow="Wayfinding, more or less" title="The big list of places" />
      <label className="search-field">
        <Search size={19} />
        <input
          value={venueQuery}
          onChange={(event) => setVenueQuery(event.target.value)}
          placeholder="Find a venue..."
          aria-label="Search venues"
        />
      </label>
      <div className="venue-list">
        {venueGroups.map((group) =>
          group.nested ? (
            <section className="venue-list__group" key={`group-${group.key}`}>
              <header>
                <MapPinned size={18} />
                <strong>{group.name}</strong>
                <small>{group.venues.length} spaces</small>
              </header>
              <div>
                {group.venues.map((venue) => (
                  <button
                    key={venue.key}
                    className={classNames(selectedVenueKey === venue.key && "is-active")}
                    onClick={() => onVenue(venue.name)}
                    aria-label={`${venue.name}, ${venue.events.length} happenings`}
                    aria-pressed={selectedVenueKey === venue.key}
                  >
                    <span>{venue.name.slice(venue.name.indexOf(" · ") + 3)}</span>
                    <b>{venue.events.length}</b>
                    <ChevronRight size={17} />
                  </button>
                ))}
              </div>
            </section>
          ) : (
            group.venues.map((venue) => (
              <button
                key={venue.key}
                className={classNames(selectedVenueKey === venue.key && "is-active")}
                onClick={() => onVenue(venue.name)}
                aria-label={`${venue.name}, ${venue.events.length} happenings`}
                aria-pressed={selectedVenueKey === venue.key}
              >
                <MapPinned size={17} />
                <span>{venue.name}</span>
                <b>{venue.events.length}</b>
                <ChevronRight size={17} />
              </button>
            ))
          ),
        )}
      </div>
    </div>
  );
}

function EventCard({
  event,
  profile,
  favorite,
  planned,
  conflict = false,
  conflictLabel,
  compact = false,
  onOpen,
  onPlan,
  onFavorite,
}: {
  event: FestivalEvent;
  profile?: FestivalProfile;
  favorite: boolean;
  planned: boolean;
  conflict?: boolean;
  conflictLabel?: string;
  compact?: boolean;
  onOpen: () => void;
  onPlan: () => void;
  onFavorite: () => void;
}) {
  const image = assetUrl(event.image ?? profile?.image ?? null);
  return (
    <article
      className={classNames("event-card", compact && "event-card--compact", conflict && "has-conflict")}
      style={categoryStyle(event.category)}
    >
      <button className="event-card__main" onClick={onOpen} aria-label={`Open ${event.title}`}>
        <div
          className={classNames("event-card__art", !image && "event-card__art--fallback")}
        >
          {image && (
            <img
              src={image}
              alt=""
              loading="lazy"
              decoding="async"
              width={400}
              height={260}
            />
          )}
          {!image && <span>{event.title.slice(0, 1)}</span>}
          <b>{event.category}</b>
        </div>
        <div className="event-card__copy">
          <div className="event-card__time">
            <Clock3 size={14} />
            {event.dayLabel} · {formatTimeRange(event)}
          </div>
          <h3>{event.title}</h3>
          <p><MapPinned size={14} /> {event.venue}</p>
          {conflict && (
            <strong className="conflict-label">
              {conflictLabel ?? "Overlaps another plan"}
            </strong>
          )}
        </div>
      </button>
      <div className="event-card__actions">
        <button
          className={classNames("card-action", favorite && "is-favorite")}
          onClick={onFavorite}
          aria-label={
            favorite
              ? `Unfavorite contributors to ${event.title}`
              : `Favorite contributors to ${event.title}`
          }
          aria-pressed={favorite}
        >
          <Heart size={18} fill={favorite ? "currentColor" : "none"} />
        </button>
        <button
          className={classNames("card-action", planned && "is-planned")}
          onClick={onPlan}
          aria-label={planned ? `Remove ${event.title} from My Plan` : `Add ${event.title} to My Plan`}
          aria-pressed={planned}
        >
          {planned ? <Check size={19} /> : <CalendarPlus size={18} />}
          <span>{planned ? "Planned" : "Plan"}</span>
        </button>
      </div>
    </article>
  );
}

function EventSheet({
  event,
  profiles,
  favoriteProfileIds,
  planned,
  onClose,
  onFavorite,
  onFavoriteGroup,
  onPlan,
}: {
  event: FestivalEvent;
  profiles: Map<number, FestivalProfile>;
  favoriteProfileIds: number[];
  planned: boolean;
  onClose: () => void;
  onFavorite: (id: number) => void;
  onFavoriteGroup: () => void;
  onPlan: () => void;
}) {
  const contributors = event.profileIds
    .map((id) => profiles.get(id))
    .filter((profile): profile is FestivalProfile => Boolean(profile));
  const primaryProfile = contributors[0];
  const image = assetUrl(event.image ?? primaryProfile?.image ?? null);
  const allFavorited = event.profileIds.every((id) => favoriteProfileIds.includes(id));
  const dialogRef = useDialogFocus(onClose);

  return (
    <div className="sheet-layer" role="dialog" aria-modal="true" aria-labelledby="event-sheet-title">
      <button className="sheet-scrim" onClick={onClose} aria-label="Close event details" />
      <article className="sheet event-sheet" ref={dialogRef} tabIndex={-1}>
        <div
          className={classNames("event-sheet__hero", !image && "event-sheet__hero--fallback")}
          style={image ? { backgroundImage: `url("${image}")` } : categoryStyle(event.category)}
        >
          <button className="sheet-close" onClick={onClose} aria-label="Close">
            <X size={21} />
          </button>
          <span style={categoryStyle(event.category)}>{event.category}</span>
        </div>
        <div className="sheet__content">
          <p className="eyebrow">{event.dayName} · {formatTimeRange(event)}</p>
          <h2 id="event-sheet-title">{event.title}</h2>
          <p className="event-sheet__venue"><MapPinned size={17} /> {event.venue}</p>
          <div className="event-sheet__actions">
            <button
              className={classNames("secondary-button", allFavorited && "is-favorite")}
              onClick={onFavoriteGroup}
              aria-pressed={allFavorited}
            >
              <Heart size={18} fill={allFavorited ? "currentColor" : "none"} />
              {allFavorited ? "Contributors saved" : "Save contributors"}
            </button>
            <button className={classNames("primary-button", planned && "is-planned")} onClick={onPlan}>
              {planned ? <Check size={18} /> : <CalendarPlus size={18} />}
              {planned ? "In My Plan" : "Add to My Plan"}
            </button>
          </div>
          {event.tags.length > 0 && (
            <div className="tag-list">
              {event.tags.map((tag) => <span key={tag}>{tag}</span>)}
            </div>
          )}
          {event.description ? (
            <div className="long-copy">
              <p>{event.description}</p>
              {event.descriptionIsExcerpt && <small>Translated profile excerpt</small>}
            </div>
          ) : (
            <p className="muted-copy">
              This mysterious happening arrived without a biography. Bold choice.
            </p>
          )}
          {contributors.length > 1 && (
            <div className="contributors">
              <p className="eyebrow">Contributors</p>
              <div>
                {contributors.map((profile) => (
                  <button
                    key={profile.id}
                    onClick={() => onFavorite(profile.id)}
                    className={classNames(
                      favoriteProfileIds.includes(profile.id) && "is-favorite",
                    )}
                    aria-pressed={favoriteProfileIds.includes(profile.id)}
                  >
                    <ProfileImage profile={profile} />
                    <span>{profile.name}</span>
                    <Heart
                      size={15}
                      fill={favoriteProfileIds.includes(profile.id) ? "currentColor" : "none"}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </article>
    </div>
  );
}

function ConflictPrompt({
  event,
  conflicts,
  onCancel,
  onConfirm,
}: {
  event: FestivalEvent;
  conflicts: FestivalEvent[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useDialogFocus(onCancel);
  return (
    <div
      className="decision-layer"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="conflict-title"
      aria-describedby="conflict-description"
    >
      <button className="sheet-scrim" onClick={onCancel} aria-label="Cancel adding this event" />
      <section className="conflict-prompt" ref={dialogRef} tabIndex={-1}>
        <Clock3 size={28} />
        <p className="eyebrow">Tiny time collision</p>
        <h2 id="conflict-title">{event.title} overlaps your plan</h2>
        <p id="conflict-description">
          It clashes with {conflicts.map((item) => item.title).join(", ")}. Keep both only
          if your future self enjoys ambitious teleportation.
        </p>
        <div>
          <button className="secondary-button" onClick={onCancel}>Cancel</button>
          <button className="primary-button" onClick={onConfirm}>Keep both</button>
        </div>
      </section>
    </div>
  );
}

function InfoSheet({
  data,
  initialTopic,
  highlightedEntry,
  onClose,
}: {
  data: FestivalData;
  initialTopic?: string;
  highlightedEntry?: string;
  onClose: () => void;
}) {
  const [activeTopic, setActiveTopic] = useState(initialTopic ?? data.info[0]?.id ?? "");
  const topic = data.info.find((item) => item.id === activeTopic) ?? data.info[0];
  const dialogRef = useDialogFocus(onClose);

  useEffect(() => {
    if (initialTopic) setActiveTopic(initialTopic);
  }, [initialTopic]);

  return (
    <div className="sheet-layer" role="dialog" aria-modal="true" aria-labelledby="info-sheet-title">
      <button className="sheet-scrim" onClick={onClose} aria-label="Close practical information" />
      <article className="sheet info-sheet" ref={dialogRef} tabIndex={-1}>
        <div className="sheet__header">
          <div>
            <p className="eyebrow">The sensible corner</p>
            <h2 id="info-sheet-title">Read this before improvising everything</h2>
          </div>
          <button className="sheet-close sheet-close--inline" onClick={onClose} aria-label="Close">
            <X size={21} />
          </button>
        </div>
        <section className="safety-card">
          <LifeBuoy size={23} />
          <div>
            <strong>Need help? Use plain words. You are not bothering anyone.</strong>
            <p>
              PsyCare is the quiet support space at the Natural High field. For urgent
              medical help, ask security or any crew member for First Aid. Call 112 in
              an emergency.
            </p>
          </div>
        </section>
        <div className="filter-row info-topics">
          {data.info.map((item) => (
            <button
              key={item.id}
              className={classNames("filter-chip", item.id === topic.id && "is-active")}
              onClick={() => setActiveTopic(item.id)}
              aria-pressed={item.id === topic.id}
            >
              {item.title}
            </button>
          ))}
        </div>
        <div className="info-entries">
          {topic.entries.map((entry) => (
            <details key={`${topic.id}-${entry.id}`} open={entry.id === highlightedEntry || undefined}>
              <summary>{entry.title}<ChevronRight size={18} /></summary>
              <p>{entry.description}</p>
              {entry.descriptionIsExcerpt && <small>Translated source excerpt</small>}
            </details>
          ))}
        </div>
        <DisclaimerCard meta={data.meta} />
      </article>
    </div>
  );
}

function DaySelector({
  days,
  selected,
  onSelect,
}: {
  days: FestivalData["days"];
  selected: string;
  onSelect: (date: string) => void;
}) {
  return (
    <div className="day-selector" aria-label="Festival day">
      {days.map((day) => (
        <button
          key={day.date}
          className={classNames(day.date === selected && "is-active")}
          onClick={() => onSelect(day.date)}
          aria-pressed={day.date === selected}
        >
          <small>{day.name.slice(0, 3)}</small>
          <strong>{day.date.slice(-2)}</strong>
          <span>Jul</span>
        </button>
      ))}
    </div>
  );
}

function PageIntro({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="page-intro">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}

function SectionHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>
      {action}
    </div>
  );
}

function ProfileImage({ profile }: { profile: FestivalProfile }) {
  const image = assetUrl(profile.image);
  return image ? (
    <img src={image} alt="" loading="lazy" />
  ) : (
    <i aria-hidden="true">{profile.name.slice(0, 1)}</i>
  );
}

function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span>{icon}</span>
      <h2>{title}</h2>
      <p>{body}</p>
      {action}
    </div>
  );
}

function DisclaimerCard({ meta }: { meta: FestivalData["meta"] }) {
  return (
    <footer className="disclaimer-card">
      <div>
        <strong>Dear Ruigoord: please don’t sue me. I love you guys; I just can’t read Dutch. 🫂💚</strong>
        <p>
          An unofficial English field guide, translated with love. Programme snapshot from{" "}
          {new Date(meta.sourceUpdatedAt).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}.
        </p>
      </div>
    </footer>
  );
}

export default App;
