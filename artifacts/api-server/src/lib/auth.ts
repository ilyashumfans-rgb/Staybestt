import type { Request, Response, NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  propertiesTable,
  bookingsTable,
  reviewsTable,
  wishlistTable,
  commercialTermsTable,
  commissionLedgerTable,
  commissionLedgerEventsTable,
  payoutsTable,
  agentLifecycleEventsTable,
  commercialTermEventsTable,
  propertyReviewEventsTable,
  propertyDocumentUploadGrantsTable,
  propertyDocumentsTable,
  propertyDocumentUploadIntentsTable,
  agentAgreementDocumentsTable,
  customerLoginsTable,
  type User,
} from "@workspace/db";

/**
 * This is deliberately a typed error instead of a generic auth failure.  The
 * Express error handler turns these into the small, stable API surface that
 * clients need while keeping provider/database details out of responses.
 */
export class AuthResolutionError extends Error {
  constructor(
    readonly statusCode: 401 | 409 | 503,
    readonly reason: string,
    readonly authenticated: boolean,
    message: string,
  ) {
    super(message);
    this.name = "AuthResolutionError";
  }
}

function rejectAuth(
  req: Request,
  statusCode: 401 | 409 | 503,
  reason: string,
  message: string,
  authenticated: boolean,
): never {
  // Do not put identity, email, cookies, tokens, or session claims in
  // diagnostics. These booleans are enough to distinguish an absent cookie
  // from a provider/database rejection without creating an account oracle.
  req.log?.warn?.(
    {
      reason,
      cookiePresent: Boolean(req.headers.cookie),
      authAuthenticated: authenticated,
    },
    "Authentication identity resolution rejected",
  );
  throw new AuthResolutionError(statusCode, reason, authenticated, message);
}

function isProviderUserNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    status?: unknown;
    statusCode?: unknown;
    errors?: Array<{ code?: unknown }>;
  };
  const status = candidate.status ?? candidate.statusCode;
  if (status !== 404) return false;
  // Clerk's user endpoint uses these not-found codes. A 404 from another
  // operation must not be treated as proof that an old identity is gone.
  const codes = candidate.errors?.map((item) => item.code).filter(
    (code): code is string => typeof code === "string",
  );
  return !codes?.length || codes.some((code) =>
    ["user_not_found", "resource_not_found", "not_found"].includes(code),
  );
}

function primaryEmailOf(clerkUser: {
  primaryEmailAddress?: {
    emailAddress?: string | null;
    verification?: { status?: string | null } | null;
  } | null;
}) {
  const primary = clerkUser.primaryEmailAddress;
  const email = primary?.emailAddress?.trim() ?? "";
  if (!email || primary?.verification?.status !== "verified") return null;
  return email;
}

function displayNameOf(
  clerkUser: {
    firstName?: string | null;
    lastName?: string | null;
  },
  email: string,
) {
  return (
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
    email.split("@")[0] ||
    "User"
  );
}

async function getCurrentClerkUser(
  req: Request,
  userId: string,
  authenticated: boolean,
) {
  try {
    return await clerkClient.users.getUser(userId);
  } catch (error) {
    // A missing current user is not proof of an old identity migration. It is
    // an unavailable/invalid provider response and must never create a blank
    // local account.
    if (isProviderUserNotFound(error)) {
      rejectAuth(
        req,
        503,
        "authenticated_user_not_found",
        "Authentication provider unavailable",
        authenticated,
      );
    }
    rejectAuth(
      req,
      503,
      "clerk_lookup_failed",
      "Authentication provider unavailable",
      authenticated,
    );
  }
}

export async function repointUserReferences(tx: any, oldUserId: string, newUserId: string) {
  await tx.update(propertiesTable).set({ ownerId: newUserId }).where(eq(propertiesTable.ownerId, oldUserId));
  await tx.update(propertiesTable).set({ reviewedBy: newUserId }).where(eq(propertiesTable.reviewedBy, oldUserId));
  await tx.update(bookingsTable).set({ userId: newUserId }).where(eq(bookingsTable.userId, oldUserId));
  await tx.update(bookingsTable).set({ agentId: newUserId }).where(eq(bookingsTable.agentId, oldUserId));
  await tx.update(reviewsTable).set({ userId: newUserId }).where(eq(reviewsTable.userId, oldUserId));
  await tx.update(wishlistTable).set({ userId: newUserId }).where(eq(wishlistTable.userId, oldUserId));
  await tx.update(commercialTermsTable).set({ userId: newUserId }).where(eq(commercialTermsTable.userId, oldUserId));
  await tx.update(commercialTermsTable).set({ updatedBy: newUserId }).where(eq(commercialTermsTable.updatedBy, oldUserId));
  await tx.update(commissionLedgerTable).set({ recipientUserId: newUserId }).where(eq(commissionLedgerTable.recipientUserId, oldUserId));
  await tx.update(commissionLedgerEventsTable).set({ actorUserId: newUserId }).where(eq(commissionLedgerEventsTable.actorUserId, oldUserId));
  await tx.update(payoutsTable).set({ userId: newUserId }).where(eq(payoutsTable.userId, oldUserId));
  await tx.update(agentLifecycleEventsTable).set({ agentId: newUserId }).where(eq(agentLifecycleEventsTable.agentId, oldUserId));
  await tx.update(agentLifecycleEventsTable).set({ actorUserId: newUserId }).where(eq(agentLifecycleEventsTable.actorUserId, oldUserId));
  await tx.update(commercialTermEventsTable).set({ userId: newUserId }).where(eq(commercialTermEventsTable.userId, oldUserId));
  await tx.update(commercialTermEventsTable).set({ actorUserId: newUserId }).where(eq(commercialTermEventsTable.actorUserId, oldUserId));
  await tx.update(propertyReviewEventsTable).set({ agentId: newUserId }).where(eq(propertyReviewEventsTable.agentId, oldUserId));
  await tx.update(propertyReviewEventsTable).set({ actorUserId: newUserId }).where(eq(propertyReviewEventsTable.actorUserId, oldUserId));
  await tx.update(propertyDocumentUploadGrantsTable).set({ userId: newUserId }).where(eq(propertyDocumentUploadGrantsTable.userId, oldUserId));
  await tx.update(propertyDocumentUploadGrantsTable).set({ grantedBy: newUserId }).where(eq(propertyDocumentUploadGrantsTable.grantedBy, oldUserId));
  await tx.update(propertyDocumentUploadGrantsTable).set({ revokedBy: newUserId }).where(eq(propertyDocumentUploadGrantsTable.revokedBy, oldUserId));
  await tx.update(propertyDocumentsTable).set({ uploadedBy: newUserId }).where(eq(propertyDocumentsTable.uploadedBy, oldUserId));
  await tx.update(propertyDocumentsTable).set({ reviewedBy: newUserId }).where(eq(propertyDocumentsTable.reviewedBy, oldUserId));
  await tx.update(propertyDocumentUploadIntentsTable).set({ requestedBy: newUserId }).where(eq(propertyDocumentUploadIntentsTable.requestedBy, oldUserId));
  await tx.update(agentAgreementDocumentsTable).set({ agentId: newUserId }).where(eq(agentAgreementDocumentsTable.agentId, oldUserId));
  await tx.update(agentAgreementDocumentsTable).set({ reviewedBy: newUserId }).where(eq(agentAgreementDocumentsTable.reviewedBy, oldUserId));
  // Marketing/account auxiliary FKs are retained as history when a provisioned
  // invitation is claimed. Tables are deliberately explicit to make schema
  // additions to this migration path auditable.
  await tx.execute(sql`update coupon_redemptions set user_id=${newUserId} where user_id=${oldUserId}`);
  await tx.execute(sql`update promo_banner_events set user_id=${newUserId} where user_id=${oldUserId}`);
  await tx.execute(sql`update notifications set user_id=${newUserId} where user_id=${oldUserId}`);
  await tx.execute(sql`update notification_preferences set user_id=${newUserId} where user_id=${oldUserId}`);
  await tx.execute(sql`update expo_device_tokens set user_id=${newUserId} where user_id=${oldUserId}`);
  await tx.execute(sql`update team_assignments set user_id=${newUserId} where user_id=${oldUserId}`);
  await tx.execute(sql`update team_assignments set manager_user_id=${newUserId} where manager_user_id=${oldUserId}`);
  await tx.execute(sql`update referral_codes set user_id=${newUserId} where user_id=${oldUserId}`);
  await tx.execute(sql`update referral_attributions set referrer_user_id=${newUserId} where referrer_user_id=${oldUserId}`);
  await tx.execute(sql`update referral_attributions set referee_user_id=${newUserId} where referee_user_id=${oldUserId}`);
  await tx.execute(sql`update referral_attribution_events set actor_user_id=${newUserId} where actor_user_id=${oldUserId}`);
  await tx.execute(sql`update referral_reward_ledger set user_id=${newUserId} where user_id=${oldUserId}`);
  await tx.execute(sql`update referral_reward_events set actor_user_id=${newUserId} where actor_user_id=${oldUserId}`);
  await tx.execute(sql`update partner_profiles set user_id=${newUserId} where user_id=${oldUserId}`);
  await tx.execute(sql`update vendor_credentials set user_id=${newUserId} where user_id=${oldUserId}`);
  await tx.execute(sql`update booking_refunds set actor_user_id=${newUserId} where actor_user_id=${oldUserId}`);
  await tx.execute(sql`update razorpay_mobile_sessions set user_id=${newUserId} where user_id=${oldUserId}`);
  await tx.update(customerLoginsTable).set({ userId: newUserId }).where(eq(customerLoginsTable.userId, oldUserId));
}

declare global {
  namespace Express {
    interface Request {
      currentUser?: User;
    }
  }
}

/**
 * Resolves the Clerk-authenticated user, JIT-provisioning the local row.
 *
 * Resolve the verified managed-Clerk identity using the canonical claim
 * mapping. Neither value comes from the request body or client profile.
 */
export async function resolveUser(req: Request): Promise<User | null> {
  let auth: ReturnType<typeof getAuth>;
  try {
    auth = getAuth(req);
  } catch {
    rejectAuth(req, 503, "auth_context_failed", "Authentication provider unavailable", false);
  }
   const managedUserId = (auth.sessionClaims as { userId?: unknown } | null)?.userId;
   const userId = typeof managedUserId === "string" && managedUserId
     ? managedUserId
     : auth.userId;
   if (!userId) {
     req.log?.warn({
       reason: "session_missing",
       cookiePresent: !!req.headers.cookie,
       authAuthenticated: false,
     }, "Account authentication unavailable");
     return null;
   }

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (existing) {
    // A deleted account keeps a tombstone row for booking history but must
    // never authenticate again.
    if (existing.status === "deleted") return null;

    // An invitation may have been created after the first JIT row. It is an
    // email-based claim, so prove the current Clerk primary email is verified
    // before applying its role/lifecycle state.
    if (existing.role === "customer" && existing.email) {
      const [pending] = await db
        .select()
        .from(usersTable)
        .where(
          and(
            sql`lower(${usersTable.email}) = lower(${existing.email})`,
            sql`${usersTable.id} like 'invited:%'`,
          ),
        );
      if (pending) {
        const clerkUser = await getCurrentClerkUser(req, userId, true);
        const primaryEmail = primaryEmailOf(clerkUser);
        if (!primaryEmail) {
          rejectAuth(
            req,
            401,
            "primary_email_unverified",
            "A verified primary email is required",
            true,
          );
        }
        if (primaryEmail.toLowerCase() === existing.email.trim().toLowerCase()) {
          const claimed = await claimInvitedUser(req, {
            userId,
            email: primaryEmail,
            clerkName: displayNameOf(clerkUser, primaryEmail),
          });
          return claimed?.status === "deleted" ? null : claimed;
        }
      }
    }
    return existing;
  }

  // A missing local row is never provisioned from a session claim or a
  // client-provided email. Clerk is authoritative and the primary address
  // must be verified before any email lookup or insert.
  const clerkUser = await getCurrentClerkUser(req, userId, true);
  const email = primaryEmailOf(clerkUser);
  if (!email) {
    rejectAuth(
      req,
      401,
      "primary_email_unverified",
      "A verified primary email is required",
      true,
    );
  }
  const normalizedEmail = email.toLowerCase();
  const [sameEmail] = await db
    .select()
    .from(usersTable)
    .where(sql`lower(${usersTable.email}) = ${normalizedEmail}`);

  // Another first-page request may have finished provisioning this exact
  // authenticated identity while the Clerk lookup was in flight.
  if (sameEmail?.id === userId) {
    return sameEmail.status === "deleted" ? null : sameEmail;
  }

  if (sameEmail && sameEmail.id.startsWith("invited:")) {
    const claimed = await claimInvitedUser(req, {
      userId,
      email,
      clerkName: displayNameOf(clerkUser, email),
    });
    return claimed?.status === "deleted" ? null : claimed;
  }

  if (sameEmail) {
    // Only a plain active customer can be migrated automatically. A live
    // Clerk identity, privileged role, blocked row, or tombstone is an
    // explicit account-link decision, never an implicit merge.
    if (
      sameEmail.role !== "customer" ||
      sameEmail.status !== "active" ||
      sameEmail.approvalStatus !== "approved"
    ) {
      rejectAuth(
        req,
        409,
        "account_link_required",
        "Account link required",
        true,
      );
    }
    let oldIdentityAbsent = false;
    try {
      await clerkClient.users.getUser(sameEmail.id);
    } catch (error) {
      if (isProviderUserNotFound(error)) oldIdentityAbsent = true;
      else {
        rejectAuth(
          req,
          503,
          "clerk_old_identity_lookup_failed",
          "Authentication provider unavailable",
          true,
        );
      }
    }
    if (!oldIdentityAbsent) {
      rejectAuth(
        req,
        409,
        "account_link_required",
        "Account link required",
        true,
      );
    }
    return migrateOrCreateCustomer(req, {
      userId,
      email,
      absentOldIdentityId: sameEmail.id,
      clerkName: displayNameOf(clerkUser, email),
    });
  }

  return migrateOrCreateCustomer(req, {
    userId,
    email,
    absentOldIdentityId: null,
    clerkName: displayNameOf(clerkUser, email),
  });
}

type ClaimInput = {
  userId: string;
  email: string;
  clerkName: string;
};

async function claimInvitedUser(
  req: Request,
  input: ClaimInput,
): Promise<User | null> {
  try {
    return await db.transaction(async (tx) => {
      // Serialize all requests claiming the same email, including requests
      // handled by separate API instances.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.email.toLowerCase()}, 0))`);
      const [current] = await tx
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, input.userId));
      const [invited] = await tx
        .select()
        .from(usersTable)
        .where(
          and(
            sql`lower(${usersTable.email}) = lower(${input.email})`,
            sql`${usersTable.id} like 'invited:%'`,
          ),
        );
      if (!invited) return current ?? null;

      if (current) {
        await repointUserReferences(tx, invited.id, input.userId);
        const [updated] = await tx
          .update(usersTable)
          .set({
            role: invited.role,
            status: invited.status,
            statusReason: invited.statusReason,
            approvalStatus: invited.approvalStatus,
            approvalReason: invited.approvalReason,
            updatedAt: invited.updatedAt,
          })
          .where(eq(usersTable.id, input.userId))
          .returning();
        await tx.delete(usersTable).where(eq(usersTable.id, invited.id));
        return updated ?? null;
      }

      // No onConflictDoNothing: swallowing a conflict was the source of the
      // repeated 401/JIT loop. Any conflict aborts this transaction, keeping
      // the invitation and all of its foreign keys intact.
      await tx.update(usersTable).set({ email: "" }).where(eq(usersTable.id, invited.id));
      const [claimed] = await tx
        .insert(usersTable)
        .values({
          id: input.userId,
          email: invited.email,
          name: input.clerkName || invited.name,
          role: invited.role,
          preferences: invited.preferences,
          status: invited.status,
          statusReason: invited.statusReason,
          approvalStatus: invited.approvalStatus,
          approvalReason: invited.approvalReason,
          createdAt: invited.createdAt,
          updatedAt: invited.updatedAt,
        })
        .returning();
      await repointUserReferences(tx, invited.id, input.userId);
      await tx.delete(usersTable).where(eq(usersTable.id, invited.id));
      return claimed ?? null;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      rejectAuth(req, 409, "account_link_required", "Account link required", true);
    }
    throw error;
  }
}

async function migrateOrCreateCustomer(
  req: Request,
  input: ClaimInput & { absentOldIdentityId: string | null },
): Promise<User | null> {
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.email.toLowerCase()}, 0))`);
      const [current] = await tx
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, input.userId));
      if (current) return current.status === "deleted" ? null : current;

      const [old] = await tx
        .select()
        .from(usersTable)
        .where(sql`lower(${usersTable.email}) = ${input.email.toLowerCase()}`);
      if (old) {
        if (
          old.id.startsWith("invited:")
        ) {
          // The invitation appeared after the preflight lookup; claim it
          // through the same transaction rather than treating it as an
          // ordinary customer migration.
          await tx.update(usersTable).set({ email: "" }).where(eq(usersTable.id, old.id));
          const [claimed] = await tx
            .insert(usersTable)
            .values({
              id: input.userId,
              email: old.email,
              name: input.clerkName || old.name,
              role: old.role,
              preferences: old.preferences,
              status: old.status,
              statusReason: old.statusReason,
              approvalStatus: old.approvalStatus,
              approvalReason: old.approvalReason,
              createdAt: old.createdAt,
              updatedAt: old.updatedAt,
            })
            .returning();
          await repointUserReferences(tx, old.id, input.userId);
          await tx.delete(usersTable).where(eq(usersTable.id, old.id));
          return claimed ?? null;
        }
        if (
          input.absentOldIdentityId !== old.id ||
          old.role !== "customer" ||
          old.status !== "active" ||
          old.approvalStatus !== "approved"
        ) {
          rejectAuth(req, 409, "account_link_required", "Account link required", true);
        }

        // Free the case-insensitive email key only inside this transaction.
        // If the insert or any FK transfer fails, PostgreSQL rolls back this
        // update too, so the old account cannot be lost.
        await tx
          .update(usersTable)
          .set({ email: "" })
          .where(eq(usersTable.id, old.id));
        const [migrated] = await tx
          .insert(usersTable)
          .values({
            id: input.userId,
            email: old.email,
            name: old.name || input.clerkName,
            role: old.role,
            preferences: old.preferences,
            status: old.status,
            statusReason: old.statusReason,
            approvalStatus: old.approvalStatus,
            approvalReason: old.approvalReason,
            createdAt: old.createdAt,
            updatedAt: old.updatedAt,
          })
          .returning();
        await repointUserReferences(tx, old.id, input.userId);
        await tx.delete(usersTable).where(eq(usersTable.id, old.id));
        return migrated ?? null;
      }

      const [created] = await tx
        .insert(usersTable)
        .values({ id: input.userId, email: input.email, name: input.clerkName, role: "customer" })
        .returning();
      return created ?? null;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      rejectAuth(req, 409, "account_link_required", "Account link required", true);
    }
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "23505",
  );
}

export function requireRole(...roles: string[]) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const user = await resolveUser(req);
    if (!user) {
      res.status(401).json({ message: "Sign in required" });
      return;
    }
    if (!roles.includes(user.role)) {
      res.status(403).json({ message: "Insufficient permissions" });
      return;
    }
    if (
      user.role === "agent" &&
      (user.status !== "active" || user.approvalStatus !== "approved")
    ) {
      res.status(403).json({
        message:
          user.status === "blocked"
            ? "Agent account is blocked"
            : "Agent account is not approved",
      });
      return;
    }
    req.currentUser = user;
    next();
  };
}

export function requireSignedIn() {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const user = await resolveUser(req);
    if (!user) {
      res.status(401).json({ message: "Sign in required" });
      return;
    }
    req.currentUser = user;
    next();
  };
}
