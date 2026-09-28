import { createHash } from "node:crypto";
import type { Server } from "node:http";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  locationsTable,
  postalDirectorySourcesTable,
  postalDirectoryTable,
} from "@workspace/db";
import { propertyLocationExistsInCatalog } from "../lib/locationCatalog";

process.env.ADMIN_USERNAME = "postal-directory-test-admin";
process.env.ADMIN_PASSWORD = "postal-directory-test-password";
process.env.SESSION_SECRET = "postal-directory-test-session";

const run = process.env.DATABASE_URL ? describe : describe.skip;
const token = createHash("sha256")
  .update(
    `${process.env.ADMIN_USERNAME}:${process.env.ADMIN_PASSWORD}:${process.env.SESSION_SECRET}`,
  )
  .digest("hex");

let server: Server;
let baseUrl = "";
let sourceId = 0;
let directoryIds: number[] = [];
const fixtureState = `TEST STATE ${process.pid}-${Date.now()}`;
const fixtureDistrict = `TEST DISTRICT ${process.pid}-${Date.now()}`;
const fixtureOtherDistrict = `OTHER DISTRICT ${process.pid}-${Date.now()}`;

async function request(path: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });
}

run("postal directory browse and approval", () => {
  beforeAll(async () => {
    const { default: adminRouter } = await import("./admin");
    const { default: postalDirectoryRouter } = await import("./postalDirectory");
    const app = express();
    app.use(express.json());
    app.use(adminRouter);
    app.use(postalDirectoryRouter);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Postal directory test server did not bind");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;

    const [source] = await db
      .insert(postalDirectorySourcesTable)
      .values({
        slug: `postal-directory-test-${process.pid}-${Date.now()}`,
        name: "Postal directory test source",
        sourceUrl: "https://example.test/postal-directory.csv",
        license: "Test",
        datasetDate: null,
        sourceRevisionDate: null,
        retrievedAt: new Date(),
        sha256: "test",
        rowCount: 3,
        notes: "Test source",
      })
      .returning();
    sourceId = source!.id;
    const rows = await db
      .insert(postalDirectoryTable)
      .values([
        {
          sourceId,
          sourceKey: `postal-directory-test-a-${Date.now()}`,
          state: fixtureState,
          district: fixtureDistrict,
          cityOrTaluk: "Test City",
          cityOrTalukSource: "admin_confirmed",
          officeName: "Test Office SO",
          pincode: "111111",
        approved: true,
        },
        {
          sourceId,
          sourceKey: `postal-directory-test-b-${Date.now()}`,
          state: fixtureState,
          district: fixtureDistrict,
          cityOrTaluk: "Test City",
          cityOrTalukSource: "admin_confirmed",
          officeName: "Test Office SO",
          pincode: "111111",
        },
        {
          sourceId,
          sourceKey: `postal-directory-test-c-${Date.now()}`,
          state: fixtureState,
          district: fixtureOtherDistrict,
          cityOrTaluk: null,
          officeName: "Unconfirmed Office BO",
          pincode: "222222",
        },
      {
        sourceId,
        sourceKey: `postal-directory-test-d-${Date.now()}`,
        state: fixtureState,
        district: fixtureOtherDistrict,
        cityOrTaluk: "Other City",
        cityOrTalukSource: "admin_confirmed",
        officeName: "Other Office BO",
        pincode: "333333",
        approved: true,
      },
      ])
      .returning({ id: postalDirectoryTable.id });
    directoryIds = rows.map((row) => row.id);
  });

  afterAll(async () => {
    if (directoryIds.length > 0) {
      await db
        .delete(locationsTable)
        .where(inArray(locationsTable.postalDirectoryId, directoryIds));
      await db
        .delete(postalDirectoryTable)
        .where(inArray(postalDirectoryTable.id, directoryIds));
    }
    if (sourceId) {
      await db
        .delete(postalDirectorySourcesTable)
        .where(eq(postalDirectorySourcesTable.id, sourceId));
    }
    server?.close();
  });

  it("paginates and filters the state/district directory", async () => {
    const page = await request(
      `/postal-directory?state=${encodeURIComponent(fixtureState)}&page=1&pageSize=1`,
    );
    expect(page.status).toBe(200);
    const pageBody = (await page.json()) as any;
    expect(pageBody.items).toHaveLength(1);
    expect(pageBody.pagination).toMatchObject({ page: 1, pageSize: 1, total: 2 });

    const filtered = await request(
      `/postal-directory?state=${encodeURIComponent(fixtureState)}&district=${encodeURIComponent(fixtureOtherDistrict)}`,
    );
    expect(filtered.status).toBe(200);
    const filteredBody = (await filtered.json()) as any;
    expect(filteredBody.items).toHaveLength(1);
    expect(filteredBody.items[0].officeName).toBe("Other Office BO");

    const publicStates = await request("/postal-directory/states");
    expect(publicStates.status).toBe(200);
    const stateBody = (await publicStates.json()) as any;
    expect(stateBody).toEqual(
      expect.arrayContaining([{ state: fixtureState, count: 2 }]),
    );
    const publicDistricts = await request(
      `/postal-directory/districts?state=${encodeURIComponent(fixtureState)}`,
    );
    expect(publicDistricts.status).toBe(200);
    expect(await publicDistricts.json()).toEqual([
      { state: fixtureState, district: fixtureOtherDistrict, count: 1 },
      { state: fixtureState, district: fixtureDistrict, count: 1 },
    ]);

    const adminUnchecked = await request(
      `/admin/postal-directory?state=${encodeURIComponent(fixtureState)}&approved=false&includeRetired=false&pageSize=10`,
    );
    expect(adminUnchecked.status).toBe(200);
    const adminUncheckedBody = (await adminUnchecked.json()) as any;
    expect(adminUncheckedBody.items).toHaveLength(2);
  });

  it("serializes the checked-in NA coordinate row as nullable", async () => {
    const response = await request(
      "/admin/postal-directory?officeName=Pakra%20B.O&pageSize=10",
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    const pakra = body.items.find(
      (item: any) => item.officeName === "Pakra B.O",
    );
    expect(pakra).toBeDefined();
    expect(pakra.latitude).toBeNull();
    expect(pakra.longitude).toBeNull();
  });

  it("requires a confirmed label and atomically rejects duplicate approvals", async () => {
    const missingLabel = await request(
      `/admin/postal-directory/${directoryIds[2]}/approval`,
      {
        method: "POST",
        body: JSON.stringify({ approved: true }),
      },
    );
    expect(missingLabel.status).toBe(400);

    const first = await request(
      `/admin/postal-directory/${directoryIds[0]}/approval`,
      {
        method: "POST",
        body: JSON.stringify({ approved: true }),
      },
    );
    expect(first.status).toBe(200);

    const duplicateBulk = await request("/admin/postal-directory/approval", {
      method: "POST",
      body: JSON.stringify({
        ids: [directoryIds[0], directoryIds[1]],
        approved: true,
      }),
    });
    expect(duplicateBulk.status).toBe(400);
    const rows = await db
      .select({
        id: postalDirectoryTable.id,
        approved: postalDirectoryTable.approved,
      })
      .from(postalDirectoryTable)
      .where(inArray(postalDirectoryTable.id, directoryIds));
    expect(rows.find((row) => row.id === directoryIds[0])?.approved).toBe(true);
    expect(rows.find((row) => row.id === directoryIds[1])?.approved).toBe(false);
  });

  it("flips approval without deleting history and fails closed for partners", async () => {
    const unapprove = await request(
      `/admin/postal-directory/${directoryIds[0]}/approval`,
      {
        method: "POST",
        body: JSON.stringify({ approved: false }),
      },
    );
    expect(unapprove.status).toBe(200);
    const linked = await db
      .select()
      .from(locationsTable)
      .where(eq(locationsTable.postalDirectoryId, directoryIds[0]));
    expect(linked).toHaveLength(1);
    expect(linked[0]?.approved).toBe(false);
    expect(
      await propertyLocationExistsInCatalog({
        country: "India",
        state: fixtureState,
        city: "Test City",
        area: "Test Office SO",
        pincode: "111111",
      }),
    ).toBe(false);
  });

  it("toggles original manual location approval without deleting it", async () => {
    const [manual] = await db
      .insert(locationsTable)
      .values({
        country: "India",
        state: "MANUAL STATE",
        district: null,
        city: "Manual City",
        area: "Manual Area",
        pincode: "444444",
        approved: true,
      })
      .returning();
    try {
      const hide = await request(`/admin/locations/${manual!.id}/approval`, {
        method: "POST",
        body: JSON.stringify({ approved: false }),
      });
      expect(hide.status).toBe(200);
      expect(((await hide.json()) as any).approved).toBe(false);
      const hidden = await db
        .select()
        .from(locationsTable)
        .where(eq(locationsTable.id, manual!.id));
      expect(hidden).toHaveLength(1);
      expect(hidden[0]?.approved).toBe(false);

      const update = await request(`/admin/locations/${manual!.id}`, {
        method: "PUT",
        body: JSON.stringify({
          country: "India",
          state: "MANUAL STATE",
          district: null,
          city: "Updated City",
          area: "Manual Area",
          pincode: "444444",
        }),
      });
      expect(update.status).toBe(200);
      expect(((await update.json()) as any).city).toBe("Updated City");
      const updated = await db
        .select()
        .from(locationsTable)
        .where(eq(locationsTable.id, manual!.id));
      expect(updated).toHaveLength(1);
      expect(updated[0]?.approved).toBe(false);
    } finally {
      await db.delete(locationsTable).where(eq(locationsTable.id, manual!.id));
    }
  });
});