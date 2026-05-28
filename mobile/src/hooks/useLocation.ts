import { useState, useCallback } from 'react';
import * as Location from 'expo-location';

interface LocationData {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number;
}

export const useLocation = () => {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestLocationPermission = useCallback(async (): Promise<boolean> => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  }, []);

  const getLocation = useCallback(async (): Promise<LocationData | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        const { status: newStatus } = await Location.requestForegroundPermissionsAsync();
        if (newStatus !== 'granted') {
          setError('Location permission denied');
          return null;
        }
      }

      const locationResult = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const data: LocationData = {
        latitude: locationResult.coords.latitude,
        longitude: locationResult.coords.longitude,
        accuracy: locationResult.coords.accuracy || undefined,
        altitude: locationResult.coords.altitude || undefined,
      };

      setLocation(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get location';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getLocationAddress = useCallback(
    async (lat: number, lng: number): Promise<string | null> => {
      try {
        const addresses = await Location.reverseGeocodeAsync({
          latitude: lat,
          longitude: lng,
        });
        if (addresses.length > 0) {
          const addr = addresses[0];
          return [addr.name, addr.street, addr.city, addr.region]
            .filter(Boolean)
            .join(', ');
        }
        return null;
      } catch {
        return null;
      }
    },
    []
  );

  return {
    location,
    isLoading,
    error,
    getLocation,
    requestLocationPermission,
    getLocationAddress,
  };
};
