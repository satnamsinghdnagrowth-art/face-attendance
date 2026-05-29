import { useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { apiClient } from '@/api/client';

interface PushNotificationState {
  token: string | null;
  hasPermission: boolean;
}

// Configure the global notification handler once at module level.
// Include all required fields for the current expo-notifications version.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function usePushNotifications(): PushNotificationState {
  const [state, setState] = useState<PushNotificationState>({
    token: null,
    hasPermission: false,
  });

  const notificationListenerRef = useRef<Notifications.EventSubscription | null>(null);
  const responseListenerRef = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function registerForPushNotifications(): Promise<void> {
      try {
        // Android requires a notification channel
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
          });
        }

        // Request permissions
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        const hasPermission = finalStatus === 'granted';

        if (!hasPermission) {
          if (!cancelled) setState({ token: null, hasPermission: false });
          return;
        }

        // Get the Expo push token
        const expoPushToken = await Notifications.getExpoPushTokenAsync();

        if (cancelled) return;

        // Register token with the backend
        try {
          await apiClient.post('/v2/exams/push/register', { token: expoPushToken.data });
        } catch (err) {
          // Non-fatal — token may already be registered or backend unreachable
          console.warn('[usePushNotifications] Failed to register push token with backend:', err);
        }

        if (!cancelled) {
          setState({ token: expoPushToken.data, hasPermission: true });
        }
      } catch (err) {
        // Never throw — gracefully degrade
        console.warn('[usePushNotifications] Push registration error:', err);
        if (!cancelled) setState({ token: null, hasPermission: false });
      }
    }

    registerForPushNotifications();

    // Attach notification event listeners
    notificationListenerRef.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log('[usePushNotifications] Notification received:', notification.request.identifier);
      }
    );

    responseListenerRef.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        console.log('[usePushNotifications] Notification tapped:', response.notification.request.identifier);
      }
    );

    return () => {
      cancelled = true;
      notificationListenerRef.current?.remove();
      responseListenerRef.current?.remove();
    };
  }, []);

  return state;
}
