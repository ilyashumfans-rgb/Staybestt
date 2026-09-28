import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { db } from "./index";
import { eq, inArray, sql } from "drizzle-orm";
import {
  locationsTable,
  postalDirectorySourcesTable,
  postalDirectoryTable,
} from "./schema";

const batchSize = 500;

export type PostalDirectoryImportOptions = {
  csvPath: string;
  metadataPath: string;
};

export type PostalDirectoryImportResult = {
  status: "imported" | "skipped";
  rows: number;
  sourceSlug: string;
  checksum: string;
};

type SourceMetadata = {
  slug: string;
  name: string;
  sourceUrl: string;
  sourceLicense: string;
  datasetDate: string | null;
  sourceRevisionDate: string | null;
  retrievedAt: string;
  sha256: string;
  rowCount: number;
  notes: string;
};

type CsvRow = {
  circleName: string;
  regionName: string;
  divisionName: string;
  officeName: string;
  pincode: string;
  officeType: string;
  deliveryStatus: string;
  district: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
  sourceKey: string;
};

function parseCoordinate(
  raw: string,
  minimum: number,
  maximum: number,
): number | null {
  if (!raw.trim()) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : null;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value.trim());
  return values;
}

function parseSourceRows(csv: string): CsvRow[] {
  const lines = csv.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length < 2) throw new Error("Postal directory CSV is empty");
  const expectedHeader =
    "CircleName,RegionName,DivisionName,OfficeName,Pincode,OfficeType,Delivery,District,StateName,Latitude,Longitude";
  if (parseCsvLine(lines[0]).join(",") !== expectedHeader) {
    throw new Error("Postal directory CSV header does not match the checked-in source");
  }

  const occurrences = new Map<string, number>();
  return lines.slice(1).map((line, index) => {
    const fields = parseCsvLine(line);
    if (fields.length !== 11) {
      throw new Error(`Postal directory row ${index + 2} has ${fields.length} columns`);
    }
    const [
      circleName,
      regionName,
      divisionName,
      officeName,
      pincode,
      officeType,
      deliveryStatus,
      district,
      state,
      latitude,
      longitude,
    ] = fields;
    if (!state || !district || !officeName || !/^\d{6}$/.test(pincode)) {
      throw new Error(`Postal directory row ${index + 2} is missing a required field`);
    }
    const occurrence = occurrences.get(line) ?? 0;
    occurrences.set(line, occurrence + 1);
    const sourceKey = createHash("sha256")
      .update(`${line}\u0000${occurrence}`)
      .digest("hex");
    return {
      circleName,
      regionName,
      divisionName,
      officeName,
      pincode,
      officeType,
      deliveryStatus,
      district,
      state,
      latitude: parseCoordinate(latitude, -90, 90),
      longitude: parseCoordinate(longitude, -180, 180),
      sourceKey,
    };
  });
}

function schemaError(error: unknown): Error {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";
  if (code === "42P01" || code === "42703") {
    return new Error(
      "Postal directory schema is unavailable; publish the database schema before starting the API",
      { cause: error },
    );
  }
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Import the bundled source snapshot without changing database schema.
 *
 * This is intentionally safe to run during every API start. A source row with
 * the same full-file checksum and complete current row count is treated as
 * already imported. Schema creation/migration belongs to the development
 * post-merge flow and Replit Publish, never to this function.
 */
export async function importPostalDirectory(
  options: PostalDirectoryImportOptions,
): Promise<PostalDirectoryImportResult> {
  const [csv, metadataText] = await Promise.all([
    readFile(options.csvPath, "utf8"),
    readFile(options.metadataPath, "utf8"),
  ]);
  const metadata = JSON.parse(metadataText) as SourceMetadata;
  const sha256 = createHash("sha256").update(csv).digest("hex");
  if (sha256 !== metadata.sha256) {
    throw new Error(
      `Postal directory checksum mismatch: expected ${metadata.sha256}, got ${sha256}`,
    );
  }
  const rows = parseSourceRows(csv);
  if (rows.length !== metadata.rowCount) {
    throw new Error(
      `Postal directory row count mismatch: expected ${metadata.rowCount}, got ${rows.length}`,
    );
  }

  try {
    // Probe every table/column the refresh path depends on even when the
    // checksum lets us skip the expensive row upsert. A publish with an
    // incomplete schema must fail before the API starts serving traffic.
    await db
      .select({
        id: locationsTable.id,
        approved: locationsTable.approved,
        postalDirectoryId: locationsTable.postalDirectoryId,
      })
      .from(locationsTable)
      .limit(1);
    const [existing] = await db
      .select({
        id: postalDirectorySourcesTable.id,
        sha256: postalDirectorySourcesTable.sha256,
        rowCount: postalDirectorySourcesTable.rowCount,
      })
      .from(postalDirectorySourcesTable)
      .where(eq(postalDirectorySourcesTable.slug, metadata.slug));
    if (existing?.sha256 === metadata.sha256 && existing.rowCount === metadata.rowCount) {
      const [rowCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(postalDirectoryTable)
        .where(eq(postalDirectoryTable.sourceId, existing.id));
      const [currentCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(postalDirectoryTable)
        .where(
          sql`${postalDirectoryTable.sourceId} = ${existing.id}
            AND ${postalDirectoryTable.isCurrent} = true`,
        );
      const [invalidCoordinates] = await db
        .select({
          count: sql<number>`count(*)::int`,
        })
        .from(postalDirectoryTable)
        .where(
          sql`${postalDirectoryTable.sourceId} = ${existing.id}
            AND (
              ${postalDirectoryTable.latitude} = 'NaN'::double precision
              OR ${postalDirectoryTable.latitude} < -90
              OR ${postalDirectoryTable.latitude} > 90
              OR ${postalDirectoryTable.longitude} = 'NaN'::double precision
              OR ${postalDirectoryTable.longitude} < -180
              OR ${postalDirectoryTable.longitude} > 180
            )`,
        );
      if (
        Number(rowCount?.count ?? 0) === metadata.rowCount &&
        Number(currentCount?.count ?? 0) === metadata.rowCount
        && Number(invalidCoordinates?.count ?? 0) === 0
      ) {
        return {
          status: "skipped",
          rows: metadata.rowCount,
          sourceSlug: metadata.slug,
          checksum: metadata.sha256,
        };
      }
    }

    await db.transaction(async (tx) => {
      const [source] = await tx
        .insert(postalDirectorySourcesTable)
        .values({
          slug: metadata.slug,
          name: metadata.name,
          sourceUrl: metadata.sourceUrl,
          license: metadata.sourceLicense,
          datasetDate: metadata.datasetDate,
          sourceRevisionDate: metadata.sourceRevisionDate,
          retrievedAt: new Date(metadata.retrievedAt),
          sha256: metadata.sha256,
          rowCount: metadata.rowCount,
          notes: metadata.notes,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: postalDirectorySourcesTable.slug,
          set: {
            name: metadata.name,
            sourceUrl: metadata.sourceUrl,
            license: metadata.sourceLicense,
            datasetDate: metadata.datasetDate,
            sourceRevisionDate: metadata.sourceRevisionDate,
            retrievedAt: new Date(metadata.retrievedAt),
            sha256: metadata.sha256,
            rowCount: metadata.rowCount,
            notes: metadata.notes,
            updatedAt: new Date(),
          },
        })
        .returning({ id: postalDirectorySourcesTable.id });
      if (!source) throw new Error("Could not create postal directory source metadata");

      const previousRows = await tx
        .select({
          id: postalDirectoryTable.id,
          sourceKey: postalDirectoryTable.sourceKey,
        })
        .from(postalDirectoryTable)
        .where(eq(postalDirectoryTable.sourceId, source.id));
      const currentKeys = new Set(rows.map((row) => row.sourceKey));
      const retiredIds = previousRows
        .filter((row) => !currentKeys.has(row.sourceKey))
        .map((row) => row.id);
      await tx
        .update(postalDirectoryTable)
        .set({ isCurrent: false, updatedAt: new Date() })
        .where(eq(postalDirectoryTable.sourceId, source.id));
      for (let offset = 0; offset < retiredIds.length; offset += batchSize) {
        await tx
          .update(locationsTable)
          .set({ approved: false })
          .where(
            inArray(
              locationsTable.postalDirectoryId,
              retiredIds.slice(offset, offset + batchSize),
            ),
          );
      }

      for (let offset = 0; offset < rows.length; offset += batchSize) {
        const batch = rows.slice(offset, offset + batchSize);
        await tx
          .insert(postalDirectoryTable)
          .values(
            batch.map((row) => ({
              sourceId: source.id,
              sourceKey: row.sourceKey,
              state: row.state,
              district: row.district,
              officeName: row.officeName,
              pincode: row.pincode,
              officeType: row.officeType || null,
              deliveryStatus: row.deliveryStatus || null,
              circleName: row.circleName || null,
              regionName: row.regionName || null,
              divisionName: row.divisionName || null,
              latitude: row.latitude,
              longitude: row.longitude,
              isCurrent: true,
              updatedAt: new Date(),
            })),
          )
          .onConflictDoUpdate({
            target: postalDirectoryTable.sourceKey,
            set: {
              sourceId: source.id,
              state: sql`excluded.state`,
              district: sql`excluded.district`,
              officeName: sql`excluded.office_name`,
              pincode: sql`excluded.pincode`,
              officeType: sql`excluded.office_type`,
              deliveryStatus: sql`excluded.delivery_status`,
              circleName: sql`excluded.circle_name`,
              regionName: sql`excluded.region_name`,
              divisionName: sql`excluded.division_name`,
              latitude: sql`excluded.latitude`,
              longitude: sql`excluded.longitude`,
              isCurrent: true,
              updatedAt: new Date(),
            },
          });
      }
    });
  } catch (error) {
    throw schemaError(error);
  }

  return {
    status: "imported",
    rows: metadata.rowCount,
    sourceSlug: metadata.slug,
    checksum: metadata.sha256,
  };
}