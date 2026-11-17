import { clerkClient } from "@clerk/express";
import { db, usersTable, customerLoginsTable, type User } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { repointUserReferences } from "./auth";

// Create only a new provider identity. Never reset another identity found by email.
export async function provisionAgentLogin(agent: User, username: string, password: string) {
  const created = await clerkClient.users.createUser({
    emailAddress: [agent.email], password, firstName: agent.name || undefined,
  });
  try {
    await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${agent.email.toLowerCase()}, 0))`);
      const [current] = await tx.select().from(usersTable).where(eq(usersTable.id, agent.id)).for("update");
      if (!current || current.role !== "agent" || current.email !== agent.email) throw new Error("Agent changed");
      await tx.update(usersTable).set({ email: "" }).where(eq(usersTable.id, agent.id));
      await tx.insert(usersTable).values({
        ...current, id: created.id, updatedAt: new Date(),
      });
      await repointUserReferences(tx, agent.id, created.id);
      await tx.delete(usersTable).where(eq(usersTable.id, agent.id));
      await tx.insert(customerLoginsTable).values({ userId: created.id, username })
        .onConflictDoUpdate({ target: customerLoginsTable.userId, set: { username, updatedAt: new Date() } });
    });
  } catch (error) {
    try { await clerkClient.users.deleteUser(created.id); }
    catch { throw new Error("Agent login could not be saved and requires account cleanup. Contact the administrator before retrying."); }
    throw error;
  }
  return created;
}
