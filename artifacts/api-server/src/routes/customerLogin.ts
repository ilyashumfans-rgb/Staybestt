import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { clerkClient } from "@clerk/express";
import { customerLoginsTable, db, usersTable } from "@workspace/db";

const router: IRouter = Router();
const attempts = new Map<string, { count: number; until: number }>();
const invalid = { message: "Wrong username or password" };

router.post("/customer/login", async (req, res): Promise<void> => {
  const username = typeof req.body?.username === "string" ? req.body.username.trim().toLowerCase() : "";
  const password = req.body?.password;
  if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(username) || typeof password !== "string" || !password || password.length > 128) {
    res.status(401).json(invalid);
    return;
  }
  const key = `${req.ip}|${username}`;
  const now = Date.now();
  const current = attempts.get(key);
  if (current && current.until > now && current.count >= 10) {
    res.status(429).json({ message: "Too many attempts. Try again later." });
    return;
  }
  const fail = async () => {
    const old = attempts.get(key);
    attempts.set(key, { count: old && old.until > now ? old.count + 1 : 1, until: now + 15 * 60_000 });
    if (attempts.size > 10000) for (const [id, entry] of attempts) if (entry.until < now) attempts.delete(id);
    await new Promise((resolve) => setTimeout(resolve, 500));
    res.status(401).json(invalid);
  };
  const [account] = await db.select({ id: usersTable.id })
    .from(customerLoginsTable)
    .innerJoin(usersTable, eq(usersTable.id, customerLoginsTable.userId))
    .where(and(eq(customerLoginsTable.username, username), eq(usersTable.role, "customer"), eq(usersTable.status, "active")))
    .limit(1);
  if (!account) { await fail(); return; }
  try {
    const user = await clerkClient.users.getUser(account.id);
    // Ticket sign-in skips the normal second-factor challenge. Accounts with
    // MFA must use the ordinary Clerk sign-in instead.
    if (user.banned || user.locked) { await fail(); return; }
    if (user.twoFactorEnabled) {
      res.status(403).json({ message: "Use email sign-in for an account with two-step verification." });
      return;
    }
    await clerkClient.users.verifyPassword({ userId: account.id, password });
  } catch {
    await fail();
    return;
  }
  const token = await clerkClient.signInTokens.createSignInToken({ userId: account.id, expiresInSeconds: 300 });
  attempts.delete(key);
  res.json({ ticket: token.token });
});

export default router;