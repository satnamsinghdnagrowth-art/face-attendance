import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';

import HallSessionScreen from '@/screens/exam/HallSessionScreen';
import EntryVerificationScreen from '@/screens/exam/EntryVerificationScreen';
import StudentListScreen from '@/screens/exam/StudentListScreen';

export type InvigilatorTabParamList = {
  MyHall: undefined;
  ScanEntry: undefined;
  Students: undefined;
};

export type InvigilatorStackParamList = {
  InvigilatorTabs: undefined;
  EntryVerification: {
    sessionId: string;
    examId: string;
    hallId: string;
    studentId?: string;
    studentName?: string;
    seatNumber?: string;
    rollNumber?: string;
  };
  ReVerify: {
    sessionId: string;
    examId: string;
    hallId: string;
    studentId?: string;
    studentName?: string;
    seatNumber?: string;
    rollNumber?: string;
  };
  HallSession: { examId: string; hallId: string };
};

const Tab = createBottomTabNavigator<InvigilatorTabParamList>();
const Stack = createNativeStackNavigator<InvigilatorStackParamList>();

const InvigilatorTabs: React.FC = () => {
  const insets = useSafeAreaInsets();
  const paddingBottom = Math.max(insets.bottom, 8);
  const tabBarHeight = 52 + paddingBottom;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          height: tabBarHeight,
          paddingBottom,
          paddingTop: 8,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
        },
        tabBarActiveTintColor: Colors.warning,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'school';

          switch (route.name) {
            case 'MyHall':
              iconName = focused ? 'school' : 'school-outline';
              break;
            case 'ScanEntry':
              iconName = focused ? 'scan' : 'scan-outline';
              break;
            case 'Students':
              iconName = focused ? 'people' : 'people-outline';
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
        name="MyHall"
        component={HallSessionScreen}
        options={{ tabBarLabel: 'My Hall' }}
      />
      <Tab.Screen
        name="ScanEntry"
        component={StudentListScreen}
        options={{ tabBarLabel: 'Scan Entry' }}
      />
      <Tab.Screen
        name="Students"
        component={StudentListScreen}
        options={{ tabBarLabel: 'Students' }}
      />
    </Tab.Navigator>
  );
};

export const InvigilatorNavigator: React.FC = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="InvigilatorTabs" component={InvigilatorTabs} />
      <Stack.Screen name="EntryVerification" component={EntryVerificationScreen} />
      <Stack.Screen name="ReVerify" component={EntryVerificationScreen} />
      <Stack.Screen name="HallSession" component={HallSessionScreen} />
    </Stack.Navigator>
  );
};

const styles = StyleSheet.create({
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
    backgroundColor: Colors.warningFaded,
  },
});
