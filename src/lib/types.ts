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
  repeat_days?: number | null;
  skipped?: boolean;
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
  card_style?: "cherry" | "pistachio" | "midnight";
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
export type EventResponse = {
  event_id: string;
  user_id: string;
  response: "accepted" | "reschedule";
};
export type Meal = {
  id: string;
  space_id: string;
  day: string;
  slot: "breakfast" | "lunch" | "dinner";
  title: string;
  ingredients: string;
  groceries_added: boolean;
};
export type Trip = {
  id: string;
  space_id: string;
  title: string;
  start_day: string;
  end_day: string;
  budget: number | null;
  accommodation_url: string;
  notes: string;
};
export type TripItem = {
  id: string;
  trip_id: string;
  kind: "packing" | "itinerary" | "expense";
  title: string;
  day: string | null;
  amount: number | null;
  done: boolean;
};
export type ReminderPreference = {
  user_id: string;
  enabled: boolean;
  timezone: string;
  hour: number;
};
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
  event_responses: EventResponse[];
  meals: Meal[];
  trips: Trip[];
  trip_items: TripItem[];
  reminder_preferences: ReminderPreference[];
};
export type Table =
  | "tasks"
  | "lists"
  | "list_items"
  | "events"
  | "ideas"
  | "meals"
  | "trips"
  | "trip_items";
export type NewEvent = Omit<SharedEvent, "id" | "created_by"> & {
  clue?: string;
  repeat_count?: number;
  repeat_days?: number;
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
  event_responses: [],
  meals: [],
  trips: [],
  trip_items: [],
  reminder_preferences: [],
};
