import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, Platform } from 'react-native';
import { TeacherTabParamList, TeacherStackParamList } from './types';
import { Colors } from '@/constants/colors';

import TeacherDashboardScreen from '@/screens/teacher/DashboardScreen';
import StartAttendanceScreen from '@/screens/teacher/StartAttendanceScreen';
import LiveScanScreen from '@/screens/teacher/LiveScanScreen';
import ReportsScreen from '@/screens/teacher/ReportsScreen';
import ProfileScreen from '@/screens/student/ProfileScreen';
import FaceEnrollmentScreen from '@/screens/student/FaceEnrollmentScreen';
import AttendanceReviewScreen from '@/screens/teacher/AttendanceReviewScreen';

const Tab = createBottomTabNavigator<TeacherTabParamList>();
const Stack = createNativeStackNavigator<TeacherStackParamList>();

const TeacherTabs: React.FC = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: Colors.secondary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'home';

          switch (route.name) {
            case 'Dashboard':
              iconName = focused ? 'home' : 'home-outline';
              break;
            case 'StartAttendance':
              iconName = focused ? 'play-circle' : 'play-circle-outline';
              break;
            case 'LiveScan':
              iconName = focused ? 'scan' : 'scan-outline';
              break;
            case 'FaceEnrollment':
              iconName = focused ? 'camera' : 'camera-outline';
              break;
            case 'Reports':
              iconName = focused ? 'bar-chart' : 'bar-chart-outline';
              break;
            case 'Profile':
              iconName = focused ? 'person' : 'person-outline';
              break;
          }

          return (
            <View style={[styles.iconContainer, focused && styles.iconContainerActive]}>
              <Ionicons name={iconName} size={size} color={color} />
            </View>
          );
        },
      })}
    >
      <Tab.Screen
        name="Dashboard"
        component={TeacherDashboardScreen}
        options={{ tabBarLabel: 'Home' }}
      />
      <Tab.Screen
        name="StartAttendance"
        component={StartAttendanceScreen}
        options={{ tabBarLabel: 'Start' }}
      />
      <Tab.Screen
        name="LiveScan"
        component={LiveScanScreen}
        options={{ tabBarLabel: 'Live Scan' }}
        initialParams={{ sessionId: '' }}
      />
      <Tab.Screen
        name="FaceEnrollment"
        component={FaceEnrollmentScreen}
        options={{ tabBarLabel: 'Face ID' }}
      />
      <Tab.Screen
        name="Reports"
        component={ReportsScreen}
        options={{ tabBarLabel: 'Reports' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarLabel: 'Profile' }}
      />
    </Tab.Navigator>
  );
};

export const TeacherNavigator: React.FC = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="TeacherTabs" component={TeacherTabs} />
      <Stack.Screen
        name="AttendanceReview"
        component={AttendanceReviewScreen}
        options={{
          headerShown: true,
          title: 'Review Attendance',
          headerTintColor: Colors.secondary,
        }}
      />
      <Stack.Screen
        name="LiveScan"
        component={LiveScanScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.surface,
    borderTopColor: Colors.border,
    borderTopWidth: 1,
    height: Platform.OS === 'ios' ? 85 : 65,
    paddingBottom: Platform.OS === 'ios' ? 25 : 10,
    paddingTop: 8,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
    borderRadius: 8,
  },
  iconContainerActive: {
    backgroundColor: Colors.secondaryFaded,
  },
});
