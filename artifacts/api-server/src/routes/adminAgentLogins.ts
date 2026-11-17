import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { clerkClient } from "@clerk/express";
import { db, usersTable, vendorCredentialsTable, customerLoginsTable } from "@workspace/db";
import { UpdateAdminAgentLoginBody, GetAdminAgentLoginResponse } from "@workspace/api-zod";
import { provisionAgentLogin } from "../lib/provisionAgentLogin";

// Mounted only after the admin router's requireAdmin guard.
const router = Router();

async function findAgent(id: string) {
  const [agent] = await db.select().from(usersTable)
    .where(and(eq(usersTable.id, id), eq(usersTable.role, "agent"))).limit(1);
  return agent;
}

router.get("/agents/:id/login", async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  const agent = await findAgent(String(req.params.id));
  if (!agent) { res.status(404).json({ message: "Agent not found" }); return; }
  if (agent.id.startsWith("invited:")) {
    res.json({ userId: agent.id, username: "", email: agent.email, passwordEnabled: false, canReset: true });
    return;
  }
  try {
    const user = await clerkClient.users.getUser(agent.id);
    const [login] = await db.select().from(customerLoginsTable).where(eq(customerLoginsTable.userId, agent.id)).limit(1);
    const email = user.emailAddresses.find(item => item.id === user.primaryEmailAddressId)?.emailAddress ?? agent.email;
    res.json(GetAdminAgentLoginResponse.parse({ userId: agent.id, username: login?.username || user.username || "", email, passwordEnabled: user.passwordEnabled, canReset: true }));
  } catch (error) {
    if ((error as { status?: number }).status === 404) {
      res.json({ userId: agent.id, username: "", email: agent.email, passwordEnabled: false, canReset: true });
      return;
    }
    res.status(503).json({ message: "Could not load the agent's login account. Please try again." });
  }
});

router.put("/agents/:id/login", async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  const parsed = UpdateAdminAgentLoginBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Enter a username of 3–30 lowercase letters, numbers, dots, underscores or hyphens. A new password must be 8–128 characters." }); return; }
  const agent = await findAgent(String(req.params.id));
  if (!agent) { res.status(404).json({ message: "Agent not found" }); return; }
  let user: Awaited<ReturnType<typeof clerkClient.users.getUser>>;
  let passwordEnabled = false;
  let passwordChanged = false;
  try {
    let needsLogin = agent.id.startsWith("invited:");
    if (!needsLogin) {
      try { user = await clerkClient.users.getUser(agent.id); passwordEnabled = user.passwordEnabled; }
      catch (error) {
        if ((error as { status?: number }).status !== 404) throw error;
        needsLogin = true;
      }
    }
    if (needsLogin) {
      if (!parsed.data.password) { res.status(400).json({ message: "Enter a password to save this agent's login." }); return; }
      const [existing] = await db.select().from(customerLoginsTable).where(eq(customerLoginsTable.username, parsed.data.username)).limit(1);
      if (existing && existing.userId !== agent.id) { res.status(409).json({ message: "That username is already in use." }); return; }
      user = await provisionAgentLogin(agent, parsed.data.username, parsed.data.password);
      res.json(GetAdminAgentLoginResponse.parse({ userId: user.id, username: parsed.data.username, email: agent.email, passwordEnabled: true, canReset: true }));
      return;
    }
    if (!passwordEnabled && !parsed.data.password) {
      res.status(400).json({ message: "Enter a password to save this agent's login." }); return;
    }
    await db.transaction(async tx => {
      // Reserve the unique username before changing authentication credentials.
      await tx.insert(customerLoginsTable).values({ userId: agent.id, username: parsed.data.username })
        .onConflictDoUpdate({ target: customerLoginsTable.userId, set: { username: parsed.data.username, updatedAt: new Date() } });
      if (parsed.data.password) {
        user = await clerkClient.users.updateUser(agent.id, {
          password: parsed.data.password, signOutOfOtherSessions: true,
        });
        passwordChanged = true;
        passwordEnabled = user.passwordEnabled;
        await tx.delete(vendorCredentialsTable).where(eq(vendorCredentialsTable.userId, agent.id));
      }
    });
  } catch (error) {
    if (passwordChanged) {
      res.status(500).json({ message: "The password changed, but the username could not be saved. Retry saving these login details." }); return;
    }
    const dbError = error as { code?: string; cause?: { code?: string } };
    if (dbError.code === "23505" || dbError.cause?.code === "23505") {
      res.status(409).json({ message: "That username is already in use. Choose another username." }); return;
    }
    const providerError = error as { status?: number; errors?: { code?: string }[] };
    const codes = (providerError.errors ?? []).map(item => item.code ?? "")
      .filter(code => /^[a-z_]{1,80}$/.test(code));
    req.log?.warn({ codes, status: providerError.status }, "Agent login save rejected");
    let message = "Login details could not be saved. Please try again.";
    if (codes.includes("form_password_pwned")) {
      message = "This password is too common or has appeared in a data leak. Enter a different, unique password.";
    } else if (codes.some(code => code.startsWith("form_password"))) {
      message = "Choose a longer password with a mix of letters, numbers and symbols.";
    } else if (codes.includes("form_identifier_exists")) {
      message = "An account already uses this agent's email. Sign in with that email once to link the account, then save the login here.";
    } else if (providerError.status === 422) {
      message = "The login service rejected these details. Check the agent's email and use a unique password.";
    }
    res.status(providerError.status === 422 ? 400 : 503).json({ message });
    return;
  }
  res.json(GetAdminAgentLoginResponse.parse({ userId: agent.id, username: parsed.data.username, email: agent.email, passwordEnabled, canReset: true }));
});

export default router;
