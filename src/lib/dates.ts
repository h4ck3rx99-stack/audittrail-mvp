/**
 * Date-only values (due dates, review dates, validity dates) are represented in domain logic as
 * ISO "YYYY-MM-DD" strings. In the database they are Postgres DATE columns, which Prisma returns
 * as JavaScript Dates at UTC midnight. These helpers convert between the two without timezone
 * drift and compute "today" in an organization's IANA timezone.
 */

export type DateOnly = string; // "YYYY-MM-DD"

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateOnly(value: string): boolean {
  const m = DATE_ONLY_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value;
}

/** A DB DATE (UTC midnight) → "YYYY-MM-DD". */
export function toDateOnly(date: Date): DateOnly {
  return date.toISOString().slice(0, 10);
}

export function toDateOnlyOrNull(date: Date | null | undefined): DateOnly | null {
  return date ? toDateOnly(date) : null;
}

/** "YYYY-MM-DD" → Date at UTC midnight, suitable for a Prisma @db.Date field. */
export function fromDateOnly(value: DateOnly): Date {
  if (!isDateOnly(value)) throw new Error(`Invalid date-only value: ${value}`);
  return new Date(`${value}T00:00:00.000Z`);
}

export function fromDateOnlyOrNull(value: DateOnly | null | undefined): Date | null {
  return value ? fromDateOnly(value) : null;
}

/** Today's calendar date in the given IANA timezone. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): DateOnly {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDays(date: DateOnly, days: number): DateOnly {
  const d = fromDateOnly(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateOnly(d);
}

export function addMonths(date: DateOnly, months: number): DateOnly {
  const d = fromDateOnly(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return toDateOnly(d);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function diffDays(from: DateOnly, to: DateOnly): number {
  return Math.round((fromDateOnly(to).getTime() - fromDateOnly(from).getTime()) / 86_400_000);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function safeTimeZone(timeZone: string): string {
  return isValidTimeZone(timeZone) ? timeZone : "UTC";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-06" → "Oct 6, 2026" (no timezone conversion: it is a calendar date). */
export function formatDateOnly(value: DateOnly): string {
  const m = DATE_ONLY_RE.exec(value);
  if (!m) return value;
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

/** Relative description of a due date against today, e.g. "in 3 days", "4 days overdue". */
export function describeDueDate(
  due: DateOnly,
  today: DateOnly,
): { label: string; overdue: boolean; days: number } {
  const days = diffDays(today, due);
  if (days === 0) return { label: "Due today", overdue: false, days };
  if (days === 1) return { label: "Tomorrow", overdue: false, days };
  if (days > 1) return { label: days < 60 ? `In ${days} days` : formatDateOnly(due), overdue: false, days };
  const late = -days;
  return { label: `${late} ${late === 1 ? "day" : "days"} overdue`, overdue: true, days };
}

/** Absolute timestamp in a timezone, e.g. "Oct 6, 2026, 14:03 CEST". */
export function formatTimestamp(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimeZone(timeZone),
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).format(date);
}

/** Relative description of a past timestamp, e.g. "5 minutes ago". */
export function formatRelative(date: Date, now: Date = new Date()): string {
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  const abs = Math.abs(seconds);
  const suffix = seconds >= 0 ? "ago" : "from now";
  if (abs < 45) return seconds >= 0 ? "just now" : "in a moment";
  const units: [number, string][] = [
    [60, "minute"],
    [3600, "hour"],
    [86400, "day"],
    [86400 * 30, "month"],
    [86400 * 365, "year"],
  ];
  let chosen: [number, string] = units[0]!;
  for (const u of units) if (abs >= u[0]) chosen = u;
  const value = Math.max(1, Math.round(abs / chosen[0]));
  return `${value} ${chosen[1]}${value === 1 ? "" : "s"} ${suffix}`;
}
