import { Router, type IRouter } from "express";
import { randomBytes } from "node:crypto";
import { clerkClient } from "@clerk/express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, usersTable, vendorCredentialsTable } from "@workspace/db";
import {
  RegisterPartnerAccountBody,
  RegisterPartnerAccountResponse,
  ListPartnerApplicationsResponse,
  DecidePartnerApplicationParams,
  DecidePartnerApplicationBody,
  DecidePartnerApplicationResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "./admin";
import { ONE_TIME_PARTNER_PASSWORD } from "../lib/partnerCredentials";

const router: IRouter = Router();
const attempts = new Map<string, { count: number; expires: number }>();
const hour = 60 * 60 * 1000;

router.post("/partner/register", async (req, res): Promise<void> => {
  res.set("Cache-Control", "no-store");
  const now = Date.now();
  for (const [key, value] of attempts) if (value.expires <= now) attempts.delete(key);
  const key = req.ip ?? "unknown";
  const entry = attempts.get(key) ?? { count: 0, expires: now + hour };
  if (entry.count >= 5 || attempts.size >= 10000) {
    res.set("Retry-After", "3600");
    res.status(429).json({ message: "Too many registration attempts. Please try again later." });
    return;
  }
  entry.count++;
  attempts.set(key, entry);
  const body = RegisterPartnerAccountBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: "Enter your name, phone, business name and city." });
    return;
  }
  const data = {
    name: body.data.name.trim(), phone: body.data.phone.trim(),
    businessName: body.data.businessName.trim(), city: body.data.city.trim(),
  };
  if (data.name.length < 2 || data.businessName.length < 2 || data.city.length < 2 ||
      !/^\+?[\d ()-]{7,20}$/.test(data.phone) || data.phone.replace(/\D/g, "").length < 7) {
    res.status(400).json({ message: "Enter valid registration details and phone number." });
    return;
  }
  const username = `sb${randomBytes(8).toString("hex")}`;
  const password = `SB!${randomBytes(18).toString("base64url")}9a`;
  const email = `${username}@partner.staybest.com`;
  let clerkId: string | undefined;
  try {
    const created = await clerkClient.users.createUser({
      emailAddress: [email], password, firstName: data.name,
    });
    clerkId = created.id;
    await db.transaction(async (tx) => {
      await tx.insert(usersTable).values({
        id: created.id, email, name: data.name, role: "partner",
        status: "active", approvalStatus: "pending",
        preferences: { partnerRegistration: { ...data, source: "self-service" } },
      });
      await tx.insert(vendorCredentialsTable).values({
        userId: created.id, password: ONE_TIME_PARTNER_PASSWORD,
      });
    });
  } catch {
    if (clerkId) {
      try { await clerkClient.users.deleteUser(clerkId); }
      catch { req.log.error({ userId: clerkId }, "Could not remove incomplete partner identity"); }
    }
    res.status(503).json({ message: "Registration could not be completed. Please try again later." });
    return;
  }
  res.status(201).json(RegisterPartnerAccountResponse.parse({
    username, password,
    message: "Save your username and password now. They are shown only once. Admin approval is required before you can access your partner dashboard.",
  }));
});

function application(user: typeof usersTable.$inferSelect) {
  const registration = (user.preferences.partnerRegistration ?? {}) as Record<string, unknown>;
  const text = (key: string) => typeof registration[key] === "string" ? registration[key] : "";
  return {
    id: user.id, username: user.email.split("@")[0], name: user.name,
    phone: text("phone"), businessName: text("businessName"), city: text("city"),
    status: user.approvalStatus, createdAt: user.createdAt.toISOString(),
  };
}

router.get("/admin/partner-applications", requireAdmin, async (_req, res): Promise<void> => {
  res.set("Cache-Control", "no-store");
  const rows = await db.select().from(usersTable)
    .where(and(eq(usersTable.role, "partner"),
      sql`${usersTable.preferences}->'partnerRegistration'->>'source' = 'self-service'`))
    .orderBy(desc(usersTable.createdAt));
  res.json(ListPartnerApplicationsResponse.parse(rows.map(application)));
});

router.post("/admin/partner-applications/:id/approval", requireAdmin, async (req, res): Promise<void> => {
  const params = DecidePartnerApplicationParams.safeParse(req.params);
  const body = DecidePartnerApplicationBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ message: "Invalid approval request." });
    return;
  }
  const [updated] = await db.update(usersTable)
    .set({ approvalStatus: body.data.status, updatedAt: new Date() })
    .where(and(eq(usersTable.id, params.data.id), eq(usersTable.role, "partner"),
      eq(usersTable.approvalStatus, "pending"),
      sql`${usersTable.preferences}->'partnerRegistration'->>'source' = 'self-service'`))
    .returning();
  if (!updated) {
    res.status(409).json({ message: "Application already reviewed or unavailable. Refresh and retry." });
    return;
  }
  res.json(DecidePartnerApplicationResponse.parse(application(updated)));
});

export default router;
