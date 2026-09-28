import {
  Router,
  type IRouter,
  type Request,
  type Response,
} from "express";
import {
  and,
  asc,
  eq,
  ilike,
  inArray,
  or,
  sql,
} from "drizzle-orm";
import {
  db,
  locationsTable,
  postalDirectorySourcesTable,
  postalDirectoryTable,
} from "@workspace/db";
import {
  BulkSetPostalDirectoryApprovalBody,
  BulkSetPostalDirectoryApprovalResponse,
  ListAdminPostalDirectoryDistrictsQueryParams,
  ListAdminPostalDirectoryDistrictsResponse,
  ListAdminPostalDirectoryQueryParams,
  ListAdminPostalDirectoryResponse,
  ListAdminPostalDirectoryStatesResponse,
  ListPostalDirectoryDistrictsQueryParams,
  ListPostalDirectoryDistrictsResponse,
  ListPostalDirectoryQueryParams,
  ListPostalDirectoryResponse,
  ListPostalDirectoryStatesResponse,
  SetPostalDirectoryApprovalBody,
  SetPostalDirectoryApprovalParams,
  SetPostalDirectoryApprovalResponse,
  UpdateAdminPostalDirectoryBody,
  UpdateAdminPostalDirectoryParams,
  UpdateAdminPostalDirectoryResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "./admin";

const router: IRouter = Router();

function normalized(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase();
}

function locationKey(row: {
  country: string;
  state: string;
  cityOrTaluk: string;
  officeName: string;
  pincode: string;
}): string {
  return [
    normalized(row.country),
    normalized(row.state),
    normalized(row.cityOrTaluk),
    normalized(row.officeName),
    row.pincode.trim(),
  ].join("|");
}

function serializeDirectoryRow(row: {
  directory: typeof postalDirectoryTable.$inferSelect;
  source: typeof postalDirectorySourcesTable.$inferSelect;
}) {
  const latitude =
    typeof row.directory.latitude === "number" &&
    Number.isFinite(row.directory.latitude) &&
    row.directory.latitude >= -90 &&
    row.directory.latitude <= 90
      ? row.directory.latitude
      : null;
  const longitude =
    typeof row.directory.longitude === "number" &&
    Number.isFinite(row.directory.longitude) &&
    row.directory.longitude >= -180 &&
    row.directory.longitude <= 180
      ? row.directory.longitude
      : null;
  return {
    id: row.directory.id,
    sourceKey: row.directory.sourceKey,
    country: row.directory.country,
    state: row.directory.state,
    district: row.directory.district,
    cityOrTaluk: row.directory.cityOrTaluk,
    cityOrTalukSource: row.directory.cityOrTalukSource,
    officeName: row.directory.officeName,
    pincode: row.directory.pincode,
    officeType: row.directory.officeType,
    deliveryStatus: row.directory.deliveryStatus,
    circleName: row.directory.circleName,
    regionName: row.directory.regionName,
    divisionName: row.directory.divisionName,
    latitude,
    longitude,
    approved: row.directory.approved,
    isCurrent: row.directory.isCurrent,
    source: {
      slug: row.source.slug,
      name: row.source.name,
      sourceUrl: row.source.sourceUrl,
      license: row.source.license,
      datasetDate: row.source.datasetDate,
      sourceRevisionDate: row.source.sourceRevisionDate,
      retrievedAt: row.source.retrievedAt,
      sha256: row.source.sha256,
      rowCount: row.source.rowCount,
      notes: row.source.notes,
    },
  };
}

type DirectoryFilters = {
  state?: string;
  district?: string;
  cityOrTaluk?: string;
  officeName?: string;
  pincode?: string;
  q?: string;
  approved?: boolean;
  includeRetired?: boolean;
  publicOnly?: boolean;
};

function directoryConditions(filters: DirectoryFilters) {
  const conditions = [];
  if (!filters.includeRetired) {
    conditions.push(eq(postalDirectoryTable.isCurrent, true));
  }
  if (filters.publicOnly) {
    conditions.push(eq(postalDirectoryTable.approved, true));
  }
  if (filters.state?.trim()) {
    conditions.push(
      sql`lower(${postalDirectoryTable.state}) = lower(${filters.state.trim()})`,
    );
  }
  if (filters.district?.trim()) {
    conditions.push(
      sql`lower(${postalDirectoryTable.district}) = lower(${filters.district.trim()})`,
    );
  }
  if (filters.cityOrTaluk?.trim()) {
    conditions.push(
      ilike(postalDirectoryTable.cityOrTaluk, `%${filters.cityOrTaluk.trim()}%`),
    );
  }
  if (filters.officeName?.trim()) {
    conditions.push(
      ilike(postalDirectoryTable.officeName, `%${filters.officeName.trim()}%`),
    );
  }
  if (filters.pincode?.trim()) {
    conditions.push(eq(postalDirectoryTable.pincode, filters.pincode.trim()));
  }
  if (filters.q?.trim()) {
    const needle = `%${filters.q.trim()}%`;
    conditions.push(
      or(
        ilike(postalDirectoryTable.state, needle),
        ilike(postalDirectoryTable.district, needle),
        ilike(postalDirectoryTable.cityOrTaluk, needle),
        ilike(postalDirectoryTable.officeName, needle),
        eq(postalDirectoryTable.pincode, filters.q.trim()),
      ),
    );
  }
  if (filters.approved !== undefined) {
    conditions.push(eq(postalDirectoryTable.approved, filters.approved));
  }
  return conditions;
}

async function listDirectory(
  filters: DirectoryFilters,
  page: number,
  pageSize: number,
) {
  const conditions = directoryConditions(filters);
  const where = conditions.length ? and(...conditions) : undefined;
  const [totalRow, rows] = await Promise.all([
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(postalDirectoryTable)
      .where(where),
    db
      .select({
        directory: postalDirectoryTable,
        source: postalDirectorySourcesTable,
      })
      .from(postalDirectoryTable)
      .innerJoin(
        postalDirectorySourcesTable,
        eq(postalDirectoryTable.sourceId, postalDirectorySourcesTable.id),
      )
      .where(where)
      .orderBy(
        asc(postalDirectoryTable.state),
        asc(postalDirectoryTable.district),
        asc(postalDirectoryTable.cityOrTaluk),
        asc(postalDirectoryTable.officeName),
        asc(postalDirectoryTable.id),
      )
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ]);
  return {
    items: rows.map(serializeDirectoryRow),
    pagination: {
      page,
      pageSize,
      total: Number(totalRow[0]?.total ?? 0),
    },
  };
}

async function listHierarchy(
  state: string | undefined,
  includeRetired: boolean,
  publicOnly = false,
) {
  const conditions = directoryConditions({
    state,
    includeRetired,
    publicOnly,
  });
  const where = conditions.length ? and(...conditions) : undefined;
  return db
    .select({
      state: postalDirectoryTable.state,
      district: postalDirectoryTable.district,
      count: sql<number>`count(*)::int`,
    })
    .from(postalDirectoryTable)
    .where(where)
    .groupBy(postalDirectoryTable.state, postalDirectoryTable.district)
    .orderBy(
      asc(postalDirectoryTable.state),
      asc(postalDirectoryTable.district),
    );
}

async function listStates(includeRetired: boolean, publicOnly = false) {
  const conditions = directoryConditions({ includeRetired, publicOnly });
  const where = conditions.length ? and(...conditions) : undefined;
  return db
    .select({
      state: postalDirectoryTable.state,
      count: sql<number>`count(*)::int`,
    })
    .from(postalDirectoryTable)
    .where(where)
    .groupBy(postalDirectoryTable.state)
    .orderBy(asc(postalDirectoryTable.state));
}

function asDirectoryFilters(
  query: Record<string, unknown>,
  admin: boolean,
): { filters: DirectoryFilters; page: number; pageSize: number } | null {
  const normalizedQuery = { ...query };
  if (admin) {
    for (const key of ["approved", "includeRetired"] as const) {
      const value = normalizedQuery[key];
      if (value === undefined || typeof value === "boolean") continue;
      if (typeof value !== "string") return null;
      if (value.toLowerCase() === "true") {
        normalizedQuery[key] = true;
      } else if (value.toLowerCase() === "false") {
        normalizedQuery[key] = false;
      } else {
        return null;
      }
    }
  }
  if (admin) {
    const parsed =
      ListAdminPostalDirectoryQueryParams.safeParse(normalizedQuery);
    if (!parsed.success) return null;
    const data = parsed.data;
    return {
      filters: {
        state: data.state,
        district: data.district,
        cityOrTaluk: data.cityOrTaluk,
        officeName: data.officeName,
        pincode: data.pincode,
        q: data.q,
        approved: data.approved,
        includeRetired: data.includeRetired,
      },
      page: data.page,
      pageSize: data.pageSize,
    };
  }
  const parsed = ListPostalDirectoryQueryParams.safeParse(normalizedQuery);
  if (!parsed.success) return null;
  const data = parsed.data;
  return {
    filters: {
      state: data.state,
      district: data.district,
      cityOrTaluk: data.cityOrTaluk,
      officeName: data.officeName,
      pincode: data.pincode,
      q: data.q,
      publicOnly: true,
    },
    page: data.page,
    pageSize: data.pageSize,
  };
}

router.get("/postal-directory", async (req, res): Promise<void> => {
  const query = asDirectoryFilters(req.query as Record<string, unknown>, false);
  if (!query) {
    res.status(400).json({ message: "Invalid directory filters" });
    return;
  }
  res.json(ListPostalDirectoryResponse.parse(await listDirectory(
    query.filters,
    query.page,
    query.pageSize,
  )));
});

router.get("/postal-directory/states", async (_req, res): Promise<void> => {
  res.json(
    ListPostalDirectoryStatesResponse.parse(await listStates(false, true)),
  );
});

router.get("/postal-directory/districts", async (req, res): Promise<void> => {
  const parsed = ListPostalDirectoryDistrictsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid state filter" });
    return;
  }
  res.json(
    ListPostalDirectoryDistrictsResponse.parse(
      await listHierarchy(parsed.data.state, false, true),
    ),
  );
});

router.use("/admin/postal-directory", requireAdmin);

router.get("/admin/postal-directory", async (req, res): Promise<void> => {
  const query = asDirectoryFilters(req.query as Record<string, unknown>, true);
  if (!query) {
    res.status(400).json({ message: "Invalid directory filters" });
    return;
  }
  res.json(ListAdminPostalDirectoryResponse.parse(await listDirectory(
    query.filters,
    query.page,
    query.pageSize,
  )));
});

router.get(
  "/admin/postal-directory/states",
  async (_req, res): Promise<void> => {
    res.json(
      ListAdminPostalDirectoryStatesResponse.parse(await listStates(false)),
    );
  },
);

router.get(
  "/admin/postal-directory/districts",
  async (req, res): Promise<void> => {
    const parsed =
      ListAdminPostalDirectoryDistrictsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid state filter" });
      return;
    }
    res.json(
      ListAdminPostalDirectoryDistrictsResponse.parse(
        await listHierarchy(parsed.data.state, false),
      ),
    );
  },
);

class ApprovalValidationError extends Error {
  status = 400;
}

async function changeApproval(
  ids: number[],
  approved: boolean,
  actorId: string | null,
  labelOverride?: string | null,
) {
  if (ids.length === 0 || ids.length > 500 || new Set(ids).size !== ids.length) {
    throw new ApprovalValidationError(
      "Select between 1 and 500 unique directory rows",
    );
  }

  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ directory: postalDirectoryTable })
      .from(postalDirectoryTable)
      .where(
        and(
          inArray(postalDirectoryTable.id, ids),
          eq(postalDirectoryTable.isCurrent, true),
        ),
      );
    if (rows.length !== ids.length) {
      throw new ApprovalValidationError(
        "One or more selected directory rows are missing or retired",
      );
    }

    const labels = new Map<number, string | null>();
    for (const row of rows) {
      const label =
        labelOverride !== undefined
          ? labelOverride?.trim() || null
          : row.directory.cityOrTaluk?.trim() || null;
      if (approved && !label) {
        throw new ApprovalValidationError(
          `Confirm a city or taluk label before approving ${row.directory.officeName}`,
        );
      }
      labels.set(row.directory.id, label);
    }

    const locations = await tx.select().from(locationsTable);
    const byDirectoryId = new Map(
      locations
        .filter((location) => location.postalDirectoryId !== null)
        .map((location) => [location.postalDirectoryId!, location]),
    );
    const byLocationKey = new Map(
      locations.map((location) => [
        locationKey({
          country: location.country,
          state: location.state,
          cityOrTaluk: location.city,
          officeName: location.area,
          pincode: location.pincode,
        }),
        location,
      ]),
    );
    const seenKeys = new Set<string>();
    let locationsUpdated = 0;
    for (const row of rows) {
      const label = labels.get(row.directory.id) ?? null;
      const key = approved
        ? locationKey({
            country: row.directory.country,
            state: row.directory.state,
            cityOrTaluk: label!,
            officeName: row.directory.officeName,
            pincode: row.directory.pincode,
          })
        : null;
      const linked = byDirectoryId.get(row.directory.id);
      const duplicate = key ? byLocationKey.get(key) : undefined;
      if (duplicate && (!linked || duplicate.id !== linked.id)) {
        throw new ApprovalValidationError(
          `A managed location already uses ${row.directory.officeName} and ${row.directory.pincode}`,
        );
      }
      if (key && seenKeys.has(key)) {
        throw new ApprovalValidationError(
          "The selected rows contain duplicate approved location tuples",
        );
      }
      if (key) seenKeys.add(key);

      await tx
        .update(postalDirectoryTable)
        .set({
          cityOrTaluk: label,
          cityOrTalukSource: label ? "admin_confirmed" : "unconfirmed",
          approved,
          approvedAt: approved ? new Date() : null,
          approvedBy: approved ? actorId : null,
          updatedAt: new Date(),
        })
        .where(eq(postalDirectoryTable.id, row.directory.id));

      if (!approved) {
        if (linked) {
          await tx
            .update(locationsTable)
            .set({ approved: false })
            .where(eq(locationsTable.id, linked.id));
          locationsUpdated += 1;
        }
        continue;
      }

      if (linked) {
        await tx
          .update(locationsTable)
          .set({
            country: row.directory.country,
            state: row.directory.state,
            district: row.directory.district,
            city: label!,
            area: row.directory.officeName,
            pincode: row.directory.pincode,
            approved: true,
          })
          .where(eq(locationsTable.id, linked.id));
        locationsUpdated += 1;
        continue;
      }

      const [created] = await tx
        .insert(locationsTable)
        .values({
          country: row.directory.country,
          state: row.directory.state,
          district: row.directory.district,
          city: label!,
          area: row.directory.officeName,
          pincode: row.directory.pincode,
          approved: true,
          postalDirectoryId: row.directory.id,
        })
        .returning({ id: locationsTable.id });
      if (!created) throw new Error("Could not link approved postal directory row");
      locationsUpdated += 1;
    }

    const updatedRows = await tx
      .select({
        directory: postalDirectoryTable,
        source: postalDirectorySourcesTable,
      })
      .from(postalDirectoryTable)
      .innerJoin(
        postalDirectorySourcesTable,
        eq(postalDirectoryTable.sourceId, postalDirectorySourcesTable.id),
      )
      .where(inArray(postalDirectoryTable.id, ids));
    return {
      updated: updatedRows.length,
      approved,
      locationsUpdated,
      items: updatedRows.map(serializeDirectoryRow),
    };
  });
}

router.patch(
  "/admin/postal-directory/:id",
  async (req, res): Promise<void> => {
    const params = UpdateAdminPostalDirectoryParams.safeParse(req.params);
    const body = UpdateAdminPostalDirectoryBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ message: "Invalid city/taluk label" });
      return;
    }
    const label = body.data.cityOrTaluk?.trim() || null;
    try {
      const result = await db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(postalDirectoryTable)
          .where(
            and(
              eq(postalDirectoryTable.id, params.data.id),
              eq(postalDirectoryTable.isCurrent, true),
            ),
          );
        if (!row) throw new ApprovalValidationError("Directory row not found");
        if (row.approved && !label) {
          throw new ApprovalValidationError(
            "An approved row must retain a city or taluk label",
          );
        }
        if (row.approved) {
          const linked = await tx
            .select()
            .from(locationsTable)
            .where(eq(locationsTable.postalDirectoryId, row.id));
          const duplicate = (await tx.select().from(locationsTable)).find(
            (location) =>
              location.id !== linked[0]?.id &&
              locationKey({
                country: location.country,
                state: location.state,
                cityOrTaluk: location.city,
                officeName: location.area,
                pincode: location.pincode,
              }) ===
                locationKey({
                  country: row.country,
                  state: row.state,
                  cityOrTaluk: label!,
                  officeName: row.officeName,
                  pincode: row.pincode,
                }),
          );
          if (duplicate) {
            throw new ApprovalValidationError(
              `A managed location already uses ${row.officeName} and ${row.pincode}`,
            );
          }
        }
        const [updated] = await tx
          .update(postalDirectoryTable)
          .set({
            cityOrTaluk: label,
            cityOrTalukSource: label ? "admin_confirmed" : "unconfirmed",
            updatedAt: new Date(),
          })
          .where(eq(postalDirectoryTable.id, row.id))
          .returning();
        if (row.approved) {
          await tx
            .update(locationsTable)
            .set({ city: label! })
            .where(eq(locationsTable.postalDirectoryId, row.id));
        }
        const [withSource] = await tx
          .select({
            directory: postalDirectoryTable,
            source: postalDirectorySourcesTable,
          })
          .from(postalDirectoryTable)
          .innerJoin(
            postalDirectorySourcesTable,
            eq(postalDirectoryTable.sourceId, postalDirectorySourcesTable.id),
          )
          .where(eq(postalDirectoryTable.id, updated!.id));
        return serializeDirectoryRow(withSource!);
      });
      res.json(UpdateAdminPostalDirectoryResponse.parse(result));
    } catch (error) {
      if (error instanceof ApprovalValidationError) {
        res.status(error.status).json({ message: error.message });
        return;
      }
      throw error;
    }
  },
);

async function handleApproval(
  req: Request,
  res: Response,
  ids: number[],
  approved: boolean,
  labelOverride?: string | null,
  parseResponse: (value: unknown) => unknown = (value) => value,
) {
  try {
    const result = await changeApproval(
      ids,
      approved,
      req.currentUser?.id ?? null,
      labelOverride,
    );
    res.json(parseResponse(result));
  } catch (error) {
    if (error instanceof ApprovalValidationError) {
      res.status(error.status).json({ message: error.message });
      return;
    }
    throw error;
  }
}

router.post(
  "/admin/postal-directory/:id/approval",
  async (req, res): Promise<void> => {
    const params = SetPostalDirectoryApprovalParams.safeParse(req.params);
    const body = SetPostalDirectoryApprovalBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ message: "Invalid approval request" });
      return;
    }
    await handleApproval(
      req,
      res,
      [params.data.id],
      body.data.approved,
      body.data.cityOrTaluk,
      SetPostalDirectoryApprovalResponse.parse,
    );
  },
);

router.post(
  "/admin/postal-directory/approval",
  async (req, res): Promise<void> => {
    const body = BulkSetPostalDirectoryApprovalBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ message: "Select between 1 and 500 rows" });
      return;
    }
    await handleApproval(
      req,
      res,
      body.data.ids,
      body.data.approved,
      undefined,
      BulkSetPostalDirectoryApprovalResponse.parse,
    );
  },
);

export default router;