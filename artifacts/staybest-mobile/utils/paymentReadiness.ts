/**
 * Client-side payment guardrails.
 *
 * The API owns the final decision.  Keeping this small adapter tolerant of
 * older generated clients lets the mobile bundle stay usable while the
 * readiness contract is regenerated (the new fields are paymentAllowed and
 * message).
 */
export type PaymentReadinessPayload = {
  configured?: boolean;
  mode?: string | null;
  providerStatus?: string;
  paymentAllowed?: boolean;
  message?: string | null;
};

export const PREVIEW_LIVE_PAYMENT_MESSAGE =
  'This preview cannot accept live payments. Use the published app or test keys.';

export function isProductionBuild(): boolean {
  // Expo defines __DEV__ for native and web development builds.  The
  // NODE_ENV fallback also keeps this helper deterministic in tests.
  if (typeof __DEV__ === 'boolean') return !__DEV__;
  return process.env.NODE_ENV === 'production';
}

export function getPaymentReadiness(
  value: unknown,
): PaymentReadinessPayload & { allowed: boolean; userMessage: string } {
  const readiness = (value && typeof value === 'object'
    ? value
    : {}) as PaymentReadinessPayload;

  if (readiness.mode === 'live' && !isProductionBuild()) {
    return {
      ...readiness,
      allowed: false,
      userMessage: PREVIEW_LIVE_PAYMENT_MESSAGE,
    };
  }

  if (typeof readiness.paymentAllowed === 'boolean') {
    return {
      ...readiness,
      allowed: readiness.paymentAllowed,
      userMessage:
        readiness.message ||
        (readiness.paymentAllowed
          ? ''
          : 'Online payment is temporarily unavailable. Please try again later.'),
    };
  }

  const allowed =
    readiness.configured === true && readiness.providerStatus === 'ok';
  return {
    ...readiness,
    allowed,
    userMessage: allowed
      ? ''
      : readiness.message ||
        'Online payment is temporarily unavailable. Please try again later.',
  };
}

export function getFriendlyPaymentError(
  error: unknown,
  fallback = 'Online payment could not be started. Please try again.',
): string {
  const message = error instanceof Error ? error.message : '';
  // Never surface a provider response or a raw HTTP status to guests.
  if (!message || /\bHTTP\s*5\d\d\b|\b5\d\d\b/i.test(message)) {
    return fallback;
  }
  return message;
}