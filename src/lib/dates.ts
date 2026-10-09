// Calendar dates stay YYYY-MM-DD strings; converting them through UTC moves days.
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function fromDay(day: string) {
  return new Date(`${day}T12:00:00`);
}
export function addDays(day: string, amount: number) {
  const d = fromDay(day);
  d.setDate(d.getDate() + amount);
  return dayKey(d);
}
export function weekDays(day: string) {
  const d = fromDay(day);
  const monday = addDays(day, -((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}
export function monthDays(day: string) {
  const d = fromDay(day);
  d.setDate(1);
  const first = weekDays(dayKey(d))[0];
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}
export function niceDay(day: string) {
  return fromDay(day).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
export function formatTime(time: string | null) {
  return time ? time.slice(0, 5) : "All day";
}
