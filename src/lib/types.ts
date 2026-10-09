export type Profile = { id: string; name: string };
export type Space = { id: string; name: string };
export type Task = {
  id: string;
  space_id: string;
  title: string;
  owner_id: string | null;
  created_by: string;
  private: boolean;
  due_date: string | null;
  done: boolean;
};
export type SharedList = { id: string; space_id: string; title: string };
export type ListItem = {
  id: string;
  list_id: string;
  title: string;
  done: boolean;
};
export type EventKind = "date" | "plan" | "trip" | "busy";
export type SharedEvent = {
  id: string;
  space_id: string;
  title: string;
  day: string;
  at_time: string | null;
  timezone: string;
  kind: EventKind;
  status: "tentative" | "confirmed";
  place: string;
  message: string;
  surprise: boolean;
  created_by: string;
};
export type Secret = {
  event_id: string;
  title: string;
  place: string;
  message: string;
};
export type Idea = {
  id: string;
  space_id: string;
  title: string;
  kind: "date" | "trip" | "home";
  notes: string;
  budget: number | null;
};
export type Reaction = { event_id: string; user_id: string };
export type Snapshot = {
  space: Space | null;
  profiles: Profile[];
  tasks: Task[];
  lists: SharedList[];
  list_items: ListItem[];
  events: SharedEvent[];
  event_secrets: Secret[];
  ideas: Idea[];
  reactions: Reaction[];
};
export type Table = "tasks" | "lists" | "list_items" | "events" | "ideas";
export type NewEvent = Omit<SharedEvent, "id" | "created_by"> & {
  clue?: string;
};
export const emptySnapshot: Snapshot = {
  space: null,
  profiles: [],
  tasks: [],
  lists: [],
  list_items: [],
  events: [],
  event_secrets: [],
  ideas: [],
  reactions: [],
};
