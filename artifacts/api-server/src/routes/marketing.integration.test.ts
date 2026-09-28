import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  expoDeviceTokensTable,
  notificationPreferencesTable,
  notificationsTable,
  notificationTokenDeliveriesTable,
  officesTable,
  marketingTeamsTable,
  teamAssignmentsTable,
  promotionalCampaignsTable,
  usersTable,
} from "@workspace/db";
import { dispatchCampaign } from "./marketing";

const run = process.env.DATABASE_URL ? describe : describe.skip;
const suffix = randomUUID();
const userIds = {
  active: `marketing-active-${suffix}`,
  deleted: `marketing-deleted-${suffix}`,
  blocked: `marketing-blocked-${suffix}`,
  outsider: `marketing-outsider-${suffix}`,
};
const campaignIds: number[] = [];
let officeId: number | undefined;
let teamId: number | undefined;

run("campaign account lifecycle eligibility", () => {
  beforeEach(async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as unknown[];
      return new Response(JSON.stringify({ data: payload.map(() => ({ status: "ok" })) }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }));
    await db.insert(usersTable).values([
      { id: userIds.active, email: `${userIds.active}@example.test`, name: "Active", status: "active" },
      { id: userIds.deleted, email: `${userIds.deleted}@example.test`, name: "Deleted", status: "deleted" },
      { id: userIds.blocked, email: `${userIds.blocked}@example.test`, name: "Blocked", status: "blocked" },
      { id: userIds.outsider, email: `${userIds.outsider}@example.test`, name: "Unrelated active user", status: "active" },
    ]);
    // Use the real audience filter, never an unbounded "all users" campaign.
    // The outsider has the same opt-ins/tokens but belongs to no fixture team.
    const [office] = await db.insert(officesTable).values({
      name: "Marketing test office", code: suffix, address: "Test", city: "Test", country: "Test",
    }).returning({ id: officesTable.id });
    officeId = office!.id;
    const [team] = await db.insert(marketingTeamsTable).values({
      officeId, name: `Marketing test ${suffix}`,
    }).returning({ id: marketingTeamsTable.id });
    teamId = team!.id;
    await db.insert(teamAssignmentsTable).values(
      [userIds.active, userIds.deleted, userIds.blocked].map((userId) => ({
        userId, officeId: officeId!, teamId: teamId!, teamName: "Marketing test",
      })),
    );
    await db.insert(notificationPreferencesTable).values(Object.values(userIds).map((userId) => ({
      userId, marketingEnabled: true, pushEnabled: true,
    })));
    await db.insert(expoDeviceTokensTable).values(Object.entries(userIds).map(([status, userId]) => ({
      userId, token: `ExponentPushToken[${status}-${suffix}]`, platform: "ios", active: true,
    })));
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    const errors: unknown[] = [];
    const cleanup = async (operation: () => PromiseLike<unknown>) => {
      try { await operation(); } catch (error) { errors.push(error); }
    };
    if (campaignIds.length) {
      const ids = campaignIds.splice(0);
      await cleanup(() => db.delete(notificationsTable).where(inArray(notificationsTable.campaignId, ids)));
      await cleanup(() => db.delete(promotionalCampaignsTable).where(inArray(promotionalCampaignsTable.id, ids)));
    }
    await cleanup(() => db.delete(expoDeviceTokensTable).where(inArray(expoDeviceTokensTable.userId, Object.values(userIds))));
    await cleanup(() => db.delete(notificationPreferencesTable).where(inArray(notificationPreferencesTable.userId, Object.values(userIds))));
    if (teamId !== undefined) {
      const id = teamId;
      await cleanup(() => db.delete(teamAssignmentsTable).where(eq(teamAssignmentsTable.teamId, id)));
      await cleanup(() => db.delete(marketingTeamsTable).where(eq(marketingTeamsTable.id, id)));
    }
    if (officeId !== undefined) {
      const id = officeId;
      await cleanup(() => db.delete(officesTable).where(eq(officesTable.id, id)));
    }
    await cleanup(() => db.delete(usersTable).where(inArray(usersTable.id, Object.values(userIds))));
    if (errors.length) throw new AggregateError(errors, "Marketing fixture cleanup failed");
    expect(await db.select({ id: usersTable.id }).from(usersTable)
      .where(inArray(usersTable.id, Object.values(userIds)))).toEqual([]);
  });

  async function assertOnlyActiveReceived(campaignId: number) {
    const inbox = await db.select({ id: notificationsTable.id, userId: notificationsTable.userId })
      .from(notificationsTable)
      .where(eq(notificationsTable.campaignId, campaignId));
    expect(inbox.map((row) => row.userId)).toEqual([userIds.active]);

    const deliveries = await db.select({ userId: notificationsTable.userId })
      .from(notificationTokenDeliveriesTable)
      .innerJoin(notificationsTable, eq(notificationTokenDeliveriesTable.notificationId, notificationsTable.id))
      .where(eq(notificationsTable.campaignId, campaignId));
    expect(deliveries.map((row) => row.userId)).toEqual([userIds.active]);
  }

  it("excludes deleted and blocked accounts from manual and scheduled dispatch", async () => {
    const [manual] = await db.insert(promotionalCampaignsTable).values({
      title: `Manual ${suffix}`, body: "Manual lifecycle regression", audience: "all", status: "draft",
      officeId, teamId,
    }).returning({ id: promotionalCampaignsTable.id });
    campaignIds.push(manual!.id);
    expect(await dispatchCampaign(manual!.id, true)).toBe(true);
    await assertOnlyActiveReceived(manual!.id);

    const [scheduled] = await db.insert(promotionalCampaignsTable).values({
      title: `Scheduled ${suffix}`, body: "Scheduled lifecycle regression", audience: "all",
      status: "scheduled", scheduledAt: new Date(Date.now() - 1_000),
      officeId, teamId,
    }).returning({ id: promotionalCampaignsTable.id });
    campaignIds.push(scheduled!.id);
    expect(await dispatchCampaign(scheduled!.id)).toBe(true);
    await assertOnlyActiveReceived(scheduled!.id);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    for (const [, init] of vi.mocked(fetch).mock.calls) {
      expect(JSON.parse(String(init?.body)).map((message: { to: string }) => message.to))
        .toEqual([`ExponentPushToken[active-${suffix}]`]);
    }
  });
});