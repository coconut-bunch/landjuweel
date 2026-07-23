import {
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronRight,
  Clock3,
  Compass,
  Heart,
  Info,
  ListChecks,
  LocateFixed,
  Map as MapIcon,
  MapPinned,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
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

function localDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function minutesUntil(event: FestivalEvent, now: Date): number {
  return Math.round((new Date(event.startIso).getTime() - now.getTime()) / 60_000);
}

function isHappening(event: FestivalEvent, now: Date): boolean {
  const timestamp = now.getTime();
  return (
    new Date(event.startIso).getTime() <= timestamp &&
    new Date(event.endIso).getTime() > timestamp
  );
}

function eventsOverlap(left: FestivalEvent, right: FestivalEvent): boolean {
  return (
    new Date(left.startIso).getTime() < new Date(right.endIso).getTime() &&
    new Date(left.endIso).getTime() > new Date(right.startIso).getTime()
  );
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
        if (alive) setData(festival);
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
  const [tab, setTab] = useState<AppTab>("now");
  const [exploreCategory, setExploreCategory] = useState<Category | null>(null);
  const [userState, setUserState] = useState<LocalUserState | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<FestivalEvent | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    if (data && !userState) {
      const today = localDateKey(new Date());
      const initialDay = data.days.some((day) => day.date === today)
        ? today
        : data.days[0].date;
      setUserState(loadUserState(initialDay));
    }
  }, [data, userState]);

  useEffect(() => {
    if (userState) saveUserState(userState);
  }, [userState]);

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

  const togglePlanned = (eventId: string) => {
    updateUserState((current) => {
      const plannedEventIds = current.plannedEventIds.includes(eventId)
        ? current.plannedEventIds.filter((id) => id !== eventId)
        : [...current.plannedEventIds, eventId];
      return { ...current, plannedEventIds };
    });
  };

  const selectDay = (date: string) => {
    updateUserState((current) => ({ ...current, lastSelectedDay: date }));
  };

  return (
    <div className="app-shell">
      <PsychedelicBackdrop />
      <a className="skip-link" href="#main-content">Skip to programme</a>
      <header className="app-header">
        <button className="brand-lockup" onClick={() => setTab("now")} aria-label="Go to Now">
          <span className="brand-mark">
            <img src={assetUrl("icon-512.png") ?? ""} alt="" />
          </span>
          <span>
            <strong>Landjuweel</strong>
            <small>Pocket field guide</small>
          </span>
        </button>
        <div className="header-actions">
          <button className="icon-button" onClick={() => setShowInfo(true)} aria-label="Practical information">
            <Info size={20} />
          </button>
        </div>
      </header>

      <main className="app-main" id="main-content">
        {tab === "now" && (
          <NowView
            data={data}
            userState={userState}
            profiles={profiles}
            onEvent={setSelectedEvent}
            onPlan={togglePlanned}
            onFavorite={toggleFavorite}
            onNavigate={setTab}
            onExplore={(category) => {
              setExploreCategory(category);
              setTab("explore");
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
            onEvent={setSelectedEvent}
            onPlan={togglePlanned}
            onFavorite={toggleFavorite}
          />
        )}
        {tab === "explore" && (
          <ExploreView
            data={data}
            userState={userState}
            profiles={profiles}
            initialCategory={exploreCategory}
            onEvent={setSelectedEvent}
            onPlan={togglePlanned}
            onFavorite={toggleFavorite}
          />
        )}
        {tab === "plan" && (
          <PlanView
            data={data}
            userState={userState}
            profiles={profiles}
            onEvent={setSelectedEvent}
            onPlan={togglePlanned}
            onFavorite={toggleFavorite}
            onNavigate={setTab}
          />
        )}
        {tab === "map" && <MapView data={data} onShowInfo={() => setShowInfo(true)} />}
      </main>

      <nav className="bottom-nav" aria-label="Primary">
        {TAB_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={classNames("bottom-nav__item", tab === item.id && "is-active")}
              onClick={() => setTab(item.id)}
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
          onClose={() => setSelectedEvent(null)}
          onFavorite={toggleFavorite}
          onPlan={() => togglePlanned(selectedEvent.id)}
        />
      )}
      {showInfo && <InfoSheet data={data} onClose={() => setShowInfo(false)} />}
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
  onFavorite: (id: number) => void;
  onNavigate: (tab: AppTab) => void;
  onExplore: (category: Category) => void;
}) {
  const now = new Date();
  const today = localDateKey(now);
  const activeDay = data.days.some((day) => day.date === today)
    ? today
    : userState.lastSelectedDay;
  const day = data.days.find((item) => item.date === activeDay) ?? data.days[0];
  const dayEvents = data.events.filter((event) => event.festivalDate === day.date);
  const happening = dayEvents.filter((event) => isHappening(event, now));
  const upcoming = dayEvents
    .filter((event) => new Date(event.startIso).getTime() > now.getTime())
    .slice(0, 8);
  const planned = data.events
    .filter((event) => userState.plannedEventIds.includes(event.id))
    .filter((event) => new Date(event.endIso).getTime() > now.getTime())
    .sort((a, b) => a.startIso.localeCompare(b.startIso));
  const nextPlanned = planned[0];

  return (
    <div className="view-stack">
      <div className="hero-block">
        <section className="hero-card">
          <img
            className="hero-card__art"
            src={assetUrl("landjuweel-dali-hero.png") ?? ""}
            alt="Surreal watercolor elephants crossing the Dutch wetlands toward Landjuweel"
          />
          <div className="hero-card__caption">
            <p className="eyebrow">{day.name} at Ruigoord</p>
            <h1>Find your way through the wild.</h1>
          </div>
        </section>
        <div className="hero-card__actions">
          <button className="primary-button" onClick={() => onNavigate("schedule")}>
            Schedule <ChevronRight size={18} />
          </button>
          <button className="secondary-button" onClick={() => onNavigate("map")}>
            <MapPinned size={17} /> Map
          </button>
        </div>
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
      <div className="event-grid event-grid--horizontal">
        {(happening.length > 0 ? happening : upcoming).slice(0, 8).map((event) => (
          <EventCard
            key={event.id}
            event={event}
            profile={profiles.get(event.profileIds[0])}
            favorite={event.profileIds.some((id) => userState.favoriteProfileIds.includes(id))}
            planned={userState.plannedEventIds.includes(event.id)}
            onOpen={() => onEvent(event)}
            onPlan={() => onPlan(event.id)}
            onFavorite={() => onFavorite(event.profileIds[0])}
            compact
          />
        ))}
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
  onFavorite: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | "All">("All");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
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
        >
          All
        </button>
        {data.categories.map((item) => (
          <button
            key={item}
            className={classNames("filter-chip", category === item && "is-active")}
            style={categoryStyle(item)}
            onClick={() => setCategory(item)}
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
                    favorite={event.profileIds.some((id) => userState.favoriteProfileIds.includes(id))}
                    planned={userState.plannedEventIds.includes(event.id)}
                    onOpen={() => onEvent(event)}
                    onPlan={() => onPlan(event.id)}
                    onFavorite={() => onFavorite(event.profileIds[0])}
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
  onEvent,
  onPlan,
  onFavorite,
}: {
  data: FestivalData;
  userState: LocalUserState;
  profiles: Map<number, FestivalProfile>;
  initialCategory: Category | null;
  onEvent: (event: FestivalEvent) => void;
  onPlan: (id: string) => void;
  onFavorite: (id: number) => void;
}) {
  const [activeCategory, setActiveCategory] = useState<Category>(
    initialCategory ?? data.categories[0],
  );
  const [collection, setCollection] = useState<string | null>(null);
  useEffect(() => {
    if (initialCategory) {
      setActiveCategory(initialCategory);
      setCollection(null);
    }
  }, [initialCategory]);
  const collectionRules: Array<{ label: string; tag: string; icon: ReactNode }> = [
    { label: "Dance until time gets blurry", tag: "Late night", icon: <Sparkles size={18} /> },
    { label: "Make things with your hands", tag: "Interactive", icon: <Compass size={18} /> },
    { label: "Tiny humans welcome", tag: "Family friendly", icon: <Heart size={18} /> },
    { label: "Fresh air, allegedly", tag: "Outdoors", icon: <MapPinned size={18} /> },
  ];
  const visible = collection
    ? data.events.filter((event) => event.tags.includes(collection)).slice(0, 24)
    : data.events.filter((event) => event.category === activeCategory).slice(0, 24);

  return (
    <div className="view-stack">
      <PageIntro
        eyebrow="Choose your own detour"
        title="Find your weird"
        description="Pick a mood, poke around, and see what happens. This is how sensible plans become better stories."
      />

      <div className="collection-grid">
        {collectionRules.map((item) => (
          <button
            key={item.tag}
            className={classNames("collection-card", collection === item.tag && "is-active")}
            onClick={() => setCollection(collection === item.tag ? null : item.tag)}
          >
            <span>{item.icon}</span>
            <strong>{item.label}</strong>
            <small>{data.events.filter((event) => event.tags.includes(item.tag)).length} picks</small>
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
          >
            <span />
            <strong>{category}</strong>
            <b>{data.events.filter((event) => event.category === category).length}</b>
          </button>
        ))}
      </div>

      <SectionHeading
        eyebrow={collection ? "Curated current" : "Selected frequency"}
        title={collection ? collectionRules.find((item) => item.tag === collection)?.label ?? collection : activeCategory}
      />
      <div className="event-grid">
        {visible.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            profile={profiles.get(event.profileIds[0])}
            favorite={event.profileIds.some((id) => userState.favoriteProfileIds.includes(id))}
            planned={userState.plannedEventIds.includes(event.id)}
            onOpen={() => onEvent(event)}
            onPlan={() => onPlan(event.id)}
            onFavorite={() => onFavorite(event.profileIds[0])}
          />
        ))}
      </div>
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
  onFavorite: (id: number) => void;
  onNavigate: (tab: AppTab) => void;
}) {
  const planned = data.events
    .filter((event) => userState.plannedEventIds.includes(event.id))
    .sort((left, right) => left.startIso.localeCompare(right.startIso));
  const conflicts = new Set<string>();
  planned.forEach((event, index) => {
    planned.slice(index + 1).forEach((other) => {
      if (eventsOverlap(event, other)) {
        conflicts.add(event.id);
        conflicts.add(other.id);
      }
    });
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
        <div className={classNames(conflicts.size > 0 && "has-conflict")}>
          <strong>{conflicts.size}</strong><span>conflicts</span>
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
                  <div className={classNames("plan-entry", conflicts.has(event.id) && "has-conflict")} key={event.id}>
                    <time>{event.start}</time>
                    <EventCard
                      event={event}
                      profile={profiles.get(event.profileIds[0])}
                      favorite={event.profileIds.some((id) => userState.favoriteProfileIds.includes(id))}
                      planned
                      conflict={conflicts.has(event.id)}
                      onOpen={() => onEvent(event)}
                      onPlan={() => onPlan(event.id)}
                      onFavorite={() => onFavorite(event.profileIds[0])}
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

function MapView({ data, onShowInfo }: { data: FestivalData; onShowInfo: () => void }) {
  const [mapType, setMapType] = useState<"festival" | "camping">("festival");
  const [venueQuery, setVenueQuery] = useState("");
  const venues = [...new Set(data.events.map((event) => event.venue))]
    .filter((venue) => venue.toLowerCase().includes(venueQuery.toLowerCase()))
    .sort();

  return (
    <div className="view-stack">
      <PageIntro
        eyebrow="Forty-one places. Excellent odds of getting lost."
        title="Where am I again?"
        description="Pinch and zoom the official map, then use the venue list when confidence fails."
      />
      <div className="segmented-control">
        <button className={classNames(mapType === "festival" && "is-active")} onClick={() => setMapType("festival")}>
          Festival
        </button>
        <button className={classNames(mapType === "camping" && "is-active")} onClick={() => setMapType("camping")}>
          Camping
        </button>
      </div>
      <div className="map-frame">
        <img src={assetUrl(data.maps[mapType]) ?? ""} alt={`${mapType === "festival" ? "Festival" : "Camping"} map`} />
        <span><LocateFixed size={15} /> Pinch to investigate</span>
      </div>
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
        {venues.map((venue) => (
          <div key={venue}>
            <MapPinned size={17} />
            <span>{venue}</span>
            <b>{data.events.filter((event) => event.venue === venue).length}</b>
          </div>
        ))}
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
          style={image ? { backgroundImage: `url("${image}")` } : undefined}
        >
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
          {conflict && <strong className="conflict-label">Overlaps another plan</strong>}
        </div>
      </button>
      <div className="event-card__actions">
        <button
          className={classNames("card-action", favorite && "is-favorite")}
          onClick={onFavorite}
          aria-label={favorite ? `Unfavorite ${event.title}` : `Favorite ${event.title}`}
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
  onPlan,
}: {
  event: FestivalEvent;
  profiles: Map<number, FestivalProfile>;
  favoriteProfileIds: number[];
  planned: boolean;
  onClose: () => void;
  onFavorite: (id: number) => void;
  onPlan: () => void;
}) {
  const contributors = event.profileIds
    .map((id) => profiles.get(id))
    .filter((profile): profile is FestivalProfile => Boolean(profile));
  const primaryProfile = contributors[0];
  const image = assetUrl(event.image ?? primaryProfile?.image ?? null);

  useEffect(() => {
    const onKeyDown = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="sheet-layer" role="dialog" aria-modal="true" aria-labelledby="event-sheet-title">
      <button className="sheet-scrim" onClick={onClose} aria-label="Close event details" />
      <article className="sheet event-sheet">
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
              className={classNames("secondary-button", favoriteProfileIds.includes(event.profileIds[0]) && "is-favorite")}
              onClick={() => onFavorite(event.profileIds[0])}
            >
              <Heart size={18} fill={favoriteProfileIds.includes(event.profileIds[0]) ? "currentColor" : "none"} />
              {favoriteProfileIds.includes(event.profileIds[0]) ? "Favorited" : "Favorite"}
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
                  <span key={profile.id}><ProfileImage profile={profile} /> {profile.name}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </article>
    </div>
  );
}

function InfoSheet({ data, onClose }: { data: FestivalData; onClose: () => void }) {
  const [activeTopic, setActiveTopic] = useState(data.info[0]?.id ?? "");
  const topic = data.info.find((item) => item.id === activeTopic) ?? data.info[0];

  return (
    <div className="sheet-layer" role="dialog" aria-modal="true" aria-labelledby="info-sheet-title">
      <button className="sheet-scrim" onClick={onClose} aria-label="Close practical information" />
      <article className="sheet info-sheet">
        <div className="sheet__header">
          <div>
            <p className="eyebrow">The sensible corner</p>
            <h2 id="info-sheet-title">Read this before improvising everything</h2>
          </div>
          <button className="sheet-close sheet-close--inline" onClick={onClose} aria-label="Close">
            <X size={21} />
          </button>
        </div>
        <div className="filter-row info-topics">
          {data.info.map((item) => (
            <button
              key={item.id}
              className={classNames("filter-chip", item.id === topic.id && "is-active")}
              onClick={() => setActiveTopic(item.id)}
            >
              {item.title}
            </button>
          ))}
        </div>
        <div className="info-entries">
          {topic.entries.map((entry) => (
            <details key={entry.id}>
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
    <div className="disclaimer-card">
      <Sparkles size={19} />
      <div>
        <strong>Made by festival-goers with questionable sleep schedules.</strong>
        <p>
          Unofficial English field guide. Programme snapshot from{" "}
          {new Date(meta.sourceUpdatedAt).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}.
        </p>
      </div>
    </div>
  );
}

export default App;
