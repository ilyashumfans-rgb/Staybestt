export type NotificationResponse = {
  notification: {
    request: {
      content: {
        data?: Record<string, unknown>;
      };
    };
  };
};

const noOpSubscription = { remove() {} };

export function configureForegroundNotifications() {}

export function addNotificationResponseListener(
  _listener: (response: NotificationResponse) => void,
) {
  return noOpSubscription;
}

export async function getLastNotificationResponse() {
  return null;
}

export async function getPushToken() {
  return {
    token: null,
    error: 'Push notifications require the StayBest mobile app',
  };
}