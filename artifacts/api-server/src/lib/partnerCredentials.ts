// New self-registered partners keep passwords only in Clerk, never in our DB.
// Legacy admin-created vendor credentials retain their existing behavior.
export const ONE_TIME_PARTNER_PASSWORD = "clerk-managed:one-time";
