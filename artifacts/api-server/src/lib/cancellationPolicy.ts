/**
 * Cancellation policy evaluation in the property's local timezone.
 *
 * Policy:
 * - Bookings can only be cancelled before the check-in date (property-local).
 * - Without free cancellation, cancellation closes 48 hours before midnight
 *   (start of the check-in date) in the property's timezone.
 */

const DEFAULT_TIMEZONE = "Asia/Kolkata";

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Returns the UTC offset (ms) of `timeZone` at the given instant. */
function tzOffsetMs(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - at.getTime();
}

/** UTC instant (ms) of local midnight on `dateStr` (YYYY-MM-DD) in `timeZone`. */
export function localMidnightUtcMs(dateStr: string, timeZone: string): number {
  const naive = Date.parse(`${dateStr}T00:00:00Z`);
  // Two-pass: estimate offset, then refine (handles DST transitions).
  let guess = naive - tzOffsetMs(timeZone, new Date(naive));
  guess = naive - tzOffsetMs(timeZone, new Date(guess));
  return guess;
}

/** Calendar date (YYYY-MM-DD) of `at` in `timeZone`. */
export function localDateString(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

export type CancellationCheck =
  | { allowed: true }
  | { allowed: false; reason: "past_check_in" | "within_48h_window" };

export function evaluateCancellation(opts: {
  checkIn: string; // YYYY-MM-DD
  freeCancellation: boolean;
  timezone: string | null | undefined;
  now?: Date;
}): CancellationCheck {
  const now = opts.now ?? new Date();
  const tz =
    opts.timezone && isValidTimeZone(opts.timezone)
      ? opts.timezone
      : DEFAULT_TIMEZONE;

  // Cancellation only before the check-in date, judged in property-local time.
  const todayLocal = localDateString(now, tz);
  if (opts.checkIn <= todayLocal) {
    return { allowed: false, reason: "past_check_in" };
  }

  if (!opts.freeCancellation) {
    const checkInMidnightMs = localMidnightUtcMs(opts.checkIn, tz);
    const cutoffMs = checkInMidnightMs - 48 * 60 * 60 * 1000;
    if (now.getTime() > cutoffMs) {
      return { allowed: false, reason: "within_48h_window" };
    }
  }

  return { allowed: true };
}
