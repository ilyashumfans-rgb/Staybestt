import { Router, type IRouter } from "express";
import { createHmac, randomUUID } from "node:crypto";
import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  db, expoDeviceTokensTable, notificationPreferencesTable, notificationsTable, notificationTokenDeliveriesTable,
  officesTable, promoBannerEventsTable, promoBannersTable, promotionalCampaignsTable,
  referralAttributionsTable, referralAttributionEventsTable, referralCodesTable, referralProgramsTable, referralRewardLedgerTable,
  referralRewardEventsTable, marketingTeamsTable, teamAssignmentsTable, usersTable,
} from "@workspace/db";
import * as z from "@workspace/api-zod";
import { resolveUser } from "../lib/auth";
import { requireAdmin } from "./admin";

const router: IRouter = Router();
const bannerRateWindows = new Map<string, { count: number; resetAt: number }>();
const BANNER_RATE_WINDOW_MS = 60_000;
const BANNER_RATE_LIMIT = 60;
function allowBannerEvent(ip: string): boolean {
  const now = Date.now();
  // Keep bounded state even under hostile rotating IP traffic.
  if (bannerRateWindows.size > 10_000) {
    for (const [key, value] of bannerRateWindows) if (value.resetAt <= now) bannerRateWindows.delete(key);
  }
  const current = bannerRateWindows.get(ip);
  if (!current || current.resetAt <= now) { bannerRateWindows.set(ip, { count: 1, resetAt: now + BANNER_RATE_WINDOW_MS }); return true; }
  if (current.count >= BANNER_RATE_LIMIT) return false;
  current.count++; return true;
}
const own = async (req: Parameters<typeof resolveUser>[0], res: any) => {
  const user = await resolveUser(req);
  if (!user) { res.status(401).json({ message: "Sign in required" }); return null; }
  return user;
};
const dates = (row: any) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v]));
const permanentExpoErrors = new Set(["DeviceNotRegistered", "InvalidCredentials", "InvalidToken"]);

async function refreshNotificationDelivery(notificationId: number) {
  const rows = await db.select({ status: notificationTokenDeliveriesTable.status, lastError: notificationTokenDeliveriesTable.lastError })
    .from(notificationTokenDeliveriesTable).where(eq(notificationTokenDeliveriesTable.notificationId, notificationId));
  if (!rows.length || rows.some((row) => row.status === "queued" || row.status === "dispatching")) return;
  const failed = rows.find((row) => row.status === "permanent_failed");
  await db.update(notificationsTable).set({
    deliveryStatus: failed ? "failed" : "accepted",
    deliveryError: failed?.lastError ?? null,
  }).where(eq(notificationsTable.id, notificationId));
}

/**
 * Each Expo ticket is mapped to its own durable row. Thus an accepted ticket
 * is terminal even when another device's ticket asks the campaign to retry.
 */
const DELIVERY_LEASE_SECONDS = 120;
const EXPO_FETCH_TIMEOUT_MS = 30_000;

async function dispatchExpo(notificationId: number, title: string, body: string): Promise<void> {
  const leaseId = randomUUID();
  // This conditional UPDATE is the delivery mutex. Concurrent workers can see
  // the same candidate, but only the worker whose lease is returned may send it.
  const claimed = await db.update(notificationTokenDeliveriesTable).set({
    status: "dispatching",
    leaseId,
    claimedAt: new Date(),
    leaseExpiresAt: sql`now() + (${DELIVERY_LEASE_SECONDS} * interval '1 second')`,
    attemptCount: sql`${notificationTokenDeliveriesTable.attemptCount} + 1`,
    updatedAt: new Date(),
  }).where(and(
    eq(notificationTokenDeliveriesTable.notificationId, notificationId),
    or(
      and(
        eq(notificationTokenDeliveriesTable.status, "queued"),
        isNull(notificationTokenDeliveriesTable.leaseId),
      ),
      and(
        eq(notificationTokenDeliveriesTable.status, "dispatching"),
        sql`${notificationTokenDeliveriesTable.leaseExpiresAt} <= now()`,
      ),
    ),
  )).returning({
    id: notificationTokenDeliveriesTable.id,
    tokenId: notificationTokenDeliveriesTable.expoDeviceTokenId,
  });
  if (!claimed.length) return;

  const claimedIds = claimed.map((delivery) => delivery.id);
  const candidates = await db.select({
    id: notificationTokenDeliveriesTable.id,
    tokenId: expoDeviceTokensTable.id,
    token: expoDeviceTokensTable.token,
    active: expoDeviceTokensTable.active,
    userStatus: usersTable.status,
  }).from(notificationTokenDeliveriesTable)
    .innerJoin(expoDeviceTokensTable, eq(notificationTokenDeliveriesTable.expoDeviceTokenId, expoDeviceTokensTable.id))
    .innerJoin(notificationsTable, eq(notificationTokenDeliveriesTable.notificationId, notificationsTable.id))
    .innerJoin(usersTable, eq(notificationsTable.userId, usersTable.id))
    .where(and(
      inArray(notificationTokenDeliveriesTable.id, claimedIds),
      eq(notificationTokenDeliveriesTable.status, "dispatching"),
      eq(notificationTokenDeliveriesTable.leaseId, leaseId),
    ));
  const inactive = candidates.filter((delivery) => !delivery.active || delivery.userStatus !== "active");
  if (inactive.length) {
    await Promise.all(inactive.map((delivery) => db.update(notificationTokenDeliveriesTable).set({
      status: "permanent_failed", leaseId: null, claimedAt: null, leaseExpiresAt: null,
      lastError: delivery.userStatus !== "active" ? "User is no longer eligible for marketing" : "Device token is inactive",
      failedAt: new Date(), updatedAt: new Date(),
    }).where(and(
      eq(notificationTokenDeliveriesTable.id, delivery.id),
      eq(notificationTokenDeliveriesTable.status, "dispatching"),
      eq(notificationTokenDeliveriesTable.leaseId, leaseId),
    ))));
    await refreshNotificationDelivery(notificationId);
  }
  const deliveries = candidates.filter((delivery) => delivery.active && delivery.userStatus === "active");
  if (!deliveries.length) return;

  const deliveryIds = deliveries.map((delivery) => delivery.id);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXPO_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(deliveries.map((delivery) => ({ to: delivery.token, title, body, sound: "default", data: { notificationId } }))),
      signal: controller.signal,
    });
    const result = await response.json() as { data?: { status?: string; details?: { error?: string } }[] };
    if (!response.ok || !Array.isArray(result.data) || result.data.length !== deliveries.length) throw new Error("Expo dispatch unavailable");

    let transientError: string | null = null;
    await Promise.all(deliveries.map(async (delivery, index) => {
      const ticket = result.data![index]!;
      const error = ticket.details?.error ?? "Expo ticket error";
      if (ticket.status === "ok") {
        await db.update(notificationTokenDeliveriesTable).set({
          status: "accepted", leaseId: null, claimedAt: null, leaseExpiresAt: null,
          lastError: null, acceptedAt: new Date(), updatedAt: new Date(),
        }).where(and(
          eq(notificationTokenDeliveriesTable.id, delivery.id),
          eq(notificationTokenDeliveriesTable.status, "dispatching"),
          eq(notificationTokenDeliveriesTable.leaseId, leaseId),
        ));
      } else if (ticket.status === "error" && permanentExpoErrors.has(ticket.details?.error ?? "")) {
        const [terminalized] = await db.update(notificationTokenDeliveriesTable).set({
          status: "permanent_failed", leaseId: null, claimedAt: null, leaseExpiresAt: null,
          lastError: error, failedAt: new Date(), updatedAt: new Date(),
        }).where(and(
          eq(notificationTokenDeliveriesTable.id, delivery.id),
          eq(notificationTokenDeliveriesTable.status, "dispatching"),
          eq(notificationTokenDeliveriesTable.leaseId, leaseId),
        )).returning({ id: notificationTokenDeliveriesTable.id });
        // Use the primary key: matching token text could deactivate a token that
        // was re-registered or reassigned between attempts.
        if (terminalized) await db.update(expoDeviceTokensTable).set({ active: false }).where(eq(expoDeviceTokensTable.id, delivery.tokenId));
      } else {
        transientError ??= error;
        await db.update(notificationTokenDeliveriesTable).set({
          status: "queued", leaseId: null, claimedAt: null, leaseExpiresAt: null,
          lastError: error, updatedAt: new Date(),
        }).where(and(
          eq(notificationTokenDeliveriesTable.id, delivery.id),
          eq(notificationTokenDeliveriesTable.status, "dispatching"),
          eq(notificationTokenDeliveriesTable.leaseId, leaseId),
        ));
      }
    }));
    await refreshNotificationDelivery(notificationId);
    if (transientError) throw new Error(transientError);
  } catch (error) {
    const message = controller.signal.aborted
      ? "Expo dispatch timed out"
      : error instanceof Error ? error.message : "Expo dispatch unavailable";
    await Promise.all(deliveryIds.map((id) => db.update(notificationTokenDeliveriesTable).set({
      status: "queued", leaseId: null, claimedAt: null, leaseExpiresAt: null,
      lastError: message, updatedAt: new Date(),
    }).where(and(
      eq(notificationTokenDeliveriesTable.id, id),
      eq(notificationTokenDeliveriesTable.status, "dispatching"),
      eq(notificationTokenDeliveriesTable.leaseId, leaseId),
    ))));
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
async function campaignRecipients(campaign: typeof promotionalCampaignsTable.$inferSelect, executor: any = db) {
  const conditions: any[] = [
    // Account lifecycle is authoritative: blocked, deleted, suspended, disabled,
    // and any future non-active states are ineligible even if preferences remain.
    eq(usersTable.status, "active"),
    or(eq(notificationPreferencesTable.marketingEnabled, true), isNull(notificationPreferencesTable.userId)),
  ];
  if (campaign.audience !== "all") conditions.push(eq(usersTable.role, campaign.audience));
  if (campaign.officeId != null) conditions.push(eq(teamAssignmentsTable.officeId, campaign.officeId));
  if (campaign.teamId != null) conditions.push(eq(teamAssignmentsTable.teamId, campaign.teamId));
  if (campaign.officeId != null || campaign.teamId != null) conditions.push(eq(teamAssignmentsTable.active, true));
  const query = executor.selectDistinct({ id: usersTable.id }).from(usersTable)
    .leftJoin(notificationPreferencesTable, eq(usersTable.id, notificationPreferencesTable.userId));
  return campaign.officeId != null || campaign.teamId != null
    ? query.innerJoin(teamAssignmentsTable, eq(usersTable.id, teamAssignmentsTable.userId)).where(and(...conditions))
    : query.where(and(...conditions));
}

const MAX_DISPATCH_ATTEMPTS = 5;
const STALE_CLAIM_MINUTES = 10;
async function claimCampaign(id: number, manual = false) {
  const now = new Date();
  const [claimed] = await db.update(promotionalCampaignsTable).set({
    status: "dispatching",
    claimedAt: now,
    dispatchAttempts: sql`${promotionalCampaignsTable.dispatchAttempts} + 1`,
    lastDispatchError: null,
  }).where(and(
    eq(promotionalCampaignsTable.id, id),
    sql`${promotionalCampaignsTable.dispatchAttempts} < ${MAX_DISPATCH_ATTEMPTS}`,
    manual
      ? or(eq(promotionalCampaignsTable.status, "draft"), eq(promotionalCampaignsTable.status, "scheduled"), eq(promotionalCampaignsTable.status, "failed"))
      : or(
          and(eq(promotionalCampaignsTable.status, "scheduled"), sql`coalesce(${promotionalCampaignsTable.nextAttemptAt}, ${promotionalCampaignsTable.scheduledAt}) <= now()`),
          and(eq(promotionalCampaignsTable.status, "dispatching"), sql`${promotionalCampaignsTable.claimedAt} <= now() - (${STALE_CLAIM_MINUTES} * interval '1 minute')`),
        ),
  )).returning();
  return claimed;
}

async function processClaimedCampaign(campaign: typeof promotionalCampaignsTable.$inferSelect) {
  try {
    await db.transaction(async (tx) => {
      const targets = await campaignRecipients(campaign, tx);
      if (targets.length) await tx.insert(notificationsTable).values(targets.map((u: { id: string }) => ({
        userId: u.id, campaignId: campaign.id, title: campaign.title, body: campaign.body,
      }))).onConflictDoNothing();

      // Snapshot eligible endpoints when a notification is claimed. The unique
      // delivery key means a stale claim can safely repeat this work without
      // creating a second push for an already accepted device.
      const endpoints = await tx.select({
        notificationId: notificationsTable.id,
        expoDeviceTokenId: expoDeviceTokensTable.id,
      }).from(notificationsTable)
        .innerJoin(notificationPreferencesTable, eq(notificationsTable.userId, notificationPreferencesTable.userId))
        .innerJoin(expoDeviceTokensTable, eq(notificationsTable.userId, expoDeviceTokensTable.userId))
        .innerJoin(usersTable, eq(notificationsTable.userId, usersTable.id))
        .where(and(
          eq(notificationsTable.campaignId, campaign.id),
          eq(usersTable.status, "active"),
          eq(notificationPreferencesTable.pushEnabled, true),
          eq(expoDeviceTokensTable.active, true),
        ));
      if (endpoints.length) await tx.insert(notificationTokenDeliveriesTable).values(endpoints).onConflictDoNothing();

      // Recipients without an eligible endpoint still receive their in-app
      // notification and must not keep a campaign queued indefinitely.
      await tx.execute(sql`
        update ${notificationsTable}
        set delivery_status = 'accepted', delivery_error = null
        where ${notificationsTable.campaignId} = ${campaign.id}
          and ${notificationsTable.deliveryStatus} = 'queued'
          and not exists (
            select 1 from ${notificationTokenDeliveriesTable}
            where ${notificationTokenDeliveriesTable.notificationId} = ${notificationsTable.id}
          )
      `);
    });

    // Delivery rows, rather than inbox rows, are the retry queue. In
    // particular a mixed Expo response leaves only its transient token queued.
    const queued = await db.selectDistinct({
      id: notificationsTable.id,
      title: notificationsTable.title,
      body: notificationsTable.body,
    }).from(notificationsTable)
      .innerJoin(notificationTokenDeliveriesTable, eq(notificationsTable.id, notificationTokenDeliveriesTable.notificationId))
      .where(and(
        eq(notificationsTable.campaignId, campaign.id),
        or(
          and(
            eq(notificationTokenDeliveriesTable.status, "queued"),
            isNull(notificationTokenDeliveriesTable.leaseId),
          ),
          and(
            eq(notificationTokenDeliveriesTable.status, "dispatching"),
            sql`${notificationTokenDeliveriesTable.leaseExpiresAt} <= now()`,
          ),
        ),
      ));
    const results = await Promise.allSettled(queued.map((notification) =>
      dispatchExpo(notification.id, notification.title, notification.body),
    ));
    const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failure) throw failure.reason;

    const [outstanding] = await db.select({ id: notificationTokenDeliveriesTable.id })
      .from(notificationTokenDeliveriesTable)
      .innerJoin(notificationsTable, eq(notificationTokenDeliveriesTable.notificationId, notificationsTable.id))
      .where(and(
        eq(notificationsTable.campaignId, campaign.id),
        or(
          eq(notificationTokenDeliveriesTable.status, "queued"),
          eq(notificationTokenDeliveriesTable.status, "dispatching"),
        ),
      )).limit(1);
    if (outstanding) throw new Error("Push delivery is still queued or leased");

    await db.update(promotionalCampaignsTable).set({
      status: "sent", sentAt: new Date(), claimedAt: null, nextAttemptAt: null, lastDispatchError: null,
    }).where(and(eq(promotionalCampaignsTable.id, campaign.id), eq(promotionalCampaignsTable.status, "dispatching")));
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : "Campaign dispatch failed";
    const exhausted = campaign.dispatchAttempts >= MAX_DISPATCH_ATTEMPTS;
    if (exhausted) {
      const notifications = await db.select({ id: notificationsTable.id }).from(notificationsTable)
        .where(eq(notificationsTable.campaignId, campaign.id));
      await Promise.all(notifications.map((notification) => db.update(notificationTokenDeliveriesTable).set({
        status: "permanent_failed", leaseId: null, claimedAt: null, leaseExpiresAt: null,
        lastError: "Campaign retry limit reached", failedAt: new Date(), updatedAt: new Date(),
      }).where(and(
        eq(notificationTokenDeliveriesTable.notificationId, notification.id),
        or(
          and(
            eq(notificationTokenDeliveriesTable.status, "queued"),
            isNull(notificationTokenDeliveriesTable.leaseId),
          ),
          and(
            eq(notificationTokenDeliveriesTable.status, "dispatching"),
            sql`${notificationTokenDeliveriesTable.leaseExpiresAt} <= now()`,
          ),
        ),
      ))));
      await Promise.all(notifications.map((notification) => refreshNotificationDelivery(notification.id)));
    }
    const backoffMinutes = Math.min(60, 2 ** Math.max(0, campaign.dispatchAttempts - 1));
    await db.update(promotionalCampaignsTable).set({
      status: exhausted ? "failed" : "scheduled",
      claimedAt: null,
      lastDispatchError: message,
      nextAttemptAt: exhausted ? null : new Date(Date.now() + backoffMinutes * 60_000),
    }).where(and(eq(promotionalCampaignsTable.id, campaign.id), eq(promotionalCampaignsTable.status, "dispatching")));
    throw error;
  }
}

export async function dispatchCampaign(id: number, manual = false): Promise<boolean> {
  const claimed = await claimCampaign(id, manual);
  if (!claimed) return false;
  await processClaimedCampaign(claimed);
  return true;
}

export async function dispatchDueCampaigns(): Promise<void> {
  const due = await db.select({ id: promotionalCampaignsTable.id }).from(promotionalCampaignsTable).where(or(
    and(eq(promotionalCampaignsTable.status, "scheduled"), sql`coalesce(${promotionalCampaignsTable.nextAttemptAt}, ${promotionalCampaignsTable.scheduledAt}) <= now()`),
    and(eq(promotionalCampaignsTable.status, "dispatching"), sql`${promotionalCampaignsTable.claimedAt} <= now() - (${STALE_CLAIM_MINUTES} * interval '1 minute')`),
  ));
  for (const campaign of due) {
    await dispatchCampaign(campaign.id).catch(() => undefined);
  }
}

async function scopedUserEligible(userId: string, program: typeof referralProgramsTable.$inferSelect) {
  if (program.officeId == null && program.teamId == null) return true;
  const conditions = [
    eq(teamAssignmentsTable.userId, userId),
    eq(teamAssignmentsTable.active, true),
  ];
  if (program.officeId != null) conditions.push(eq(teamAssignmentsTable.officeId, program.officeId));
  if (program.teamId != null) conditions.push(eq(teamAssignmentsTable.teamId, program.teamId));
  const [assignment] = await db.select({ id: teamAssignmentsTable.id }).from(teamAssignmentsTable).where(and(...conditions)).limit(1);
  return Boolean(assignment);
}

router.post("/marketing/banners/:id/events", async (req, res) => {
  const params = z.RecordPromoBannerEventParams.safeParse(req.params); const body = z.RecordPromoBannerEventBody.safeParse(req.body);
  if (!params.success || !body.success) return void res.status(400).json({ message: "Invalid event" });
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  if (!allowBannerEvent(ip)) return void res.status(429).json({ message: "Too many banner events" });
  const user = await resolveUser(req).catch(() => null);
  const [banner] = await db.select().from(promoBannersTable).where(eq(promoBannersTable.id, params.data.id));
  if (!banner) return void res.status(404).json({ message: "Banner not found" });
  const now = new Date();
  if (!banner.active || (banner.startsAt && banner.startsAt > now) || (banner.endsAt && banner.endsAt < now)) return void res.status(404).json({ message: "Banner is not currently available" });
  const placement = body.data.placement ?? "home";
  if (banner.placement !== placement) return void res.status(400).json({ message: "Banner placement does not match event context" });
  if (banner.audience !== "all" && (!user || user.role !== banner.audience)) return void res.status(403).json({ message: "Banner is not available to this viewer" });
  const eventDay = now.toISOString().slice(0, 10);
  const viewerSource = user?.id ?? `${ip}|${req.get("user-agent") ?? ""}|${eventDay}`;
  const viewerFingerprint = createHmac("sha256", process.env.SESSION_SECRET ?? "banner-analytics").update(viewerSource).digest("hex");
  // Caller key is deliberately not trusted for deduplication.
  const idempotencyKey = createHmac("sha256", process.env.SESSION_SECRET ?? "banner-analytics").update(`${banner.id}|${body.data.eventType}|${viewerFingerprint}|${eventDay}`).digest("hex");
  await db.insert(promoBannerEventsTable).values({ bannerId: banner.id, userId: user?.id ?? null, eventType: body.data.eventType, idempotencyKey, viewerFingerprint, eventDay }).onConflictDoNothing();
  res.status(201).json(z.RecordPromoBannerEventResponse.parse({ message: "Recorded" }));
});

router.get("/notifications", async (req, res) => {
  const user = await own(req, res); if (!user) return;
  const rows = await db.select().from(notificationsTable).where(eq(notificationsTable.userId, user.id)).orderBy(desc(notificationsTable.createdAt));
  res.json(z.ListNotificationsResponse.parse(rows.map(dates)));
});
router.post("/notifications/:id/read", async (req, res) => {
  const params = z.MarkNotificationReadParams.safeParse(req.params); if (!params.success) return void res.status(400).json({ message: "Invalid id" });
  const user = await own(req, res); if (!user) return;
  const [row] = await db.update(notificationsTable).set({ readAt: new Date() }).where(and(eq(notificationsTable.id, params.data.id), eq(notificationsTable.userId, user.id))).returning();
  if (!row) return void res.status(404).json({ message: "Notification not found" });
  res.json(z.MarkNotificationReadResponse.parse(dates(row)));
});
router.get("/notification-preferences", async (req, res) => {
  const user = await own(req, res); if (!user) return;
  const [row] = await db.select().from(notificationPreferencesTable).where(eq(notificationPreferencesTable.userId, user.id));
  res.json(z.GetNotificationPreferencesResponse.parse(row ?? { marketingEnabled: true, pushEnabled: true }));
});
router.put("/notification-preferences", async (req, res) => {
  const body = z.UpdateNotificationPreferencesBody.safeParse(req.body); if (!body.success) return void res.status(400).json({ message: body.error.message });
  const user = await own(req, res); if (!user) return;
  const [row] = await db.insert(notificationPreferencesTable).values({ userId: user.id, ...body.data, updatedAt: new Date() }).onConflictDoUpdate({ target: notificationPreferencesTable.userId, set: { ...body.data, updatedAt: new Date() } }).returning();
  res.json(z.UpdateNotificationPreferencesResponse.parse(row!));
});
router.post("/devices/expo", async (req, res) => {
  const body = z.RegisterExpoDeviceBody.safeParse(req.body); if (!body.success) return void res.status(400).json({ message: body.error.message });
  const user = await own(req, res); if (!user) return;
  await db.insert(expoDeviceTokensTable).values({ userId: user.id, ...body.data }).onConflictDoUpdate({ target: expoDeviceTokensTable.token, set: { userId: user.id, platform: body.data.platform, active: true, lastSeenAt: new Date() } });
  res.json(z.RegisterExpoDeviceResponse.parse({ message: "Device registered" }));
});
router.delete("/devices/expo", async (req, res) => {
  const body = z.UnregisterExpoDeviceBody.safeParse(req.body); if (!body.success) return void res.status(400).json({ message: body.error.message });
  const user = await own(req, res); if (!user) return;
  await db.delete(expoDeviceTokensTable).where(and(eq(expoDeviceTokensTable.userId, user.id), eq(expoDeviceTokensTable.token, body.data.token)));
  res.json(z.UnregisterExpoDeviceResponse.parse({ message: "Device unregistered" }));
});

router.use("/admin", requireAdmin);
router.get("/admin/banner-events/summary", async (_req, res) => {
  const rows = await db.select({ bannerId: promoBannerEventsTable.bannerId, impressions: sql<number>`count(*) filter (where ${promoBannerEventsTable.eventType} = 'impression')::int`, taps: sql<number>`count(*) filter (where ${promoBannerEventsTable.eventType} = 'tap')::int` }).from(promoBannerEventsTable).groupBy(promoBannerEventsTable.bannerId);
  res.json(z.GetBannerEventSummaryResponse.parse(rows));
});
router.get("/admin/campaigns/:id/delivery-summary", async (req, res) => {
  const p = z.GetCampaignDeliverySummaryParams.safeParse(req.params); if (!p.success) return void res.status(400).json({ message: "Invalid id" });
  const [row] = await db.select({ queued: sql<number>`count(*) filter (where ${notificationsTable.deliveryStatus} = 'queued')::int`, accepted: sql<number>`count(*) filter (where ${notificationsTable.deliveryStatus} = 'accepted')::int`, failed: sql<number>`count(*) filter (where ${notificationsTable.deliveryStatus} = 'failed')::int`, opened: sql<number>`count(*) filter (where ${notificationsTable.openedAt} is not null)::int`, read: sql<number>`count(*) filter (where ${notificationsTable.readAt} is not null)::int` }).from(notificationsTable).where(eq(notificationsTable.campaignId, p.data.id));
  res.json(z.GetCampaignDeliverySummaryResponse.parse({ campaignId:p.data.id, queued:row?.queued??0, sent:(row?.accepted??0)+(row?.failed??0), accepted:row?.accepted??0, failed:row?.failed??0, opened:row?.opened??0, read:row?.read??0 }));
});
router.get("/admin/referral-attributions", async (req,res)=>{
  const q=z.ListAdminReferralAttributionsQueryParams.safeParse(req.query);if(!q.success)return void res.status(400).json({message:q.error.message});
  const referrer=alias(usersTable,"referrer"), referee=alias(usersTable,"referee");
  const conditions:any[]=[]; if(q.data.status)conditions.push(eq(referralAttributionsTable.status,q.data.status));
  if(q.data.programId)conditions.push(eq(referralCodesTable.programId,q.data.programId));
  if(q.data.role)conditions.push(or(eq(referrer.role,q.data.role),eq(referee.role,q.data.role)));
  if(q.data.search){const term=`%${q.data.search.trim()}%`;conditions.push(or(ilike(referralCodesTable.code,term),ilike(referrer.email,term),ilike(referee.email,term),ilike(referralAttributionsTable.referrerUserId,term),ilike(referralAttributionsTable.refereeUserId,term)));}
  const rows=await db.select({row:referralAttributionsTable}).from(referralAttributionsTable).innerJoin(referralCodesTable,eq(referralAttributionsTable.referralCodeId,referralCodesTable.id)).innerJoin(referrer,eq(referralAttributionsTable.referrerUserId,referrer.id)).innerJoin(referee,eq(referralAttributionsTable.refereeUserId,referee.id)).where(conditions.length?and(...conditions):undefined).orderBy(desc(referralAttributionsTable.id)).limit(q.data.limit??50);
  res.json(z.ListAdminReferralAttributionsResponse.parse(rows.map(x=>dates(x.row))));
});
router.get("/admin/referral-rewards", async (req,res)=>{
  const q=z.ListAdminReferralRewardsQueryParams.safeParse(req.query);if(!q.success)return void res.status(400).json({message:q.error.message});
  const recipient=alias(usersTable,"reward_recipient"); const conditions:any[]=[];
  if(q.data.status)conditions.push(eq(referralRewardLedgerTable.status,q.data.status));
  if(q.data.programId)conditions.push(eq(referralCodesTable.programId,q.data.programId));
  if(q.data.role)conditions.push(eq(recipient.role,q.data.role));
  if(q.data.search){const term=`%${q.data.search.trim()}%`;conditions.push(or(ilike(referralCodesTable.code,term),ilike(recipient.email,term),ilike(referralRewardLedgerTable.userId,term)));}
  const rows=await db.select({row:referralRewardLedgerTable}).from(referralRewardLedgerTable).innerJoin(referralAttributionsTable,eq(referralRewardLedgerTable.attributionId,referralAttributionsTable.id)).innerJoin(referralCodesTable,eq(referralAttributionsTable.referralCodeId,referralCodesTable.id)).innerJoin(recipient,eq(referralRewardLedgerTable.userId,recipient.id)).where(conditions.length?and(...conditions):undefined).orderBy(desc(referralRewardLedgerTable.id)).limit(q.data.limit??50);
  res.json(z.ListAdminReferralRewardsResponse.parse(rows.map(x=>dates(x.row))));
});
router.get("/admin/campaigns", async (_req, res) => res.json(z.ListCampaignsResponse.parse((await db.select().from(promotionalCampaignsTable).orderBy(desc(promotionalCampaignsTable.id))).map(dates))));
router.post("/admin/campaigns", async (req, res) => {
  const body = z.CreateCampaignBody.safeParse(req.body); if (!body.success) return void res.status(400).json({ message: body.error.message });
  if (body.data.teamId != null) {
    const [team] = await db.select().from(marketingTeamsTable).where(and(eq(marketingTeamsTable.id, body.data.teamId), eq(marketingTeamsTable.active, true)));
    if (!team || (body.data.officeId != null && team.officeId !== body.data.officeId)) return void res.status(400).json({ message: "Active team does not belong to the selected office" });
  }
  const [row] = await db.insert(promotionalCampaignsTable).values({ ...body.data, status: body.data.scheduledAt ? "scheduled" : "draft", scheduledAt: body.data.scheduledAt ? new Date(body.data.scheduledAt) : null }).returning();
  res.status(201).json(z.CreateCampaignResponse.parse(dates(row!)));
});
router.post("/admin/campaigns/:id/send", async (req, res) => {
  const p = z.SendCampaignParams.safeParse(req.params); if (!p.success) return void res.status(400).json({ message: "Invalid id" });
  const [campaign] = await db.select().from(promotionalCampaignsTable).where(eq(promotionalCampaignsTable.id, p.data.id));
  if (!campaign) return void res.status(404).json({ message: "Campaign not found" });
  if (campaign.status === "sent") return void res.json(z.SendCampaignResponse.parse(dates(campaign)));
  const claimed = await claimCampaign(campaign.id, true);
  if (!claimed) return void res.status(409).json({ message: campaign.status === "dispatching" ? "Campaign dispatch is already in progress" : "Campaign cannot be sent in its current state" });
  try { await processClaimedCampaign(claimed); }
  catch { return void res.status(503).json({ message: "Campaign dispatch failed and was scheduled for retry" }); }
  const [updated] = await db.select().from(promotionalCampaignsTable).where(eq(promotionalCampaignsTable.id, campaign.id));
  res.json(z.SendCampaignResponse.parse(dates(updated!)));
});
router.post("/admin/campaigns/:id/cancel", async (req, res) => {
  const p = z.CancelCampaignParams.safeParse(req.params); if (!p.success) return void res.status(400).json({ message: "Invalid id" });
  const [row] = await db.update(promotionalCampaignsTable).set({ status: "cancelled" }).where(and(eq(promotionalCampaignsTable.id, p.data.id), or(eq(promotionalCampaignsTable.status, "draft"), eq(promotionalCampaignsTable.status, "scheduled")))).returning();
  if (!row) return void res.status(409).json({ message: "Only draft or scheduled campaigns can be cancelled" });
  res.json(z.CancelCampaignResponse.parse(dates(row)));
});
router.put("/admin/campaigns/:id", async (req, res) => {
  const p = z.UpdateCampaignParams.safeParse(req.params), b = z.UpdateCampaignBody.safeParse(req.body); if (!p.success || !b.success) return void res.status(400).json({ message: "Invalid campaign" });
  if (b.data.teamId != null) {
    const [team] = await db.select().from(marketingTeamsTable).where(and(eq(marketingTeamsTable.id, b.data.teamId), eq(marketingTeamsTable.active, true)));
    if (!team || (b.data.officeId != null && team.officeId !== b.data.officeId)) return void res.status(400).json({ message: "Active team does not belong to the selected office" });
  }
  const [row] = await db.update(promotionalCampaignsTable).set({ ...b.data, scheduledAt: b.data.scheduledAt ? new Date(b.data.scheduledAt) : null }).where(and(eq(promotionalCampaignsTable.id, p.data.id), eq(promotionalCampaignsTable.status, "draft"))).returning();
  if (!row) return void res.status(409).json({ message: "Only draft campaigns can be edited" }); res.json(z.UpdateCampaignResponse.parse(dates(row)));
});
router.post("/admin/campaigns/:id/duplicate", async (req, res) => {
  const p = z.DuplicateCampaignParams.safeParse(req.params); if (!p.success) return void res.status(400).json({ message: "Invalid id" });
  const [source] = await db.select().from(promotionalCampaignsTable).where(eq(promotionalCampaignsTable.id, p.data.id)); if (!source) return void res.status(404).json({ message: "Campaign not found" });
  const [row] = await db.insert(promotionalCampaignsTable).values({ title: `${source.title} (copy)`, body: source.body, audience: source.audience, status: "draft", officeId: source.officeId, teamId: source.teamId, teamName: source.teamName }).returning();
  res.status(201).json(z.DuplicateCampaignResponse.parse(dates(row!)));
});

router.get("/admin/offices", async (_req, res) => res.json(z.ListAdminOfficesResponse.parse((await db.select().from(officesTable)).map(dates))));
router.post("/admin/offices", async (req, res) => {
  const body = z.CreateOfficeBody.safeParse(req.body); if (!body.success) return void res.status(400).json({ message: body.error.message });
  const [row] = await db.insert(officesTable).values(body.data).returning(); res.status(201).json(z.CreateOfficeResponse.parse(dates(row!)));
});
router.put("/admin/offices/:id", async (req, res) => {
  const p = z.UpdateOfficeParams.safeParse(req.params), b = z.UpdateOfficeBody.safeParse(req.body); if (!p.success || !b.success) return void res.status(400).json({ message: "Invalid office" });
  const [row] = await db.update(officesTable).set(b.data).where(eq(officesTable.id, p.data.id)).returning(); if (!row) return void res.status(404).json({ message: "Office not found" }); res.json(z.UpdateOfficeResponse.parse(dates(row)));
});
router.delete("/admin/offices/:id", async (req, res) => {
  const p = z.DeleteOfficeParams.safeParse(req.params);
  if (!p.success) return void res.status(400).json({ message: "Invalid id" });
  const [office] = await db.select({ id: officesTable.id }).from(officesTable).where(eq(officesTable.id, p.data.id));
  if (!office) return void res.status(404).json({ message: "Office not found" });

  const references = await Promise.all([
    db.select({ id: marketingTeamsTable.id }).from(marketingTeamsTable).where(eq(marketingTeamsTable.officeId, p.data.id)).limit(1),
    db.select({ id: teamAssignmentsTable.id }).from(teamAssignmentsTable).where(eq(teamAssignmentsTable.officeId, p.data.id)).limit(1),
    db.select({ id: promotionalCampaignsTable.id }).from(promotionalCampaignsTable).where(eq(promotionalCampaignsTable.officeId, p.data.id)).limit(1),
    db.select({ id: referralProgramsTable.id }).from(referralProgramsTable).where(eq(referralProgramsTable.officeId, p.data.id)).limit(1),
  ]);
  const labels = ["teams", "assignments", "campaigns", "referral programs"];
  const usedBy = references.flatMap((rows, index) => rows.length ? [labels[index]!] : []);
  if (usedBy.length) {
    return void res.status(409).json({
      message: `Office cannot be deleted because it is referenced by ${usedBy.join(", ")}. Deactivate it instead.`,
    });
  }
  try {
    await db.delete(officesTable).where(eq(officesTable.id, p.data.id));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23503") {
      return void res.status(409).json({ message: "Office cannot be deleted because it is still referenced. Deactivate it instead." });
    }
    throw error;
  }
  res.json(z.DeleteOfficeResponse.parse({ message: "Office deleted" }));
});
router.get("/admin/teams", async (_req, res) => res.json(z.ListMarketingTeamsResponse.parse((await db.select().from(marketingTeamsTable).orderBy(desc(marketingTeamsTable.id))).map(dates))));
router.post("/admin/teams", async (req, res) => {
  const b = z.CreateMarketingTeamBody.safeParse(req.body); if (!b.success) return void res.status(400).json({ message: b.error.message });
  const [row] = await db.insert(marketingTeamsTable).values(b.data).returning();
  res.status(201).json(z.CreateMarketingTeamResponse.parse(dates(row!)));
});
router.put("/admin/teams/:id", async (req, res) => {
  const p = z.UpdateMarketingTeamParams.safeParse(req.params), b = z.UpdateMarketingTeamBody.safeParse(req.body);
  if (!p.success || !b.success) return void res.status(400).json({ message: "Invalid team" });
  const [row] = await db.update(marketingTeamsTable).set({ ...b.data, updatedAt: new Date() }).where(eq(marketingTeamsTable.id, p.data.id)).returning();
  if (!row) return void res.status(404).json({ message: "Team not found" });
  res.json(z.UpdateMarketingTeamResponse.parse(dates(row)));
});
router.delete("/admin/teams/:id", async (req, res) => {
  const p = z.DeleteMarketingTeamParams.safeParse(req.params); if (!p.success) return void res.status(400).json({ message: "Invalid id" });
  const [row] = await db.update(marketingTeamsTable).set({ active: false, updatedAt: new Date() }).where(eq(marketingTeamsTable.id, p.data.id)).returning();
  if (!row) return void res.status(404).json({ message: "Team not found" });
  res.json(z.DeleteMarketingTeamResponse.parse({ message: "Team deactivated" }));
});
router.get("/admin/team-assignments", async (_req, res) => res.json(z.ListTeamAssignmentsResponse.parse((await db.select().from(teamAssignmentsTable)).map(dates))));
router.post("/admin/team-assignments", async (req, res) => { const b = z.CreateTeamAssignmentBody.safeParse(req.body); if (!b.success) return void res.status(400).json({ message: b.error.message }); const [team]=await db.select().from(marketingTeamsTable).where(and(eq(marketingTeamsTable.id,b.data.teamId),eq(marketingTeamsTable.active,true)));if(!team||team.officeId!==b.data.officeId)return void res.status(400).json({message:"Active team does not belong to selected office"}); const [row] = await db.insert(teamAssignmentsTable).values({...b.data,teamName:team.name}).returning(); res.status(201).json(z.CreateTeamAssignmentResponse.parse(dates(row!))); });
router.put("/admin/team-assignments/:id", async (req, res) => { const p=z.UpdateTeamAssignmentParams.safeParse(req.params),b=z.UpdateTeamAssignmentBody.safeParse(req.body); if(!p.success||!b.success)return void res.status(400).json({message:"Invalid assignment"});const [team]=await db.select().from(marketingTeamsTable).where(and(eq(marketingTeamsTable.id,b.data.teamId),eq(marketingTeamsTable.active,true)));if(!team||team.officeId!==b.data.officeId)return void res.status(400).json({message:"Active team does not belong to selected office"}); const [row]=await db.update(teamAssignmentsTable).set({...b.data,teamName:team.name}).where(eq(teamAssignmentsTable.id,p.data.id)).returning(); if(!row)return void res.status(404).json({message:"Assignment not found"});res.json(z.UpdateTeamAssignmentResponse.parse(dates(row))); });
router.post("/admin/team-assignments/:id/deactivate", async (req,res)=>{const p=z.DeactivateTeamAssignmentParams.safeParse(req.params);if(!p.success)return void res.status(400).json({message:"Invalid id"});const [row]=await db.update(teamAssignmentsTable).set({active:false}).where(eq(teamAssignmentsTable.id,p.data.id)).returning();if(!row)return void res.status(404).json({message:"Assignment not found"});res.json(z.DeactivateTeamAssignmentResponse.parse(dates(row)));});
router.post("/admin/referral-programs", async (req, res) => {
  const b = z.CreateReferralProgramBody.safeParse(req.body); if (!b.success) return void res.status(400).json({ message: b.error.message });
  if (b.data.teamId != null) { const [team]=await db.select().from(marketingTeamsTable).where(eq(marketingTeamsTable.id,b.data.teamId));if(!team||(b.data.officeId!=null&&team.officeId!==b.data.officeId))return void res.status(400).json({message:"Team does not belong to selected office"}); }
  const [row] = await db.insert(referralProgramsTable).values(b.data).returning();
  res.status(201).json(z.CreateReferralProgramResponse.parse(dates(row!)));
});
router.get("/admin/referral-programs", async (_req, res) => res.json(
  z.ListReferralProgramsResponse.parse((await db.select().from(referralProgramsTable).orderBy(desc(referralProgramsTable.id))).map(dates)),
));
router.get("/referral-programs", async (req, res) => {
  const user = await own(req, res); if (!user) return;
  const assignments = await db.select().from(teamAssignmentsTable).where(and(eq(teamAssignmentsTable.userId, user.id), eq(teamAssignmentsTable.active, true)));
  const rows = await db.select().from(referralProgramsTable).where(eq(referralProgramsTable.active, true));
  const eligible = rows.filter((program) =>
    (program.officeId == null && program.teamId == null) ||
    assignments.some((assignment) =>
      (program.officeId == null || assignment.officeId === program.officeId) &&
       (program.teamId == null || assignment.teamId === program.teamId),
    ),
  );
  res.json(z.ListEligibleReferralProgramsResponse.parse(eligible.map(dates)));
});
router.put("/admin/referral-programs/:id", async(req,res)=>{const p=z.UpdateReferralProgramParams.safeParse(req.params),b=z.UpdateReferralProgramBody.safeParse(req.body);if(!p.success||!b.success)return void res.status(400).json({message:"Invalid program"});if(b.data.teamId!=null){const [team]=await db.select().from(marketingTeamsTable).where(eq(marketingTeamsTable.id,b.data.teamId));if(!team||(b.data.officeId!=null&&team.officeId!==b.data.officeId))return void res.status(400).json({message:"Team does not belong to selected office"});}const [row]=await db.update(referralProgramsTable).set(b.data).where(eq(referralProgramsTable.id,p.data.id)).returning();if(!row)return void res.status(404).json({message:"Program not found"});res.json(z.UpdateReferralProgramResponse.parse(dates(row)));});
router.post("/admin/referral-rewards/:id/status", async(req,res)=>{const p=z.TransitionReferralRewardParams.safeParse(req.params),b=z.TransitionReferralRewardBody.safeParse(req.body);if(!p.success||!b.success)return void res.status(400).json({message:"Invalid transition"});const [old]=await db.select().from(referralRewardLedgerTable).where(eq(referralRewardLedgerTable.id,p.data.id));if(!old)return void res.status(404).json({message:"Reward not found"});const allowed=(old.status==="pending"&&["qualified","approved","rejected"].includes(b.data.status))||(old.status==="qualified"&&["approved","rejected"].includes(b.data.status))||(old.status==="approved"&&["fulfilled","rejected"].includes(b.data.status))||(old.status==="fulfilled"&&b.data.status==="reversed");if(!allowed)return void res.status(409).json({message:"Invalid reward transition"});const [row]=await db.transaction(async tx=>{const [changed]=await tx.update(referralRewardLedgerTable).set({status:b.data.status}).where(and(eq(referralRewardLedgerTable.id,old.id),eq(referralRewardLedgerTable.status,old.status))).returning();if(changed)await tx.insert(referralRewardEventsTable).values({rewardLedgerId:old.id,fromStatus:old.status,toStatus:b.data.status,reason:"admin_transition"});return [changed]});if(!row)return void res.status(409).json({message:"Reward changed concurrently"});res.json(z.TransitionReferralRewardResponse.parse(dates(row)));});
router.get("/referrals/code", async (req, res) => {
  const u = await own(req, res); if (!u) return;
  const [row] = await db.select().from(referralCodesTable).where(eq(referralCodesTable.userId, u.id)).orderBy(desc(referralCodesTable.id));
  if (!row) return void res.status(404).json({ message: "Referral code not found" });
  res.json(z.GetMyReferralCodeResponse.parse(dates(row)));
});
router.post("/admin/referrals/:id/status", async (req, res) => {
  const p = z.TransitionReferralParams.safeParse(req.params), b = z.TransitionReferralBody.safeParse(req.body);
  if (!p.success || !b.success) return void res.status(400).json({ message: "Invalid referral transition" });
  const [attribution] = await db.select().from(referralAttributionsTable).where(eq(referralAttributionsTable.id, p.data.id));
  if (!attribution || attribution.status === "rejected" || attribution.status === "rewarded") return void res.status(409).json({ message: "Referral cannot transition" });
  const actor = await resolveUser(req).catch(() => null);
  const [updated] = await db.transaction(async (tx) => {
    const [changed] = await tx.update(referralAttributionsTable).set({ status: b.data.status }).where(and(eq(referralAttributionsTable.id, attribution.id), eq(referralAttributionsTable.status, attribution.status))).returning();
    if (!changed) return [changed];
    await tx.insert(referralAttributionEventsTable).values({ attributionId: attribution.id, actorUserId: actor?.id ?? null, fromStatus: attribution.status, toStatus: b.data.status, reason: "admin_transition" }).onConflictDoNothing();
    if (b.data.status === "rewarded") {
      const rewards = await tx.insert(referralRewardLedgerTable).values([
        { attributionId: attribution.id, userId: attribution.referrerUserId, amount: attribution.referrerRewardSnapshot, rewardType: "referrer", status: "fulfilled" },
        { attributionId: attribution.id, userId: attribution.refereeUserId, amount: attribution.refereeRewardSnapshot, rewardType: "referee", status: "fulfilled" },
      ]).onConflictDoNothing().returning();
      if (rewards.length) await tx.insert(referralRewardEventsTable).values(rewards.map((reward) => ({ rewardLedgerId: reward.id, actorUserId: actor?.id ?? null, fromStatus: null, toStatus: reward.status, reason: "reward_created" }))).onConflictDoNothing();
    }
    return [changed];
  });
  if (!updated) return void res.status(409).json({ message: "Referral changed concurrently" });
  res.json(z.TransitionReferralResponse.parse(dates(updated)));
});
router.get("/my/team-assignments", async (req, res) => { const u = await own(req, res); if (!u) return; res.json(z.ListMyTeamAssignmentsResponse.parse((await db.select().from(teamAssignmentsTable).where(eq(teamAssignmentsTable.userId, u.id))).map(dates))); });

router.post("/referrals/code", async (req, res) => { const b = z.CreateMyReferralCodeBody.safeParse(req.body); if (!b.success) return void res.status(400).json({ message: b.error.message }); const u = await own(req, res); if (!u) return; const [program] = await db.select().from(referralProgramsTable).where(and(eq(referralProgramsTable.id, b.data.programId), eq(referralProgramsTable.active, true))); if (!program) return void res.status(400).json({ message: "Active referral program not found" });if(!await scopedUserEligible(u.id,program))return void res.status(403).json({message:"You are not eligible for this referral program"}); const [row] = await db.insert(referralCodesTable).values({ ...b.data, code: b.data.code.trim().toUpperCase(), userId: u.id }).returning(); res.status(201).json(z.CreateMyReferralCodeResponse.parse(dates(row!))); });
router.post("/referrals/attribute", async (req, res) => {
  const b = z.AttributeReferralBody.safeParse(req.body); if (!b.success) return void res.status(400).json({ message: b.error.message });
  const u = await own(req, res); if (!u) return;
  const [code] = await db.select().from(referralCodesTable).where(and(eq(referralCodesTable.code, b.data.code.trim().toUpperCase()), eq(referralCodesTable.active, true)));
  if (!code || code.userId === u.id) return void res.status(400).json({ message: "Invalid referral code" });
  const [program] = await db.select().from(referralProgramsTable).where(and(eq(referralProgramsTable.id, code.programId), eq(referralProgramsTable.active, true)));
  if (!program) return void res.status(400).json({ message: "Referral program is not active" });
  const [referrerEligible, refereeEligible] = await Promise.all([scopedUserEligible(code.userId, program), scopedUserEligible(u.id, program)]);
  if (!referrerEligible || !refereeEligible) return void res.status(403).json({ message: "Referral participants are outside the program office/team scope" });
  try {
    const [row] = await db.transaction(async (tx) => {
      const [created] = await tx.insert(referralAttributionsTable).values({ referralCodeId: code.id, referrerUserId: code.userId, refereeUserId: u.id, programIdSnapshot: program.id, programNameSnapshot: program.name, referrerRewardSnapshot: program.referrerReward, refereeRewardSnapshot: program.refereeReward, currencySnapshot: "INR" }).returning();
      await tx.insert(referralAttributionEventsTable).values({ attributionId: created!.id, actorUserId: u.id, fromStatus: null, toStatus: "pending", reason: "attribution_created" }).onConflictDoNothing();
      return [created];
    });
    res.status(201).json(z.AttributeReferralResponse.parse(dates(row!)));
  } catch (error: any) {
    if (error?.code === "23505" || error?.cause?.code === "23505") return void res.status(409).json({ message: "A referral attribution already exists for this user" });
    throw error;
  }
});
router.get("/referrals/rewards", async (req, res) => { const u = await own(req, res); if (!u) return; res.json(z.ListMyReferralRewardsResponse.parse((await db.select().from(referralRewardLedgerTable).where(eq(referralRewardLedgerTable.userId, u.id))).map(dates))); });
export default router;