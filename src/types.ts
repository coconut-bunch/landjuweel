export type Category =
  | "Live Music"
  | "DJ & Electronic"
  | "Workshops & Hands-on"
  | "Wellness & Ritual"
  | "Theatre & Performance"
  | "Art & Installations"
  | "Talks & Community"
  | "Kids & Family"
  | "Activities & Pop-ups";

export interface FestivalMeta {
  name: string;
  sourceVersion: string;
  sourceUpdatedAt: string;
  generatedAt: string;
  eventCount: number;
  profileCount: number;
  unofficial: boolean;
}

export interface FestivalDay {
  date: string;
  name: string;
  label: string;
}

export interface FestivalProfile {
  id: number;
  name: string;
  description: string;
  descriptionIsExcerpt: boolean;
  image: string | null;
}

export interface FestivalEvent {
  id: string;
  profileIds: number[];
  title: string;
  description: string;
  descriptionIsExcerpt: boolean;
  festivalDate: string;
  dayName: string;
  dayLabel: string;
  start: string;
  end: string;
  startIso: string;
  endIso: string;
  sortMinutes: number;
  venue: string;
  category: Category;
  tags: string[];
  image: string | null;
}

export interface FestivalStage {
  id: string;
  name: string;
  description: string;
  descriptionIsExcerpt: boolean;
  image: string | null;
}

export interface InfoEntry {
  id: string;
  title: string;
  description: string;
  descriptionIsExcerpt: boolean;
}

export interface InfoTopic {
  id: string;
  title: string;
  entries: InfoEntry[];
}

export interface FestivalData {
  meta: FestivalMeta;
  days: FestivalDay[];
  categories: Category[];
  events: FestivalEvent[];
  profiles: FestivalProfile[];
  stages: FestivalStage[];
  info: InfoTopic[];
  maps: {
    festival: string;
    camping: string;
  };
}

export interface LocalUserState {
  version: 1;
  favoriteProfileIds: number[];
  plannedEventIds: string[];
  lastSelectedDay: string;
  dismissedNotices: string[];
}

export type AppTab = "now" | "schedule" | "explore" | "plan" | "map";
