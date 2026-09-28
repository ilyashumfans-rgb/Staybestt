export type NotificationResponse = {
  notification: {
    request: {
      content: {
        data?: Record<string, unknown>;
      };
    };
  };
};

export type NotificationSubscription = {
  remove(): void;
};

export function configureForegroundNotifications(): void;

export function addNotificationResponseListener(
  listener: (response: NotificationResponse) => void,
): NotificationSubscription;

export function getLastNotificationResponse(): Promise<NotificationResponse | null>;

export function getPushToken(): Promise<{
  token: string | null;
  error: string | null;
}>;