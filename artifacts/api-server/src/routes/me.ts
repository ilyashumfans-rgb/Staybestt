import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { GetMeResponse, UpdateMeBody, UpdateMeResponse } from "@workspace/api-zod";
import { db, usersTable } from "@workspace/db";
import { resolveUser } from "../lib/auth";

const router: IRouter = Router();

router.get("/me", async (req, res): Promise<void> => {
  const user = await resolveUser(req);
  if (!user) {
    res.status(401).json({ message: "Not signed in" });
    return;
  }
  res.json(
    GetMeResponse.parse({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      preferences: user.preferences ?? {},
    }),
  );
});

router.post("/me/update", async (req, res): Promise<void> => {
  const user = await resolveUser(req);
  if (!user) {
    res.status(401).json({ message: "Not signed in" });
    return;
  }
  const body = UpdateMeBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: "Invalid input" });
    return;
  }
  const updates: Partial<{ name: string; preferences: Record<string, unknown> }> = {};
  if (body.data.name !== undefined) {
    const trimmed = body.data.name.trim();
    if (!trimmed || trimmed.length > 100) {
      res.status(400).json({ message: "Name must be 1-100 characters" });
      return;
    }
    updates.name = trimmed;
  }
  if (body.data.preferences !== undefined) {
    updates.preferences = {
      ...((user.preferences as Record<string, unknown>) ?? {}),
      ...body.data.preferences,
    };
  }
  const [updated] = Object.keys(updates).length
    ? await db
        .update(usersTable)
        .set(updates)
        .where(eq(usersTable.id, user.id))
        .returning()
    : [user];
  res.json(
    UpdateMeResponse.parse({
      id: updated!.id,
      email: updated!.email,
      name: updated!.name,
      role: updated!.role,
      preferences: updated!.preferences ?? {},
    }),
  );
});

export default router;
