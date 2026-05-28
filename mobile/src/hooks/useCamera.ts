import { useState, useRef, useCallback } from 'react';
import { CameraView, useCameraPermissions, CameraCapturedPicture } from 'expo-camera';

export const useCamera = () => {
  const [permission, requestPermission] = useCameraPermissions();
  const [isCapturing, setIsCapturing] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  const hasPermission = permission?.granted ?? false;

  const requestCameraPermission = useCallback(async (): Promise<boolean> => {
    const result = await requestPermission();
    return result.granted;
  }, [requestPermission]);

  const capturePhoto = useCallback(async (): Promise<string | null> => {
    if (!cameraRef.current || isCapturing) return null;

    try {
      setIsCapturing(true);
      const photo: CameraCapturedPicture | undefined = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        base64: false,
        exif: false,
        skipProcessing: false,
      });
      return photo?.uri || null;
    } catch (error) {
      console.error('[useCamera] Capture error:', error);
      return null;
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing]);

  const captureHighQuality = useCallback(async (): Promise<string | null> => {
    if (!cameraRef.current || isCapturing) return null;

    try {
      setIsCapturing(true);
      const photo: CameraCapturedPicture | undefined = await cameraRef.current.takePictureAsync({
        quality: 1.0,
        base64: false,
        exif: false,
        skipProcessing: false,
      });
      return photo?.uri || null;
    } catch (error) {
      console.error('[useCamera] High quality capture error:', error);
      return null;
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing]);

  return {
    hasPermission,
    permission,
    requestCameraPermission,
    capturePhoto,
    captureHighQuality,
    cameraRef,
    isCapturing,
  };
};
