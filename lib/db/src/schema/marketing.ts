import {
  boolean, date, doublePrecision, integer, jsonb, pgTable, serial, text, timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";
import { bookingsTable } from "./bookings";
import { promoBannersTable } from "./promoBanners";

export const couponRedemptionsTable = pgTable("coupon_redemptions", {
  id: serial("id").primaryKey(),
  couponId: integer("coupon_id").notNull().references(() => couponsTable.id),
  bookingId: integer("booking_id").notNull().references(() => bookingsTable.id).unique(),
  userId: text("user_id").references(() => usersTable.id),
  discountAmount: doublePrecision("discount_amount").notNull(),
  status: text("status").notNull().default("applied"), // applied | reversed
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Imported lazily by the module graph at runtime; keeping the declaration in
// this module makes redemption foreign keys explicit without duplicating data.
import { couponsTable } from "./coupons";

export const promoBannerEventsTable = pgTable("promo_banner_events", {
  id: serial("id").primaryKey(),
  bannerId: integer("banner_id").notNull().references(() => promoBannersTable.id),
  userId: text("user_id").references(() => usersTable.id),
  eventType: text("event_type").notNull(), // impression | tap
  idempotencyKey: text("idempotency_key").notNull(),
  viewerFingerprint: text("viewer_fingerprint").notNull(),
  eventDay: date("event_day", { mode: "string" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("promo_banner_event_idempotency_unique").on(t.idempotencyKey),
  uniqueIndex("promo_banner_event_viewer_daily_unique").on(t.bannerId, t.eventType, t.viewerFingerprint, t.eventDay),
]);

export const promotionalCampaignsTable = pgTable("promotional_campaigns", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  audience: text("audience").notNull().default("all"), // all | customers | agents | partners
  status: text("status").notNull().default("draft"), // draft | scheduled | dispatching | sent | failed | cancelled
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  dispatchAttempts: integer("dispatch_attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  lastDispatchError: text("last_dispatch_error"),
  officeId: integer("office_id").references(() => officesTable.id),
  teamId: integer("team_id").references(() => marketingTeamsTable.id),
  teamName: text("team_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id),
  campaignId: integer("campaign_id").references(() => promotionalCampaignsTable.id),
  title: text("title").notNull(),
  body: text("body").notNull(),
  type: text("type").notNull().default("marketing"),
  deliveryStatus: text("delivery_status").notNull().default("queued"), // queued | accepted | failed
  deliveryError: text("delivery_error"),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("notification_campaign_user_unique").on(t.campaignId, t.userId).where(sql`${t.campaignId} is not null`)]);

export const notificationPreferencesTable = pgTable("notification_preferences", {
  userId: text("user_id").primaryKey().references(() => usersTable.id),
  marketingEnabled: boolean("marketing_enabled").notNull().default(true),
  pushEnabled: boolean("push_enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const expoDeviceTokensTable = pgTable("expo_device_tokens", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id),
  token: text("token").notNull().unique(),
  platform: text("platform").notNull(),
  active: boolean("active").notNull().default(true),
  officeId: integer("office_id"),
  teamId: integer("team_id"),
  teamName: text("team_name"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

// This is intentionally separate from the inbox notification. A notification can
// target several devices and Expo may accept one ticket while another must retry.
// The unique pair makes claim recovery and repeated campaign processing idempotent.
export const notificationTokenDeliveriesTable = pgTable("notification_token_deliveries", {
  id: serial("id").primaryKey(),
  notificationId: integer("notification_id").notNull().references(() => notificationsTable.id, { onDelete: "cascade" }),
  expoDeviceTokenId: integer("expo_device_token_id").notNull().references(() => expoDeviceTokensTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("queued"), // queued | dispatching | accepted | permanent_failed
  leaseId: text("lease_id"),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  attemptCount: integer("attempt_count").notNull().default(0),
  lastError: text("last_error"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  failedAt: timestamp("failed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("notification_token_delivery_unique").on(t.notificationId, t.expoDeviceTokenId),
  uniqueIndex("notification_token_delivery_queued_index").on(t.status, t.notificationId),
]);

export const officesTable = pgTable("offices", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  state: text("state"),
  country: text("country").notNull(),
  phone: text("phone"),
  email: text("email"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const marketingTeamsTable = pgTable("marketing_teams", {
  id: serial("id").primaryKey(),
  officeId: integer("office_id").notNull().references(() => officesTable.id),
  name: text("name").notNull(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("marketing_team_office_name_unique").on(t.officeId, t.name)]);

export const teamAssignmentsTable = pgTable("team_assignments", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id),
  officeId: integer("office_id").notNull().references(() => officesTable.id),
  teamId: integer("team_id").notNull().references(() => marketingTeamsTable.id),
  teamName: text("team_name").notNull(), // compatibility snapshot for existing clients
  title: text("title"),
  managerUserId: text("manager_user_id").references(() => usersTable.id),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("team_assignment_user_team_unique").on(t.userId, t.teamId)]);

export const referralProgramsTable = pgTable("referral_programs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  referrerReward: doublePrecision("referrer_reward").notNull(),
  refereeReward: doublePrecision("referee_reward").notNull(),
  active: boolean("active").notNull().default(true),
  officeId: integer("office_id").references(() => officesTable.id),
  teamId: integer("team_id").references(() => marketingTeamsTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const referralCodesTable = pgTable("referral_codes", {
  id: serial("id").primaryKey(),
  programId: integer("program_id").notNull().references(() => referralProgramsTable.id),
  userId: text("user_id").notNull().references(() => usersTable.id),
  code: text("code").notNull().unique(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("referral_code_program_user_unique").on(t.programId, t.userId)]);

export const referralAttributionsTable = pgTable("referral_attributions", {
  id: serial("id").primaryKey(),
  referralCodeId: integer("referral_code_id").notNull().references(() => referralCodesTable.id),
  referrerUserId: text("referrer_user_id").notNull().references(() => usersTable.id),
  refereeUserId: text("referee_user_id").notNull().references(() => usersTable.id).unique(),
  status: text("status").notNull().default("pending"), // pending | qualified | rejected | rewarded
  programIdSnapshot: integer("program_id_snapshot").notNull(),
  programNameSnapshot: text("program_name_snapshot").notNull(),
  referrerRewardSnapshot: doublePrecision("referrer_reward_snapshot").notNull(),
  refereeRewardSnapshot: doublePrecision("referee_reward_snapshot").notNull(),
  currencySnapshot: text("currency_snapshot").notNull().default("INR"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const referralAttributionEventsTable = pgTable("referral_attribution_events", {
  id: serial("id").primaryKey(),
  attributionId: integer("attribution_id").notNull().references(() => referralAttributionsTable.id),
  actorUserId: text("actor_user_id").references(() => usersTable.id),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("referral_attribution_event_unique").on(t.attributionId, t.toStatus, t.reason)]);

export const referralRewardLedgerTable = pgTable("referral_reward_ledger", {
  id: serial("id").primaryKey(),
  attributionId: integer("attribution_id").notNull().references(() => referralAttributionsTable.id),
  userId: text("user_id").notNull().references(() => usersTable.id),
  amount: doublePrecision("amount").notNull(),
  rewardType: text("reward_type").notNull(), // referrer | referee
  status: text("status").notNull().default("pending"), // pending | fulfilled | voided
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("referral_reward_unique").on(t.attributionId, t.userId, t.rewardType)]);

export const referralRewardEventsTable = pgTable("referral_reward_events", {
  id: serial("id").primaryKey(),
  rewardLedgerId: integer("reward_ledger_id").notNull().references(() => referralRewardLedgerTable.id),
  actorUserId: text("actor_user_id").references(() => usersTable.id),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});