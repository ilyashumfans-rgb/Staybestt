import { createHash, randomUUID } from "node:crypto";
import type { Server } from "node:http";
import express from "express";
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db, usersTable, vendorCredentialsTable, customerLoginsTable, agentAgreementProfilesTable, commercialTermsTable } from "@workspace/db";

const provider = vi.hoisted(() => ({ getUser: vi.fn(), updateUser: vi.fn(), createUser: vi.fn(), deleteUser: vi.fn(), verifyPassword: vi.fn(), createSignInToken: vi.fn() }));
vi.mock("@clerk/express", () => ({ clerkClient: { users: provider, signInTokens: { createSignInToken: provider.createSignInToken } } }));
vi.mock("../lib/auth", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/auth")>(),
  resolveUser: vi.fn(async () => null),
}));
process.env.ADMIN_USERNAME = "agent-login-test";
process.env.ADMIN_PASSWORD = "agent-login-test-only-password";
process.env.SESSION_SECRET = "agent-login-test-only-session";
const token = createHash("sha256").update(`${process.env.ADMIN_USERNAME}:${process.env.ADMIN_PASSWORD}:${process.env.SESSION_SECRET}`).digest("hex");
const id = `user_test_${randomUUID()}`;
const customer = `user_test_${randomUUID()}`;
const invited = `invited:${randomUUID()}`;
const username = `a-${randomUUID().slice(0, 20)}`;
const createdId = `user_created_${randomUUID()}`;
let server: Server, base = "";
const request = (suffix = "", init: RequestInit = {}, authorized = true) => fetch(`${base}/admin/agents/${id}/login${suffix}`, {
  ...init, headers: { "Content-Type": "application/json", ...(authorized ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
});

describe("admin agent login management", () => {
  beforeAll(async () => {
    const { default: router } = await import("./admin");
    const { default: loginRouter } = await import("./customerLogin");
    const app = express();
    app.use(express.json()); app.use(router); app.use(loginRouter);
    await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", () => resolve()); });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    await db.insert(usersTable).values([
      { id, email: `${id}@example.test`, role: "agent" },
      { id: customer, email: `${customer}@example.test`, role: "customer" },
      { id: invited, email: `${randomUUID()}@example.test`, role: "agent" },
    ]);
  });
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    await db.delete(commercialTermsTable).where(eq(commercialTermsTable.userId, createdId));
    await db.delete(usersTable).where(inArray(usersTable.id, [id, customer, invited, createdId]));
  });
  beforeEach(() => {
    vi.clearAllMocks();
    const user = { username: "agent-test", emailAddresses: [{ id: "email_test", emailAddress: "agent@example.test" }], primaryEmailAddressId: "email_test", passwordEnabled: true };
    provider.getUser.mockResolvedValue(user); provider.updateUser.mockResolvedValue(user);
    provider.verifyPassword.mockResolvedValue({});
    provider.createSignInToken.mockResolvedValue({ token: "test-only-ticket" });
    provider.createUser.mockResolvedValue({ ...user, id: createdId });
    provider.deleteUser.mockResolvedValue({});
  });
  it("denies unauthenticated reads and resets without calling the provider", async () => {
    expect((await request("", {}, false)).status).toBe(401);
    expect((await request("", { method: "PUT", body: JSON.stringify({ username, password: "Test-only-Password-123!" }) }, false)).status).toBe(401);
    expect(provider.updateUser).not.toHaveBeenCalled();
  });
  it("shows the provider login but never a recoverable password", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const data = await response.json() as Record<string, unknown>;
    expect(data.username).toBe("agent-test");
    expect(data).not.toHaveProperty("password");
  });
  it("validates password length and rejects non-agent accounts", async () => {
    expect((await request("", { method: "PUT", body: JSON.stringify({ username, password: "short" }) })).status).toBe(400);
    const response = await fetch(`${base}/admin/agents/${customer}/login`, { headers: { Authorization: `Bearer ${token}` } });
    expect(response.status).toBe(404);
    expect(provider.getUser).not.toHaveBeenCalled();
  });
  it("creates an invited agent's login while retaining their profile and approval state", async () => {
    await db.update(usersTable).set({ approvalStatus: "pending", preferences: { marker: "preserve" } }).where(eq(usersTable.id, invited));
    await db.insert(agentAgreementProfilesTable).values({ agentId: invited, details: { fatherName: "Test Parent" } });
    await db.insert(commercialTermsTable).values({ userId: invited, mode: "percentage", value: 12 });
    const response = await fetch(`${base}/admin/agents/${encodeURIComponent(invited)}/login`, {
      method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ username: `${username}-newbie`, password: "Test-only-Password-123!" }),
    });
    expect(response.status).toBe(200);
    expect((await response.json() as { userId: string }).userId).toBe(createdId);
    expect(provider.updateUser).not.toHaveBeenCalled();
    expect(provider.createUser).toHaveBeenCalledTimes(1);
    const [saved] = await db.select().from(usersTable).where(eq(usersTable.id, createdId));
    expect(saved.role).toBe("agent");
    expect(saved.approvalStatus).toBe("pending");
    expect(saved.preferences).toEqual({ marker: "preserve" });
    expect(await db.select().from(usersTable).where(eq(usersTable.id, invited))).toHaveLength(0);
    expect((await db.select().from(agentAgreementProfilesTable).where(eq(agentAgreementProfilesTable.agentId, createdId)))[0].details.fatherName).toBe("Test Parent");
    expect((await db.select().from(commercialTermsTable).where(eq(commercialTermsTable.userId, createdId)))[0].value).toBe(12);
  });
  it("identifies records without a linked login instead of suggesting a retry", async () => {
    provider.getUser.mockRejectedValue({ status: 404 });
    const response = await request();
    expect(response.status).toBe(200);
    expect((await response.json() as { canReset: boolean }).canReset).toBe(true);
  });
  it("updates the correct agent, revokes sessions and clears stale credential copies", async () => {
    await db.insert(vendorCredentialsTable).values({ userId: id, password: "obsolete-test-only" });
    const response = await request("", { method: "PUT", body: JSON.stringify({ username, password: "Test-only-Password-123!" }) });
    expect(response.status).toBe(200);
    expect(provider.updateUser).toHaveBeenCalledWith(id, { password: "Test-only-Password-123!", signOutOfOtherSessions: true });
    expect(await db.select().from(vendorCredentialsTable).where(eq(vendorCredentialsTable.userId, id))).toHaveLength(0);
    expect(await response.text()).not.toContain("Test-only-Password");
  });
  it("reports password policy rejection rather than success", async () => {
    provider.updateUser.mockRejectedValue({ status: 422, errors: [{ code: "form_password_pwned" }] });
    const response = await request("", { method: "PUT", body: JSON.stringify({ username, password: "Test-only-Password-123!" }) });
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("different, unique password");
  });
  it("does not misreport an email conflict as a compromised password", async () => {
    provider.updateUser.mockRejectedValue({ status: 422, errors: [{ code: "form_identifier_exists" }] });
    const response = await request("", { method: "PUT", body: JSON.stringify({ username, password: "Test-only-Password-123!" }) });
    expect(response.status).toBe(400);
    const text = await response.text();
    expect(text).toContain("agent's email");
    expect(text).not.toContain("data leak");
  });
  it("renames a username without resetting the password and allows the approved agent to log in", async () => {
    const renamed = `${username}-new`;
    expect((await request("", { method: "PUT", body: JSON.stringify({ username: renamed }) })).status).toBe(200);
    expect(provider.updateUser).not.toHaveBeenCalled();
    expect((await (await request()).json() as { username: string }).username).toBe(renamed);
    const login = (name: string) => fetch(`${base}/customer/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: name, password: "Test-only-Password-123!" }),
    });
    expect((await login(username)).status).toBe(401);
    expect((await login(renamed)).status).toBe(200);
    expect(provider.verifyPassword).toHaveBeenCalledWith({ userId: id, password: "Test-only-Password-123!" });
    await db.update(usersTable).set({ approvalStatus: "pending" }).where(eq(usersTable.id, id));
    try { expect((await login(renamed)).status).toBe(401); }
    finally { await db.update(usersTable).set({ approvalStatus: "approved" }).where(eq(usersTable.id, id)); }
  });
  it("rejects duplicate usernames before touching the password", async () => {
    const taken = `${username}-other`;
    await db.insert(customerLoginsTable).values({ userId: customer, username: taken });
    const response = await request("", { method: "PUT", body: JSON.stringify({ username: taken, password: "Test-only-Password-123!" }) });
    expect(response.status).toBe(409);
    expect(provider.updateUser).not.toHaveBeenCalled();
  });
});
