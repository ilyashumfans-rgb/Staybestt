import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rows: [] as Array<{ id: string }>,
  getUser: vi.fn(),
  verifyPassword: vi.fn(),
  createSignInToken: vi.fn(),
}));
vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({ limit: async () => mocks.rows }),
        }),
      }),
    }),
  },
  customerLoginsTable: { username: "username", userId: "userId" },
  usersTable: { id: "id", role: "role", status: "status" },
}));
vi.mock("@clerk/express", () => ({
  clerkClient: {
    users: { getUser: mocks.getUser, verifyPassword: mocks.verifyPassword },
    signInTokens: { createSignInToken: mocks.createSignInToken },
  },
}));
vi.mock("drizzle-orm", () => ({ eq: () => true, and: () => true }));

import router from "./customerLogin";

// Exercise the router handler directly without a live server or real Clerk.
const handler = (router as any).stack.find((layer: any) => layer.route?.path === "/customer/login").route.stack[0].handle;
async function request(username: unknown, password: unknown) {
  const result = { code: 200, body: {} as any };
  const res = {
    status(code: number) { result.code = code; return this; },
    json(body: any) { result.body = body; return this; },
  };
  await handler({ body: { username, password }, ip: "192.0.2.1" }, res);
  return result;
}

describe("customer username sign-in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rows = [{ id: "user_123" }];
    mocks.getUser.mockResolvedValue({ twoFactorEnabled: false, banned: false, locked: false });
    mocks.verifyPassword.mockResolvedValue({});
    mocks.createSignInToken.mockResolvedValue({ token: "one-time-ticket" });
  });

  it("never returns a ticket for a missing or blocked/deleted account", async () => {
    mocks.rows = [];
    const response = await request("missing", "password123");
    expect(response.code).toBe(401);
    expect(response.body).toEqual({ message: "Wrong username or password" });
    expect(mocks.createSignInToken).not.toHaveBeenCalled();
  });

  it("rejects wrong passwords without issuing a ticket", async () => {
    mocks.verifyPassword.mockRejectedValue(new Error("invalid"));
    const response = await request("customer", "wrong");
    expect(response.code).toBe(401);
    expect(mocks.createSignInToken).not.toHaveBeenCalled();
  });

  it("does not bypass MFA or banned identities", async () => {
    mocks.getUser.mockResolvedValue({ twoFactorEnabled: true });
    expect((await request("customer", "password123")).code).toBe(403);
    expect(mocks.createSignInToken).not.toHaveBeenCalled();
    mocks.getUser.mockResolvedValue({ banned: true });
    expect((await request("customer", "password123")).code).toBe(401);
  });

  it("issues a short-lived ticket only after Clerk password verification", async () => {
    const response = await request("customer", "password123");
    expect(response).toEqual({ code: 200, body: { ticket: "one-time-ticket" } });
    expect(mocks.verifyPassword).toHaveBeenCalledWith({ userId: "user_123", password: "password123" });
    expect(mocks.createSignInToken).toHaveBeenCalledWith({ userId: "user_123", expiresInSeconds: 300 });
  });
});