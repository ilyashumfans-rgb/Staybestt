import AsyncStorage from '@react-native-async-storage/async-storage';

export type SavedBooking = {
  bookingId: number;
  bookingRef: string | null;
  totalAmount: number;
  status: string;
  paymentHoldExpiresAt: string | null;
};

const BOOKING_DRAFT_PREFIX = 'staybest.booking-draft.';

function hash(value: string): string {
  // A deterministic local key avoids storing guest details in the key itself.
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16);
}

export function getBookingDraftKey(input: Record<string, unknown>): string {
  const normalized = Object.keys(input)
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      result[key] = input[key];
      return result;
    }, {});
  return `${BOOKING_DRAFT_PREFIX}${hash(JSON.stringify(normalized))}`;
}

export async function readSavedBooking(
  key: string,
): Promise<SavedBooking | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<SavedBooking>;
    if (
      typeof parsed.bookingId !== 'number' ||
      !Number.isFinite(parsed.bookingId) ||
      parsed.bookingId <= 0 ||
      (parsed.bookingRef != null && typeof parsed.bookingRef !== 'string') ||
      typeof parsed.totalAmount !== 'number'
    ) {
      await AsyncStorage.removeItem(key);
      return null;
    }

    // Drafts written before pending-payment support represented a completed
    // booking. Keep those safe to reopen, but never reuse a pending draft
    // without its server-provided hold expiry.
    const status =
      typeof parsed.status === 'string'
        ? parsed.status
        : parsed.bookingRef
          ? 'confirmed'
          : 'pending_payment';
    const paymentHoldExpiresAt =
      typeof parsed.paymentHoldExpiresAt === 'string'
        ? parsed.paymentHoldExpiresAt
        : null;

    if (
      status === 'pending_payment' &&
      (!paymentHoldExpiresAt ||
        Number.isNaN(Date.parse(paymentHoldExpiresAt)) ||
        Date.parse(paymentHoldExpiresAt) <= Date.now())
    ) {
      await AsyncStorage.removeItem(key);
      return null;
    }

    if (status === 'expired' || status === 'cancelled') {
      await AsyncStorage.removeItem(key);
      return null;
    }

    return {
      bookingId: parsed.bookingId,
      bookingRef: parsed.bookingRef ?? null,
      totalAmount: parsed.totalAmount,
      status,
      paymentHoldExpiresAt,
    };
  } catch {
    await AsyncStorage.removeItem(key);
    return null;
  }
}

export async function saveBooking(
  key: string,
  booking: SavedBooking,
): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(booking));
}
