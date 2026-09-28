type AnalyticsData = Record<string, string | number | boolean>;

declare global {
  interface Window {
    /**
     * Injected by Replit's deployment proxy for published website artifacts
     * when analytics is enabled in Publishing settings.
     */
    umami?: {
      track(name: string, data?: AnalyticsData): void;
    };
  }
}

export function trackEvent(name: string, data?: AnalyticsData): void {
  if (typeof window === "undefined") return;

  try {
    window.umami?.track(name, data);
  } catch {
    // Analytics must never interrupt the guest experience.
  }
}