import React, { useEffect } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAppDispatch, useAppSelector } from '@/store';
import { initializeAuthThunk } from '@/store/slices/auth.slice';
import { AuthNavigator } from './AuthNavigator';
import { StudentNavigator } from './StudentNavigator';
import { TeacherNavigator } from './TeacherNavigator';
import { AdminNavigator } from './AdminNavigator';
import SplashScreen from '@/screens/auth/SplashScreen';
import { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export const AppNavigator: React.FC = () => {
  const dispatch = useAppDispatch();
  const { isAuthenticated, isInitialized, user } = useAppSelector((state) => state.auth);

  useEffect(() => {
    dispatch(initializeAuthThunk());
  }, [dispatch]);

  if (!isInitialized) {
    return <SplashScreen />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!isAuthenticated || !user ? (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      ) : user.role === 'student' ? (
        <Stack.Screen name="Student" component={StudentNavigator} />
      ) : user.role === 'teacher' ? (
        <Stack.Screen name="Teacher" component={TeacherNavigator} />
      ) : (
        <Stack.Screen name="Admin" component={AdminNavigator} />
      )}
    </Stack.Navigator>
  );
};
