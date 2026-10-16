import { Router } from "express";
import { SubscribePartnerAlertsBody, UnsubscribePartnerAlertsBody, ReadPartnerBookingAlertParams } from "@workspace/api-zod";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db, partnerPushSubscriptionsTable as subscriptions, partnerBookingAlertsTable as alerts, bookingsTable, propertiesTable } from "@workspace/db";
import { requireRole } from "../lib/auth";
import { pushKeys, validPushEndpoint } from "../lib/partnerPush";

const router = Router();
router.use("/partner/alerts", requireRole("partner"));
router.get("/partner/alerts/config", async (_req, res) => {
  const { publicKey } = await pushKeys();
  res.json({ publicKey });
});
router.post("/partner/alerts/subscriptions", async (req, res) => {
  const input = SubscribePartnerAlertsBody.safeParse(req.body);
  if (!input.success || !validPushEndpoint(input.data.endpoint)) { res.status(400).json({ message: "Invalid browser subscription." }); return; }
  const devices = await db.select({ endpoint: subscriptions.endpoint }).from(subscriptions).where(eq(subscriptions.userId, req.currentUser!.id));
  if (devices.length >= 20 && !devices.some(device => device.endpoint === input.data.endpoint)) { res.status(409).json({ message: "Device limit reached. Disable alerts on an unused device first." }); return; }
  await pushKeys();
  const value = { userId: req.currentUser!.id, endpoint: input.data.endpoint, ...input.data.keys };
  await db.insert(subscriptions).values(value).onConflictDoUpdate({ target: subscriptions.endpoint, set: value });
  res.json({ ok: true });
});
router.delete("/partner/alerts/subscriptions", async (req, res) => {
  const input = UnsubscribePartnerAlertsBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ message: "Invalid subscription." }); return; }
  await db.delete(subscriptions).where(and(eq(subscriptions.userId, req.currentUser!.id), eq(subscriptions.endpoint, input.data.endpoint)));
  res.json({ ok: true });
});
router.get("/partner/alerts", async (req, res) => {
  const result = await db.select({
    id: alerts.id, bookingId: alerts.bookingId, propertyName: propertiesTable.name,
    bookingRef: bookingsTable.bookingRef, checkIn: bookingsTable.checkIn,
  }).from(alerts).innerJoin(bookingsTable, eq(bookingsTable.id, alerts.bookingId))
    .innerJoin(propertiesTable, eq(propertiesTable.id, bookingsTable.propertyId))
    .where(and(eq(alerts.userId, req.currentUser!.id), eq(propertiesTable.ownerId, req.currentUser!.id), eq(bookingsTable.status, "confirmed"), isNull(alerts.readAt),
      sql`${alerts.createdAt} > now() - interval '7 days'`)).orderBy(desc(alerts.id)).limit(20);
  res.json(result);
});
router.post("/partner/alerts/:id/read", async (req, res) => {
  const id = ReadPartnerBookingAlertParams.safeParse(req.params);
  if (!id.success) { res.status(400).json({ message: "Invalid alert." }); return; }
  await db.update(alerts).set({ readAt: new Date() }).where(and(eq(alerts.id, id.data.id), eq(alerts.userId, req.currentUser!.id)));
  res.json({ ok: true });
});
export default router;
