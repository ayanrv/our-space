import { addDays, dayKey, weekDays } from "./dates";
import type { Snapshot } from "./types";
export const demoUser = "demo-alex";
const storageKey = "our-space-demo-v2";
export function seedDemo(): Snapshot {
  const today = dayKey(new Date());
  const saturday =
    weekDays(today)[5] < today
      ? addDays(weekDays(today)[5], 7)
      : weekDays(today)[5];
  return {
    space: { id: "demo-space", name: "Our space" },
    profiles: [
      { id: demoUser, name: "Alex" },
      { id: "demo-sam", name: "Sam" },
    ],
    tasks: [
      {
        id: "task-1",
        space_id: "demo-space",
        title: "Pick up groceries",
        owner_id: "demo-sam",
        created_by: demoUser,
        private: false,
        due_date: today,
        done: false,
      },
      {
        id: "task-2",
        space_id: "demo-space",
        title: "Choose a couple of meals for the weekend",
        owner_id: null,
        created_by: demoUser,
        private: false,
        due_date: null,
        done: false,
      },
    ],
    lists: [
      { id: "groceries", space_id: "demo-space", title: "Groceries" },
      {
        id: "watchlist",
        space_id: "demo-space",
        title: "Films for a rainy evening",
      },
    ],
    list_items: [
      {
        id: "item-1",
        list_id: "groceries",
        title: "Tomatoes × 4",
        done: false,
      },
      { id: "item-2", list_id: "groceries", title: "Pasta", done: false },
      { id: "item-3", list_id: "groceries", title: "Coffee", done: true },
    ],
    events: [
      {
        id: "date-1",
        space_id: "demo-space",
        title: "Dinner & a walk",
        day: saturday,
        at_time: "19:00",
        timezone: "Europe/Paris",
        kind: "date",
        status: "confirmed",
        place: "A new place in town",
        message:
          "I’ll find the table. You pick the dessert. Let’s take our time getting home.",
        surprise: false,
        created_by: "demo-sam",
      },
    ],
    event_secrets: [],
    reactions: [],
    event_responses: [],
    meals: [],
    trips: [],
    trip_items: [],
    reminder_preferences: [],
    ideas: [
      {
        id: "idea-1",
        space_id: "demo-space",
        title: "A weekend by the lake",
        kind: "trip",
        notes: "Somewhere quiet, with a nice view and good food.",
        budget: null,
      },
      {
        id: "idea-2",
        space_id: "demo-space",
        title: "Make pizza from scratch",
        kind: "home",
        notes: "One topping each. Possibly too much cheese.",
        budget: 20,
      },
    ],
  };
}
export function readDemo(): Snapshot {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) return JSON.parse(saved);
  } catch {
    /* An old or blocked browser cache is safe to ignore in demo mode. */
  }
  const data = seedDemo();
  writeDemo(data);
  return data;
}
export function writeDemo(data: Snapshot) {
  localStorage.setItem(storageKey, JSON.stringify(data));
}

export function resetDemo() {
  writeDemo(seedDemo());
}
