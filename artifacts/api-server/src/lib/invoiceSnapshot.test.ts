import { describe, expect, it } from "vitest";
import { invoiceBookingFromSnapshot } from "./invoiceSnapshot";

describe("invoice booking snapshots", () => {
  it("reads only the persisted stay snapshot fields", () => {
    const persisted = {
      bookingId: 42,
      customerName: "Snapshot Guest",
      customerEmail: "guest@example.com",
      customerPhone: null,
      bookingSnapshotRef: "SB-BOOK-42",
      bookingSnapshotPropertyName: "Original Resort",
      bookingSnapshotRoomName: "Garden Suite",
      bookingSnapshotCheckIn: "2030-01-01",
      bookingSnapshotCheckOut: "2030-01-04",
      bookingSnapshotTotalMinor: 45_000,
    };

    expect(invoiceBookingFromSnapshot(persisted)).toEqual({
      id: 42,
      bookingRef: "SB-BOOK-42",
      customerName: "Snapshot Guest",
      customerEmail: "guest@example.com",
      customerPhone: null,
      propertyName: "Original Resort",
      roomName: "Garden Suite",
      checkIn: "2030-01-01",
      checkOut: "2030-01-04",
      totalMinor: 45_000,
    });
  });

  it("does not invent a live booking when a legacy invoice lacks a snapshot", () => {
    expect(
      invoiceBookingFromSnapshot({
        bookingId: 42,
        customerName: "Legacy Guest",
        customerEmail: "guest@example.com",
        customerPhone: null,
        bookingSnapshotRef: null,
        bookingSnapshotPropertyName: null,
        bookingSnapshotRoomName: null,
        bookingSnapshotCheckIn: null,
        bookingSnapshotCheckOut: null,
        bookingSnapshotTotalMinor: null,
      }),
    ).toBeNull();
  });
});