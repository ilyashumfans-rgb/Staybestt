import webpush from "web-push";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { and, eq, lte, sql } from "drizzle-orm";
import { db, partnerPushKeysTable as keys, partnerPushDeliveriesTable as deliveries, partnerPushSubscriptionsTable as subscriptions, partnerBookingAlertsTable as alerts, bookingsTable, propertiesTable, usersTable } from "@workspace/db";
import { logger } from "./logger";

function encryptionKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Partner push requires SESSION_SECRET");
  return createHash("sha256").update(secret).digest();
}
export async function pushKeys() {
  let [row] = await db.select().from(keys).where(eq(keys.id, 1));
  if (!row) {
    const generated = webpush.generateVAPIDKeys();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(generated.privateKey, "utf8"), cipher.final()]);
    await db.insert(keys).values({
      id: 1, publicKey: generated.publicKey,
      encryptedPrivateKey: [iv, cipher.getAuthTag(), encrypted].map(b => b.toString("base64")).join("."),
    }).onConflictDoNothing();
    [row] = await db.select().from(keys).where(eq(keys.id, 1));
  }
  const [iv, tag, encrypted] = row.encryptedPrivateKey.split(".").map(s => Buffer.from(s, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return { publicKey: row.publicKey, privateKey: Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8") };
}

// Only accept actual browser push providers, never arbitrary outbound URLs.
export function validPushEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") &&
      (url.hostname === "fcm.googleapis.com" || url.hostname === "updates.push.services.mozilla.com" ||
       url.hostname === "web.push.apple.com" || /^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname));
  } catch { return false; }
}

let running = false;
export async function dispatchPartnerPush() {
  if (running) return;
  running = true;
  try {
    await db.transaction(async tx => {
      const lock = await tx.execute(sql`select pg_try_advisory_xact_lock(43871592) as acquired`);
      if (!(lock.rows[0] as { acquired: boolean }).acquired) return;
      const rows = await tx.select({ delivery: deliveries, subscription: subscriptions, alert: alerts, booking: bookingsTable, ownerId: propertiesTable.ownerId, role: usersTable.role, userStatus: usersTable.status, approvalStatus: usersTable.approvalStatus })
        .from(deliveries)
        .innerJoin(subscriptions, eq(subscriptions.id, deliveries.subscriptionId))
        .innerJoin(alerts, eq(alerts.id, deliveries.alertId))
        .innerJoin(bookingsTable, eq(bookingsTable.id, alerts.bookingId))
        .innerJoin(propertiesTable, eq(propertiesTable.id, bookingsTable.propertyId))
        .innerJoin(usersTable, eq(usersTable.id, alerts.userId))
        .where(and(eq(deliveries.status, "pending"), lte(deliveries.nextAttemptAt, new Date()))).limit(5);
      if (!rows.length) return;
      const vapid = await pushKeys();
      for (const row of rows) {
        const { delivery, subscription, alert, booking } = row;
        if (subscription.userId !== alert.userId || row.ownerId !== alert.userId || row.role !== "partner" ||
            row.userStatus !== "active" || row.approvalStatus !== "approved" || booking.status !== "confirmed" || Date.now() - alert.createdAt.getTime() > 86400000 ||
            !validPushEndpoint(subscription.endpoint)) {
          await tx.update(deliveries).set({ status: "skipped" }).where(eq(deliveries.id, delivery.id));
          continue;
        }
        try {
          await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({
            title: "New StayBest booking", body: "A confirmed booking has arrived. Open your partner dashboard for details.",
            tag: `booking-${alert.id}`, url: "/partner/bookings",
          }), { TTL: 86400, urgency: "high", timeout: 5000, vapidDetails: { subject: "https://www.staybestt.com", ...vapid } });
          await tx.update(deliveries).set({ status: "sent", attempts: delivery.attempts + 1 }).where(eq(deliveries.id, delivery.id));
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await tx.delete(subscriptions).where(eq(subscriptions.id, subscription.id));
          } else {
            const attempts = delivery.attempts + 1;
            await tx.update(deliveries).set({ attempts, status: attempts >= 8 ? "failed" : "pending", nextAttemptAt: new Date(Date.now() + Math.min(3600, 30 * 2 ** attempts) * 1000) }).where(eq(deliveries.id, delivery.id));
            logger.warn({ deliveryId: delivery.id, statusCode: status }, "Partner push delivery will retry or requires attention");
          }
        }
      }
    });
  } catch {
    // Push transport must never fail a successful payment or expose device credentials.
    logger.error("Partner push dispatch failed; pending deliveries retained");
  } finally { running = false; }
}
