import { Platform, Alert } from 'react-native';
import { Camera } from 'expo-camera';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as ImagePicker from 'expo-image-picker';

export const requestCameraPermission = async (): Promise<boolean> => {
  const { status } = await Camera.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert(
      'Camera Permission Required',
      'ExamGuard needs camera access for face identity verification. Please enable it in your device settings.',
      [{ text: 'OK' }]
    );
    return false;
  }
  return true;
};

export const requestLocationPermission = async (): Promise<boolean> => {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert(
      'Location Permission',
      'Location access helps verify attendance at the correct venue. You can skip this.',
      [{ text: 'OK' }]
    );
    return false;
  }
  return true;
};

export const requestNotificationPermission = async (): Promise<boolean> => {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('Notification permission not granted');
    return false;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('examguard_alerts', {
      name: 'ExamGuard Alerts',
      description: 'Critical exam alerts, proxy detections, and session updates',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2563EB',
      sound: 'default',
    });
  }

  return true;
};

export const requestPhotoLibraryPermission = async (): Promise<boolean> => {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert(
      'Photo Library Permission',
      'Please allow access to your photo library to upload a profile picture.',
      [{ text: 'OK' }]
    );
    return false;
  }
  return true;
};

export const checkAllPermissions = async (): Promise<{
  camera: boolean;
  location: boolean;
  notifications: boolean;
}> => {
  const [cameraStatus, locationStatus, notifStatus] = await Promise.all([
    Camera.getCameraPermissionsAsync(),
    Location.getForegroundPermissionsAsync(),
    Notifications.getPermissionsAsync(),
  ]);

  return {
    camera: cameraStatus.status === 'granted',
    location: locationStatus.status === 'granted',
    notifications: notifStatus.status === 'granted',
  };
};
