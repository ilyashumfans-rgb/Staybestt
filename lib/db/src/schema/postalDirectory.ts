import {
  boolean,
  doublePrecision,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/**
 * Provenance for the checked-in postal directory snapshot. Keeping this as a
 * row rather than duplicating the attribution on every office makes it
 * possible to refresh the data without losing which snapshot supplied an
 * office.
 */
export const postalDirectorySourcesTable = pgTable(
  "postal_directory_sources",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    sourceUrl: text("source_url").notNull(),
    license: text("license").notNull(),
    datasetDate: text("dataset_date"),
    sourceRevisionDate: text("source_revision_date"),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
    sha256: text("sha256").notNull(),
    rowCount: integer("row_count").notNull(),
    notes: text("notes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("postal_directory_sources_slug_unique").on(t.slug)],
);

/**
 * Office-level records are intentionally separate from the existing
 * admin-managed locations table. A source row is not partner-selectable until
 * an administrator confirms it and supplies a city/taluk label when the
 * source did not provide one.
 */
export const postalDirectoryTable = pgTable(
  "postal_directory",
  {
    id: serial("id").primaryKey(),
    sourceId: integer("source_id")
      .notNull()
      .references(() => postalDirectorySourcesTable.id),
    sourceKey: text("source_key").notNull(),
    country: text("country").notNull().default("India"),
    state: text("state").notNull(),
    district: text("district").notNull(),
    cityOrTaluk: text("city_or_taluk"),
    cityOrTalukSource: text("city_or_taluk_source")
      .notNull()
      .default("unconfirmed"),
    officeName: text("office_name").notNull(),
    pincode: text("pincode").notNull(),
    officeType: text("office_type"),
    deliveryStatus: text("delivery_status"),
    circleName: text("circle_name"),
    regionName: text("region_name"),
    divisionName: text("division_name"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    approved: boolean("approved").notNull().default(false),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: text("approved_by"),
    isCurrent: boolean("is_current").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("postal_directory_source_key_unique").on(t.sourceKey),
    index("postal_directory_state_idx").on(t.state),
    index("postal_directory_state_district_idx").on(t.state, t.district),
    index("postal_directory_pincode_idx").on(t.pincode),
    index("postal_directory_approval_idx").on(t.approved, t.isCurrent),
  ],
);

export type PostalDirectorySource =
  typeof postalDirectorySourcesTable.$inferSelect;
export type PostalDirectoryEntry = typeof postalDirectoryTable.$inferSelect;