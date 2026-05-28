import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';
import { loadActiveSessionsThunk } from '@/store/slices/attendance.slice';
import { Avatar } from '@/components/common/Avatar';
import { Colors } from '@/constants/colors';
import { BorderRadius, FontSizes, FontWeights, Shadow, Spacing } from '@/constants/theme';
import { getGreeting, formatTime, formatDate } from '@/utils/helpers';
import { attendanceApi } from '@/api/attendance.api';
import { AttendanceSession } from '@/types';

const { width } = Dimensions.get('window');

const TeacherDashboardScreen: React.FC = () => {
  const navigation = useNavigation();
  const dispatch = useAppDispatch();
  const { user } = useAuth();
  const { activeSessions, currentSession } = useAppSelector((state) => state.attendance);
  const [refreshing, setRefreshing] = useState(false);
  const [todayStats, setTodayStats] = useState({
    totalStudents: 0,
    attendanceRate: 0,
    sessionsToday: 0,
  });
  const [recentSessions, setRecentSessions] = useState<AttendanceSession[]>([]);

  const loadData = useCallback(async () => {
    await dispatch(loadActiveSessionsThunk());

    // Load recent sessions
    try {
      const today = new Date().toISOString().split('T')[0];
      const response = await attendanceApi.getClassAttendance({ class_id: '', date: today });
      setTodayStats({
        totalStudents: response.data.data.total_students || 0,
        attendanceRate: response.data.data.percentage || 0,
        sessionsToday: activeSessions.length,
      });
    } catch {
      // ignore
    }
  }, [dispatch, activeSessions.length]);

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const hasActiveSession = currentSession?.status === 'active' || activeSessions.length > 0;
  const activeSession = currentSession || activeSessions[0];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.secondary} />
        }
      >
        {/* Header */}
        <LinearGradient
          colors={[Colors.secondaryDark, Colors.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.greeting}>{getGreeting()},</Text>
              <Text style={styles.userName} numberOfLines={1}>
                {user?.name || 'Teacher'}
              </Text>
              <Text style={styles.roleText}>
                <Ionicons name="person-outline" size={13} color="rgba(255,255,255,0.75)" />
                {' '}Teacher
              </Text>
            </View>
            <Avatar name={user?.name || 'T'} photoUrl={user?.photo_url} size={52} />
          </View>

          {/* Quick stats */}
          <View style={styles.statsRow}>
            {[
              { label: 'Students', value: todayStats.totalStudents || '--', icon: 'people-outline' },
              { label: 'Attendance', value: `${Math.round(todayStats.attendanceRate)}%`, icon: 'bar-chart-outline' },
              { label: 'Sessions', value: activeSessions.length || '--', icon: 'play-circle-outline' },
            ].map(({ label, value, icon }) => (
              <View key={label} style={styles.statBox}>
                <Ionicons name={icon as never} size={18} color="rgba(255,255,255,0.8)" />
                <Text style={styles.statValue}>{value}</Text>
                <Text style={styles.statLabel}>{label}</Text>
              </View>
            ))}
          </View>
        </LinearGradient>

        <View style={styles.content}>
          {/* Active session banner */}
          {hasActiveSession && activeSession && (
            <TouchableOpacity
              style={styles.activeSessionBanner}
              onPress={() =>
                navigation.navigate('LiveScan' as never, { sessionId: activeSession.id } as never)
              }
            >
              <View style={styles.activeSessionLeft}>
                <View style={styles.livePulse}>
                  <View style={styles.liveDot} />
                </View>
                <View>
                  <Text style={styles.activeSessionTitle}>Active Session</Text>
                  <Text style={styles.activeSessionSubtitle}>
                    {activeSession.subject_name || 'Subject'} •{' '}
                    {activeSession.class_name || 'Class'}
                  </Text>
                  <Text style={styles.activeSessionTime}>
                    Started {formatTime(activeSession.start_time)}
                  </Text>
                </View>
              </View>
              <View style={styles.activeSessionRight}>
                <Text style={styles.presentCount}>
                  {activeSession.present_count || 0}
                </Text>
                <Text style={styles.presentLabel}>present</Text>
                <Ionicons name="chevron-forward" size={20} color={Colors.success} />
              </View>
            </TouchableOpacity>
          )}

          {/* Quick actions */}
          <View style={styles.quickActions}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <View style={styles.actionsGrid}>
              <TouchableOpacity
                style={[styles.actionCard, { backgroundColor: Colors.secondaryFaded }]}
                onPress={() => navigation.navigate('StartAttendance' as never)}
              >
                <View style={[styles.actionIconWrapper, { backgroundColor: Colors.secondary + '20' }]}>
                  <Ionicons name="play-circle-outline" size={28} color={Colors.secondary} />
                </View>
                <Text style={[styles.actionTitle, { color: Colors.secondary }]}>
                  Start Attendance
                </Text>
                <Text style={styles.actionDesc}>Begin new session</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionCard, { backgroundColor: Colors.infoFaded }]}
                onPress={() =>
                  navigation.navigate(
                    'LiveScan' as never,
                    { sessionId: activeSession?.id || '' } as never
                  )
                }
              >
                <View style={[styles.actionIconWrapper, { backgroundColor: Colors.info + '20' }]}>
                  <Ionicons name="scan-outline" size={28} color={Colors.info} />
                </View>
                <Text style={[styles.actionTitle, { color: Colors.info }]}>Live Scan</Text>
                <Text style={styles.actionDesc}>Real-time recognition</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionCard, { backgroundColor: Colors.primaryFaded }]}
                onPress={() => navigation.navigate('Reports' as never)}
              >
                <View style={[styles.actionIconWrapper, { backgroundColor: Colors.primary + '20' }]}>
                  <Ionicons name="bar-chart-outline" size={28} color={Colors.primary} />
                </View>
                <Text style={[styles.actionTitle, { color: Colors.primary }]}>Reports</Text>
                <Text style={styles.actionDesc}>View analytics</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Today's info */}
          <View style={styles.todayCard}>
            <Text style={styles.sectionTitle}>Today</Text>
            <Text style={styles.dateText}>{formatDate(new Date().toISOString())}</Text>

            {activeSessions.length === 0 && !currentSession ? (
              <View style={styles.noSessionsContainer}>
                <Ionicons name="calendar-outline" size={36} color={Colors.textMuted} />
                <Text style={styles.noSessionsText}>No active sessions</Text>
                <TouchableOpacity
                  style={styles.startButton}
                  onPress={() => navigation.navigate('StartAttendance' as never)}
                >
                  <Ionicons name="add-circle-outline" size={18} color={Colors.secondary} />
                  <Text style={styles.startButtonText}>Start New Session</Text>
                </TouchableOpacity>
              </View>
            ) : (
              activeSessions.map((session) => (
                <View key={session.id} style={styles.sessionItem}>
                  <View style={styles.sessionDot} />
                  <View style={styles.sessionInfo}>
                    <Text style={styles.sessionSubject}>{session.subject_name || 'Subject'}</Text>
                    <Text style={styles.sessionClass}>{session.class_name || 'Class'}</Text>
                    <Text style={styles.sessionTime}>
                      {formatTime(session.start_time)} — {session.end_time ? formatTime(session.end_time) : 'Ongoing'}
                    </Text>
                  </View>
                  <View style={styles.sessionStats}>
                    <Text style={styles.sessionPresent}>{session.present_count || 0}</Text>
                    <Text style={styles.sessionPresent1}>/{session.total_students || 0}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('StartAttendance' as never)}
      >
        <LinearGradient
          colors={[Colors.secondary, Colors.secondaryDark]}
          style={styles.fabGradient}
        >
          <Ionicons name="add" size={28} color="white" />
        </LinearGradient>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl + 10,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.lg,
  },
  greeting: { fontSize: FontSizes.md, color: 'rgba(255,255,255,0.8)' },
  userName: { fontSize: FontSizes.xxl, fontWeight: FontWeights.bold, color: 'white', maxWidth: width * 0.6 },
  roleText: { fontSize: FontSizes.sm, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  statBox: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontSize: FontSizes.xl, fontWeight: FontWeights.bold, color: 'white' },
  statLabel: { fontSize: FontSizes.xs, color: 'rgba(255,255,255,0.75)' },
  content: { padding: Spacing.md, marginTop: -20 },
  activeSessionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.successFaded,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.success + '40',
    ...Shadow.sm,
  },
  activeSessionLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  livePulse: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.success + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.success,
  },
  activeSessionTitle: { fontSize: FontSizes.md, fontWeight: FontWeights.bold, color: Colors.success },
  activeSessionSubtitle: { fontSize: FontSizes.sm, color: Colors.textSecondary, marginTop: 2 },
  activeSessionTime: { fontSize: FontSizes.xs, color: Colors.textMuted, marginTop: 1 },
  activeSessionRight: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  presentCount: { fontSize: FontSizes.xxl, fontWeight: FontWeights.extrabold, color: Colors.success },
  presentLabel: { fontSize: FontSizes.xs, color: Colors.textSecondary },
  quickActions: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.sm,
  },
  sectionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  actionsGrid: { flexDirection: 'row', gap: Spacing.sm },
  actionCard: {
    flex: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    gap: 6,
  },
  actionIconWrapper: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTitle: { fontSize: FontSizes.sm, fontWeight: FontWeights.bold, textAlign: 'center' },
  actionDesc: { fontSize: FontSizes.xs, color: Colors.textSecondary, textAlign: 'center' },
  todayCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.sm,
  },
  dateText: { fontSize: FontSizes.sm, color: Colors.textSecondary, marginTop: -Spacing.sm, marginBottom: Spacing.md },
  noSessionsContainer: { alignItems: 'center', paddingVertical: Spacing.lg, gap: Spacing.sm },
  noSessionsText: { fontSize: FontSizes.md, color: Colors.textMuted },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.sm,
    backgroundColor: Colors.secondaryFaded,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
  },
  startButtonText: { fontSize: FontSizes.sm, fontWeight: FontWeights.semibold, color: Colors.secondary },
  sessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    gap: Spacing.sm,
  },
  sessionDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success, flexShrink: 0 },
  sessionInfo: { flex: 1 },
  sessionSubject: { fontSize: FontSizes.md, fontWeight: FontWeights.semibold, color: Colors.textPrimary },
  sessionClass: { fontSize: FontSizes.sm, color: Colors.textSecondary },
  sessionTime: { fontSize: FontSizes.xs, color: Colors.textMuted },
  sessionStats: { flexDirection: 'row', alignItems: 'baseline' },
  sessionPresent: { fontSize: FontSizes.xl, fontWeight: FontWeights.bold, color: Colors.success },
  sessionPresent1: { fontSize: FontSizes.sm, color: Colors.textSecondary },
  fab: {
    position: 'absolute',
    bottom: 80,
    right: 20,
    borderRadius: 32,
    ...Shadow.xl,
  },
  fabGradient: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default TeacherDashboardScreen;
