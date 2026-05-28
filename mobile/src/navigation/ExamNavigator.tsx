import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';

import ExamListScreen from '@/screens/exam/ExamListScreen';
import ChiefExaminerDashboard from '@/screens/exam/ChiefExaminerDashboard';
import AlertFeedScreen from '@/screens/exam/AlertFeedScreen';
import FlaggedCasesScreen from '@/screens/exam/FlaggedCasesScreen';
import ExamDetailScreen from '@/screens/exam/ExamDetailScreen';
import CreateExamScreen from '@/screens/exam/CreateExamScreen';
import ComplianceReportScreen from '@/screens/exam/ComplianceReportScreen';

export type ExamTabParamList = {
  ExamList: undefined;
  ExamLive: undefined;
  ExamAlerts: undefined;
  ExamReview: undefined;
};

export type ExamStackParamList = {
  ExamTabs: undefined;
  ExamDetail: { examId: string };
  CreateExam: undefined;
  ComplianceReport: undefined;
};

const Tab = createBottomTabNavigator<ExamTabParamList>();
const Stack = createNativeStackNavigator<ExamStackParamList>();

const ExamTabs: React.FC = () => {
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
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'list';

          switch (route.name) {
            case 'ExamList':
              iconName = focused ? 'list' : 'list-outline';
              break;
            case 'ExamLive':
              iconName = focused ? 'pulse' : 'pulse-outline';
              break;
            case 'ExamAlerts':
              iconName = focused ? 'notifications' : 'notifications-outline';
              break;
            case 'ExamReview':
              iconName = focused ? 'eye' : 'eye-outline';
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
        name="ExamList"
        component={ExamListScreen}
        options={{ tabBarLabel: 'Exams' }}
      />
      <Tab.Screen
        name="ExamLive"
        component={ChiefExaminerDashboard}
        options={{ tabBarLabel: 'Live' }}
      />
      <Tab.Screen
        name="ExamAlerts"
        component={AlertFeedScreen}
        options={{ tabBarLabel: 'Alerts' }}
      />
      <Tab.Screen
        name="ExamReview"
        component={FlaggedCasesScreen}
        options={{ tabBarLabel: 'Review' }}
      />
    </Tab.Navigator>
  );
};

export const ExamNavigator: React.FC = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ExamTabs" component={ExamTabs} />
      <Stack.Screen name="ExamDetail" component={ExamDetailScreen} />
      <Stack.Screen name="CreateExam" component={CreateExamScreen} />
      <Stack.Screen name="ComplianceReport" component={ComplianceReportScreen} />
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
    backgroundColor: Colors.primaryFaded,
  },
});
