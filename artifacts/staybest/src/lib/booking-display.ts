/**
 * Booking references are assigned only after a new online hold is captured.
 * Keep the absence of a reference visible instead of manufacturing a
 * reference from the database id (or a table row index).
 */
export function bookingReferenceLabel(
  bookingRef: string | null | undefined,
  status?: string | null,
): string {
  if ((!bookingRef || !bookingRef.trim()) && status === "expired") {
    return "Expired";
  }
  return bookingRef?.trim() || "Pending payment";
}

export function bookingStatusLabel(status: string | null | undefined): string {
  if (status === "pending_payment") return "Pending payment";
  if (status === "expired") return "Expired";
  return status || "Unknown";
}

export function getPaymentHoldExpiresAt(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const expiresAt = (value as { paymentHoldExpiresAt?: unknown }).paymentHoldExpiresAt;
  return typeof expiresAt === "string" && expiresAt ? expiresAt : null;
}

export function getPaymentAllowed(value: unknown): boolean | null {
  if (!value || typeof value !== "object") return null;
  const paymentAllowed = (value as { paymentAllowed?: unknown }).paymentAllowed;
  return typeof paymentAllowed === "boolean" ? paymentAllowed : null;
}

export function getPaymentMessage(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const message = (value as { message?: unknown }).message;
  return typeof message === "string" && message.trim() ? message.trim() : null;
}

export function isBookingConfirmed(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const booking = value as {
    status?: unknown;
    bookingRef?: unknown;
  };
  return booking.status === "confirmed" &&
    typeof booking.bookingRef === "string" &&
    booking.bookingRef.trim().length > 0;
}