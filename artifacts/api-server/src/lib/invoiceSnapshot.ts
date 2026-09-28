export type InvoiceBookingSnapshot = {
  id: number;
  bookingRef: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  propertyName: string;
  roomName: string;
  checkIn: string;
  checkOut: string;
  totalMinor: number;
};

export type PersistedInvoiceBooking = {
  bookingId: number | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  bookingSnapshotRef: string | null;
  bookingSnapshotPropertyName: string | null;
  bookingSnapshotRoomName: string | null;
  bookingSnapshotCheckIn: string | null;
  bookingSnapshotCheckOut: string | null;
  bookingSnapshotTotalMinor: number | null;
};

export function invoiceBookingFromSnapshot(
  invoice: PersistedInvoiceBooking,
): InvoiceBookingSnapshot | null {
  if (
    invoice.bookingId === null ||
    invoice.bookingSnapshotPropertyName === null ||
    invoice.bookingSnapshotRoomName === null ||
    invoice.bookingSnapshotCheckIn === null ||
    invoice.bookingSnapshotCheckOut === null ||
    invoice.bookingSnapshotTotalMinor === null
  ) {
    return null;
  }
  return {
    id: invoice.bookingId,
    bookingRef: invoice.bookingSnapshotRef,
    customerName: invoice.customerName,
    customerEmail: invoice.customerEmail,
    customerPhone: invoice.customerPhone,
    propertyName: invoice.bookingSnapshotPropertyName,
    roomName: invoice.bookingSnapshotRoomName,
    checkIn: invoice.bookingSnapshotCheckIn,
    checkOut: invoice.bookingSnapshotCheckOut,
    totalMinor: invoice.bookingSnapshotTotalMinor,
  };
}