import { Platform } from 'react-native';
import {
  createRazorpayMobileSession,
  getBookingById,
  getRazorpayPaymentStatus,
  type Booking,
  type RazorpayPaymentStatus,
} from '@workspace/api-client-react';

export type MobilePaymentSession = {
  token: string;
  expiresAt: string;
};

export const MOBILE_PAYMENT_CALLBACK_URI = 'staybest://payment-result';

/**
 * Payment pages must always be opened on the same origin used by the API.
 * There is intentionally no production fallback here: a missing domain is a
 * configuration error rather than a reason to send a capability to an
 * unknown host.
 */
export function getTrustedApiOrigin(): string {
  const configuredDomain = process.env.EXPO_PUBLIC_DOMAIN?.trim();
  if (!configuredDomain) {
    throw new Error('Payment is unavailable because the StayBest API domain is not configured.');
  }

  if (/^https?:\/\//i.test(configuredDomain)) {
    return configuredDomain.replace(/\/+$/, '');
  }

  return `https://${configuredDomain.replace(/\/+$/, '')}`;
}

/**
 * Requests a short-lived, one-time capability. The generated API client adds
 * the current Clerk token to the authenticated request; that token is never
 * put in the hosted payment URL.
 */
export async function createMobilePaymentSession(
  bookingId: number,
): Promise<MobilePaymentSession> {
  // Fail before making a request when the app has no trusted API origin.
  getTrustedApiOrigin();
  const payload = await createRazorpayMobileSession(bookingId);
  if (
    !payload ||
    typeof payload.token !== 'string' ||
    !payload.token
  ) {
    throw new Error('The payment session response was invalid. Please try again.');
  }

  const expiresAt = payload.expiresAt;
  if (typeof expiresAt !== 'string' || !expiresAt) {
    throw new Error('The payment session has no valid expiry. Please try again.');
  }

  return {
    token: payload.token,
    expiresAt,
  };
}

/**
 * The capability is the only value placed in the URL, and it is kept in the
 * fragment so it is not sent as an HTTP request parameter.
 */
export function getHostedPaymentUrl(token: string): string {
  return `${getTrustedApiOrigin()}/mobile-payment#token=${encodeURIComponent(token)}`;
}

export async function refreshCanonicalPayment(
  bookingId: number,
): Promise<{ booking: Booking; payment: RazorpayPaymentStatus }> {
  const [booking, payment] = await Promise.all([
    getBookingById(bookingId),
    getRazorpayPaymentStatus(bookingId),
  ]);
  return { booking, payment };
}

export function isTerminalPaymentStatus(
  status: string | null | undefined,
): boolean {
  return (
    status === 'paid' ||
    status === 'failed' ||
    status === 'refund_required'
  );
}

/**
 * Uses a popup/new tab in Expo web, while native uses the system browser.
 * No URL contents are inspected after opening: payment truth comes from the
 * authenticated status endpoint.
 */
export async function openHostedPayment(url: string): Promise<void> {
  if (Platform.OS === 'web') {
    const popup = window.open(url, '_blank', 'noopener,noreferrer');
    if (!popup) {
      throw new Error('Allow pop-ups to continue with online payment.');
    }
    return;
  }

  const WebBrowser = await import('expo-web-browser');
  await WebBrowser.openBrowserAsync(url);
}
