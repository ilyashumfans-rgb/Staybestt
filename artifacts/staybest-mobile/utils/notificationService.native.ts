import * as Notifications from 'expo-notifications';

export type NotificationResponse = Notifications.NotificationResponse;

export function configureForegroundNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export function addNotificationResponseListener(
  listener: (response: NotificationResponse) => void,
) {
  return Notifications.addNotificationResponseReceivedListener(listener);
}

export function getLastNotificationResponse() {
  return Notifications.getLastNotificationResponseAsync();
}

export async function getPushToken() {
  const permission = await Notifications.getPermissionsAsync();
  const result = permission.granted
    ? permission
    : await Notifications.requestPermissionsAsync();

  if (!result.granted) {
    return {
      token: null,
      error: result.canAskAgain
        ? 'Notification permission was not granted'
        : 'Enable notifications in device Settings',
    };
  }

  return {
    token: (await Notifications.getExpoPushTokenAsync()).data,
    error: null,
  };
}