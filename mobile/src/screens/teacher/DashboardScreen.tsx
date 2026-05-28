import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { AttendanceSession } from '@/types';

const { width } = Dimensions.get('window');

const TeacherDashboardScreen: React.FC = () => {
  const navigation = useNavigation();
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { activeSessions, currentSession, isSessionLoading } = useAppSelector((state) => state.attendance);
  const [refreshing, setRefreshing] = useState(false);
  const [todayStats, setTodayStats] = useState({
    totalStudents: 0,
    attendanceRate: 0,
    sessionsToday: 0,
  });

  // Tab bar height: 52px content + bottom inset (mirrors navigator config)
  const tabBarHeight = 52 + Math.max(insets.bottom, 8);
  const fabBottom = tabBarHeight + 16;

  const loadData = useCallback(async () => {
    await dispatch(loadActiveSessionsThunk());
  }, [dispatch]);

  // Recompute dashboard stats whenever active sessions change
  useEffect(() => {
    const totalStudents = activeSessions.reduce((sum, s) => sum + (s.total_students || 0), 0);
    const totalPresent = activeSessions.reduce((sum, s) => sum + (s.present_count || 0), 0);
    const attendanceRate = totalStudents > 0 ? (totalPresent / totalStudents) * 100 : 0;

    setTodayStats({
      totalStudents,
      attendanceRate,
      sessionsToday: activeSessions.length,
    });
  }, [activeSessions]);

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
  const hasStats = activeSessions.length > 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: fabBottom + 20 }}
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
            <View style={{ flex: 1, marginRight: Spacing.md }}>
              <Text style={styles.greeting}>{getGreeting()},</Text>
              <Text style={styles.userName} numberOfLines={1}>
                {user?.name || 'Teacher'}
              </Text>
              <View style={styles.rolePill}>
                <Ionicons name="school-outline" size={12} color="rgba(255,255,255,0.9)" />
                <Text style={styles.roleText}>Teacher</Text>
              </View>
            </View>
            <Avatar name={user?.name || 'T'} photoUrl={user?.photo_url} size={54} />
          </View>

          {/* Quick stats */}
          <View style={styles.statsRow}>
            {[
              {
                label: 'Enrolled',
                value: hasStats ? String(todayStats.totalStudents) : '--',
                icon: 'people-outline' as const,
              },
              {
                label: 'Present Rate',
                value: hasStats ? `${Math.round(todayStats.attendanceRate)}%` : '--',
                icon: 'bar-chart-outline' as const,
              },
              {
                label: 'Sessions',
                value: String(todayStats.sessionsToday),
                icon: 'play-circle-outline' as const,
              },
            ].map(({ label, value, icon }) => (
              <View key={label} style={styles.statBox}>
                <Ionicons name={icon} size={18} color="rgba(255,255,255,0.85)" />
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
              activeOpacity={0.85}
            >
              <View style={styles.activeSessionLeft}>
                <View style={styles.livePulseOuter}>
                  <View style={styles.liveDot} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.activeSessionLabel}>LIVE SESSION</Text>
                  <Text style={styles.activeSessionTitle} numberOfLines={1}>
                    {activeSession.subject_name || 'Subject'} · {activeSession.class_name || 'Class'}
                  </Text>
                  <Text style={styles.activeSessionTime}>
                    Started {formatTime(activeSession.start_time)}
                  </Text>
                </View>
              </View>
              <View style={styles.activeSessionRight}>
                <Text style={styles.presentCount}>{activeSession.present_count || 0}</Text>
                <Text style={styles.presentLabel}>present</Text>
                <Ionicons name="chevron-forward" size={18} color={Colors.success} style={{ marginLeft: 2 }} />
              </View>
            </TouchableOpacity>
          )}

          {/* Quick actions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <View style={styles.actionsGrid}>
              <TouchableOpacity
                style={[styles.actionCard, { backgroundColor: Colors.secondaryFaded }]}
                onPress={() => navigation.navigate('StartAttendance' as never)}
                activeOpacity={0.8}
              >
                <View style={[styles.actionIconWrapper, { backgroundColor: Colors.secondary + '25' }]}>
                  <Ionicons name="play-circle-outline" size={26} color={Colors.secondary} />
                </View>
                <Text style={[styles.actionTitle, { color: Colors.secondary }]}>Start</Text>
                <Text style={styles.actionDesc}>New session</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionCard, { backgroundColor: Colors.infoFaded }]}
                onPress={() =>
                  navigation.navigate(
                    'LiveScan' as never,
                    { sessionId: activeSession?.id || '' } as never
                  )
                }
                activeOpacity={0.8}
              >
                <View style={[styles.actionIconWrapper, { backgroundColor: Colors.info + '25' }]}>
                  <Ionicons name="scan-outline" size={26} color={Colors.info} />
                </View>
                <Text style={[styles.actionTitle, { color: Colors.info }]}>Scan</Text>
                <Text style={styles.actionDesc}>Face recognition</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionCard, { backgroundColor: Colors.primaryFaded }]}
                onPress={() => navigation.navigate('Reports' as never)}
                activeOpacity={0.8}
              >
                <View style={[styles.actionIconWrapper, { backgroundColor: Colors.primary + '25' }]}>
                  <Ionicons name="bar-chart-outline" size={26} color={Colors.primary} />
                </View>
                <Text style={[styles.actionTitle, { color: Colors.primary }]}>Reports</Text>
                <Text style={styles.actionDesc}>Analytics</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Today's sessions */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Today's Sessions</Text>
              <Text style={styles.dateText}>{formatDate(new Date().toISOString())}</Text>
            </View>

            {isSessionLoading && activeSessions.length === 0 ? (
              <View style={styles.loadingState}>
                <ActivityIndicator size="small" color={Colors.secondary} />
                <Text style={styles.loadingText}>Loading sessions...</Text>
              </View>
            ) : activeSessions.length === 0 && !currentSession ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconWrapper}>
                  <Ionicons name="calendar-outline" size={32} color={Colors.textMuted} />
                </View>
                <Text style={styles.emptyTitle}>No Active Sessions</Text>
                <Text style={styles.emptyDesc}>Tap the button below to start taking attendance</Text>
                <TouchableOpacity
                  style={styles.emptyAction}
                  onPress={() => navigation.navigate('StartAttendance' as never)}
                >
                  <Ionicons name="add-circle-outline" size={16} color={Colors.secondary} />
                  <Text style={styles.emptyActionText}>Start New Session</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.sessionsList}>
                {activeSessions.map((session, index) => (
                  <TouchableOpacity
                    key={session.id}
                    style={[
                      styles.sessionItem,
                      index === activeSessions.length - 1 && styles.sessionItemLast,
                    ]}
                    onPress={() =>
                      navigation.navigate('LiveScan' as never, { sessionId: session.id } as never)
                    }
                    activeOpacity={0.7}
                  >
                    <View style={styles.sessionStatusDot} />
                    <View style={styles.sessionInfo}>
                      <Text style={styles.sessionSubject}>
                        {session.subject_name || 'Subject'}
                      </Text>
                      <Text style={styles.sessionClass}>{session.class_name || 'Class'}</Text>
                      <Text style={styles.sessionTime}>
                        {formatTime(session.start_time)}
                        {session.end_time ? ` — ${formatTime(session.end_time)}` : ' · Ongoing'}
                      </Text>
                    </View>
                    <View style={styles.sessionStatsRight}>
                      <Text style={styles.sessionPresent}>{session.present_count || 0}</Text>
                      <Text style={styles.sessionTotal}>/{session.total_students || 0}</Text>
                      <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* FAB — positioned above tab bar */}
      <TouchableOpacity
        style={[styles.fab, { bottom: fabBottom }]}
        onPress={() => navigation.navigate('StartAttendance' as never)}
        activeOpacity={0.9}
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

  // Header
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl + 12,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  greeting: { fontSize: FontSizes.sm, color: 'rgba(255,255,255,0.8)' },
  userName: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: 'white',
    marginTop: 2,
  },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  roleText: { fontSize: FontSizes.xs, color: 'rgba(255,255,255,0.9)' },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  statBox: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontSize: FontSizes.xl, fontWeight: FontWeights.bold, color: 'white' },
  statLabel: { fontSize: FontSizes.xs, color: 'rgba(255,255,255,0.8)', textAlign: 'center' },

  // Content area
  content: { padding: Spacing.md, marginTop: -20 },

  // Active session banner
  activeSessionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.successFaded,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.success + '50',
    ...Shadow.sm,
  },
  activeSessionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  livePulseOuter: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.success + '25',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.success },
  activeSessionLabel: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    color: Colors.success,
    letterSpacing: 0.5,
  },
  activeSessionTitle: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.textPrimary,
    marginTop: 1,
  },
  activeSessionTime: { fontSize: FontSizes.xs, color: Colors.textMuted, marginTop: 1 },
  activeSessionRight: { alignItems: 'center', flexDirection: 'row', gap: 2, flexShrink: 0 },
  presentCount: { fontSize: FontSizes.xxl, fontWeight: FontWeights.extrabold, color: Colors.success },
  presentLabel: { fontSize: FontSizes.xs, color: Colors.textSecondary, marginRight: 2 },

  // Section
  section: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  dateText: { fontSize: FontSizes.xs, color: Colors.textMuted },

  // Quick actions
  actionsGrid: { flexDirection: 'row', gap: Spacing.sm },
  actionCard: {
    flex: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm + 4,
    alignItems: 'center',
    gap: 6,
  },
  actionIconWrapper: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTitle: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    textAlign: 'center',
  },
  actionDesc: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
  },

  // Loading state
  loadingState: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    gap: Spacing.sm,
  },
  loadingText: { fontSize: FontSizes.sm, color: Colors.textMuted },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    gap: Spacing.sm,
  },
  emptyIconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.textPrimary,
  },
  emptyDesc: {
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: Spacing.lg,
  },
  emptyAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.sm,
    backgroundColor: Colors.secondaryFaded,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
  },
  emptyActionText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.secondary,
  },

  // Sessions list
  sessionsList: { gap: 0 },
  sessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    gap: Spacing.sm,
  },
  sessionItemLast: { borderBottomWidth: 0 },
  sessionStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
    flexShrink: 0,
  },
  sessionInfo: { flex: 1 },
  sessionSubject: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.textPrimary,
  },
  sessionClass: { fontSize: FontSizes.sm, color: Colors.textSecondary, marginTop: 1 },
  sessionTime: { fontSize: FontSizes.xs, color: Colors.textMuted, marginTop: 1 },
  sessionStatsRight: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  sessionPresent: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.success,
  },
  sessionTotal: { fontSize: FontSizes.sm, color: Colors.textSecondary },

  // FAB
  fab: {
    position: 'absolute',
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
