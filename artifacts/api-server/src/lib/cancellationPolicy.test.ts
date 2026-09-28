import { describe, it, expect } from "vitest";
import {
  evaluateCancellation,
  localMidnightUtcMs,
  localDateString,
} from "./cancellationPolicy";

const H = 60 * 60 * 1000;

describe("localMidnightUtcMs", () => {
  it("computes midnight IST (UTC+5:30)", () => {
    expect(localMidnightUtcMs("2026-08-10", "Asia/Kolkata")).toBe(
      Date.parse("2026-08-09T18:30:00Z"),
    );
  });
  it("computes midnight in New York during DST (UTC-4)", () => {
    expect(localMidnightUtcMs("2026-08-10", "America/New_York")).toBe(
      Date.parse("2026-08-10T04:00:00Z"),
    );
  });
  it("computes midnight in New York outside DST (UTC-5)", () => {
    expect(localMidnightUtcMs("2026-01-10", "America/New_York")).toBe(
      Date.parse("2026-01-10T05:00:00Z"),
    );
  });
  it("computes midnight in UTC", () => {
    expect(localMidnightUtcMs("2026-08-10", "UTC")).toBe(
      Date.parse("2026-08-10T00:00:00Z"),
    );
  });
});

describe("localDateString", () => {
  it("rolls to the next day earlier in eastern timezones", () => {
    const at = new Date("2026-08-09T20:00:00Z");
    expect(localDateString(at, "Asia/Kolkata")).toBe("2026-08-10"); // 01:30 IST
    expect(localDateString(at, "America/New_York")).toBe("2026-08-09");
  });
});

describe("evaluateCancellation — 48h cutoff boundaries", () => {
  const base = { checkIn: "2026-08-10", freeCancellation: false };

  it("IST: allows exactly at the cutoff, rejects one minute after", () => {
    const cutoff = Date.parse("2026-08-09T18:30:00Z") - 48 * H;
    expect(
      evaluateCancellation({ ...base, timezone: "Asia/Kolkata", now: new Date(cutoff) }),
    ).toEqual({ allowed: true });
    expect(
      evaluateCancellation({
        ...base,
        timezone: "Asia/Kolkata",
        now: new Date(cutoff + 60_000),
      }),
    ).toEqual({ allowed: false, reason: "within_48h_window" });
  });

  it("New York (UTC-4): cutoff is 9.5h later than IST for the same date", () => {
    const nyCutoff = Date.parse("2026-08-10T04:00:00Z") - 48 * H;
    const now = new Date(nyCutoff - 60_000);
    // Allowed in NY at this instant…
    expect(
      evaluateCancellation({ ...base, timezone: "America/New_York", now }),
    ).toEqual({ allowed: true });
    // …but the same instant is already past the IST cutoff.
    expect(
      evaluateCancellation({ ...base, timezone: "Asia/Kolkata", now }),
    ).toEqual({ allowed: false, reason: "within_48h_window" });
    expect(
      evaluateCancellation({
        ...base,
        timezone: "America/New_York",
        now: new Date(nyCutoff + 60_000),
      }),
    ).toEqual({ allowed: false, reason: "within_48h_window" });
  });

  it("free cancellation ignores the 48h window but not check-in day", () => {
    expect(
      evaluateCancellation({
        checkIn: "2026-08-10",
        freeCancellation: true,
        timezone: "Asia/Kolkata",
        now: new Date("2026-08-09T12:00:00Z"),
      }),
    ).toEqual({ allowed: true });
  });
});

describe("evaluateCancellation — check-in day boundary", () => {
  it("rejects once the property-local date reaches check-in", () => {
    // 19:00 UTC Aug 9 = 00:30 IST Aug 10 (check-in day in IST),
    // but still Aug 9 in New York.
    const now = new Date("2026-08-09T19:00:00Z");
    expect(
      evaluateCancellation({
        checkIn: "2026-08-10",
        freeCancellation: true,
        timezone: "Asia/Kolkata",
        now,
      }),
    ).toEqual({ allowed: false, reason: "past_check_in" });
    expect(
      evaluateCancellation({
        checkIn: "2026-08-10",
        freeCancellation: true,
        timezone: "America/New_York",
        now,
      }),
    ).toEqual({ allowed: true });
  });

  it("rejects past check-in dates", () => {
    expect(
      evaluateCancellation({
        checkIn: "2026-08-01",
        freeCancellation: true,
        timezone: "Asia/Kolkata",
        now: new Date("2026-08-09T12:00:00Z"),
      }),
    ).toEqual({ allowed: false, reason: "past_check_in" });
  });
});

describe("evaluateCancellation — timezone fallback", () => {
  it("falls back to Asia/Kolkata for missing or invalid timezone", () => {
    const now = new Date(Date.parse("2026-08-09T18:30:00Z") - 47 * H);
    for (const tz of [null, undefined, "Not/AZone"]) {
      expect(
        evaluateCancellation({
          checkIn: "2026-08-10",
          freeCancellation: false,
          timezone: tz,
          now,
        }),
      ).toEqual({ allowed: false, reason: "within_48h_window" });
    }
  });
});
