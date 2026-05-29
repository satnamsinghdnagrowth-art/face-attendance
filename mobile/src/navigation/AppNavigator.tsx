import React, { useEffect, useRef } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAppDispatch, useAppSelector } from '@/store';
import { initializeAuthThunk } from '@/store/slices/auth.slice';
import { AuthNavigator } from './AuthNavigator';
import { StudentNavigator } from './StudentNavigator';
import { TeacherNavigator } from './TeacherNavigator';
import { AdminNavigator } from './AdminNavigator';
import { ExamNavigator } from './ExamNavigator';
import { InvigilatorNavigator } from './InvigilatorNavigator';
import SplashScreen from '@/screens/auth/SplashScreen';
import { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export const AppNavigator: React.FC = () => {
  const dispatch = useAppDispatch();
  const { isAuthenticated, isInitialized, user } = useAppSelector((state) => state.auth);

  // Guard against double-dispatch on re-renders. useRef persists across renders
  // without causing them, unlike useState.
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      dispatch(initializeAuthThunk());
    }
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
      ) : user.role === 'chief_examiner' ? (
        <Stack.Screen name="Exam" component={ExamNavigator} />
      ) : user.role === 'hall_invigilator' ? (
        <Stack.Screen name="Invigilator" component={InvigilatorNavigator} />
      ) : (
        // admin / super_admin
        <Stack.Screen name="Admin" component={AdminNavigator} />
      )}
    </Stack.Navigator>
  );
};
