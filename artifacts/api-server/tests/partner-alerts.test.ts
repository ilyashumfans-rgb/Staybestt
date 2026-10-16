import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { validPushEndpoint } from "../src/lib/partnerPush";
import { SubscribePartnerAlertsBody } from "@workspace/api-zod";

describe("partner device input", () => {
  test("allows browser providers without allowing arbitrary server requests", () => {
    for (const url of ["https://fcm.googleapis.com/fcm/send/abc", "https://updates.push.services.mozilla.com/wpush/v2/abc", "https://web.push.apple.com/token"]) expect(validPushEndpoint(url)).toBe(true);
    for (const url of ["http://fcm.googleapis.com/abc", "https://127.0.0.1/", "https://fcm.googleapis.com.attacker.test/", "https://user:pass@fcm.googleapis.com/abc", "https://fcm.googleapis.com:444/abc", "file:///etc/passwd", "https://example.com/"]) expect(validPushEndpoint(url)).toBe(false);
  });
  test("requires real-shaped browser encryption keys", () => {
    expect(SubscribePartnerAlertsBody.safeParse({ endpoint: "https://fcm.googleapis.com/abc", keys: { auth: "a".repeat(22), p256dh: "a".repeat(87) } }).success).toBe(true);
    expect(SubscribePartnerAlertsBody.safeParse({ endpoint: "https://fcm.googleapis.com/abc", keys: { auth: "", p256dh: "" } }).success).toBe(false);
  });
});

test("background worker displays a sound-enabled booking notification and only opens partner bookings", async () => {
  const listeners: Record<string, (event: any) => void> = {};
  const displayed: any[] = [];
  const opened: string[] = [];
  const self = {
    addEventListener: (name: string, handler: (event: any) => void) => { listeners[name] = handler; },
    registration: { scope: "https://example.com/app/", showNotification: async (...args: any[]) => { displayed.push(args); } },
    clients: { matchAll: async () => [], openWindow: async (url: string) => { opened.push(url); } },
  };
  runInNewContext(readFileSync("../staybest/public/partner-notifications-sw.js", "utf8"), { self, URL });
  let finished: Promise<unknown> = Promise.resolve();
  listeners.push({ data: { json: () => ({ tag: "booking-1", url: "https://attacker.test" }) }, waitUntil: (promise: Promise<unknown>) => { finished = promise; } });
  await finished;
  expect(displayed[0][0]).toBe("New StayBest booking");
  expect(displayed[0][1]).toMatchObject({ silent: false, requireInteraction: true, tag: "booking-1" });
  expect(displayed[0][1].vibrate).toEqual([200, 100, 200, 100, 400]);
  listeners.notificationclick({ notification: { close() {} }, waitUntil: (promise: Promise<unknown>) => { finished = promise; } });
  await finished;
  expect(opened).toEqual(["https://example.com/app/partner/bookings"]);
});
