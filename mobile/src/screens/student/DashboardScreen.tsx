import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useFocusEffect } from '@react-navigation/native';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';
import { loadHistoryThunk, loadSummaryThunk } from '@/store/slices/attendance.slice';
import { Avatar } from '@/components/common/Avatar';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Colors } from '@/constants/colors';
import { BorderRadius, FontSizes, FontWeights, Shadow, Spacing } from '@/constants/theme';
import { formatDate, formatTime, getGreeting, formatPercentage, getAttendanceGrade } from '@/utils/helpers';
import { faceApi } from '@/api/face.api';
import socketService from '@/services/socket.service';

const { width } = Dimensions.get('window');

interface StatCardProps {
  value: number | string;
  label: string;
  color: string;
  icon: string;
}

const StatCard: React.FC<StatCardProps> = ({ value, label, color, icon }) => (
  <View style={[styles.statCard, { borderTopColor: color }]}>
    <View style={[styles.statIconContainer, { backgroundColor: color + '18' }]}>
      <Ionicons name={icon as never} size={20} color={color} />
    </View>
    <Text style={[styles.statValue, { color }]}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const StudentDashboardScreen: React.FC = () => {
  const navigation = useNavigation();
  const dispatch = useAppDispatch();
  const { user } = useAuth();
  const { history, summary, isLoading } = useAppSelector((state) => state.attendance);
  const [refreshing, setRefreshing] = useState(false);
  const [faceRegistered, setFaceRegistered] = useState<boolean | null>(null);

  const loadData = useCallback(async () => {
    if (!user) return;
    await Promise.all([
      dispatch(loadHistoryThunk({ page: 1, limit: 5, refresh: true })),
      dispatch(loadSummaryThunk(user.id)),
    ]);

    // Check face enrollment status
    try {
      const status = await faceApi.getStatus(user.id);
      setFaceRegistered(status.data.data.registered);
    } catch {
      setFaceRegistered(false);
    }
  }, [user, dispatch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Listen for attendance marked events while this screen is focused
  useFocusEffect(
    useCallback(() => {
      socketService.onAttendanceMarked((data) => {
        const studentId = (data as unknown as { studentId?: string }).studentId;
        if (user && studentId === user.id) {
          const status = (data as unknown as { status?: string }).status || 'present';
          Alert.alert(
            'Attendance Recorded ✓',
            `Your attendance has been marked as ${status.charAt(0).toUpperCase() + status.slice(1)}.`,
            [{ text: 'OK' }]
          );
          // Refresh attendance data
          dispatch(loadHistoryThunk({ page: 1, limit: 5, refresh: true }));
        }
      });
      return () => {
        socketService.offAttendanceMarked();
      };
    }, [user, dispatch])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const recentRecords = history.slice(0, 5);
  const attendanceGrade = summary ? getAttendanceGrade(summary.percentage) : null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        {/* Header gradient */}
        <LinearGradient
          colors={[Colors.primaryDark, Colors.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.greeting}>{getGreeting()},</Text>
              <Text style={styles.userName} numberOfLines={1}>
                {user?.name || 'Student'}
              </Text>
              {user?.class_id && (
                <Text style={styles.classText}>
                  <Ionicons name="school-outline" size={13} color="rgba(255,255,255,0.75)" />
                  {' '}Class {user.class_id}
                </Text>
              )}
            </View>
            <Avatar
              name={user?.name || 'S'}
              photoUrl={user?.photo_url}
              size={52}
              onPress={() => {}}
            />
          </View>
        </LinearGradient>

        <View style={styles.contentContainer}>
          {/* Face enrollment banner */}
          {faceRegistered === false && (
            <TouchableOpacity
              style={styles.enrollBanner}
              onPress={() => navigation.navigate('FaceEnrollment' as never)}
            >
              <View style={styles.enrollBannerLeft}>
                <View style={styles.enrollIcon}>
                  <Ionicons name="scan-outline" size={22} color={Colors.warning} />
                </View>
                <View>
                  <Text style={styles.enrollTitle}>Face Not Enrolled</Text>
                  <Text style={styles.enrollSubtitle}>
                    Register your face to mark attendance
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.warning} />
            </TouchableOpacity>
          )}

          {/* Attendance summary card */}
          {summary && (
            <View style={[styles.summaryCard, Shadow.md]}>
              <View style={styles.summaryHeader}>
                <View>
                  <Text style={styles.summaryTitle}>Attendance Summary</Text>
                  <Text style={styles.summarySubtitle}>Overall performance</Text>
                </View>
                <View style={[styles.gradeBadge, { backgroundColor: attendanceGrade?.color + '18' }]}>
                  <Text style={[styles.gradeText, { color: attendanceGrade?.color }]}>
                    {attendanceGrade?.grade}
                  </Text>
                </View>
              </View>

              {/* Percentage circle */}
              <View style={styles.percentageContainer}>
                <View style={styles.percentageCircle}>
                  <Text style={styles.percentageValue}>
                    {Math.round(summary.percentage)}%
                  </Text>
                  <Text style={styles.percentageLabel}>Attendance</Text>
                </View>

                {/* Progress bar */}
                <View style={styles.progressWrapper}>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${Math.min(summary.percentage, 100)}%`,
                          backgroundColor:
                            summary.percentage >= 75 ? Colors.success : Colors.danger,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.progressLabel}>
                    {summary.percentage >= 75 ? 'On track' : 'Below 75% threshold!'}
                  </Text>
                </View>
              </View>

              {/* Stats row */}
              <View style={styles.statsRow}>
                <StatCard value={summary.present} label="Present" color={Colors.success} icon="checkmark-circle" />
                <StatCard value={summary.absent} label="Absent" color={Colors.danger} icon="close-circle" />
                <StatCard value={summary.late} label="Late" color={Colors.warning} icon="time" />
                <StatCard value={summary.leave} label="Leave" color={Colors.secondary} icon="calendar" />
              </View>
            </View>
          )}

          {/* Quick actions */}
          <View style={styles.actionsRow}>
            {[
              { label: 'History', icon: 'calendar-outline', screen: 'AttendanceHistory', color: Colors.primary },
              { label: 'Leave', icon: 'document-text-outline', screen: 'LeaveRequest', color: Colors.secondary },
              { label: 'Face ID', icon: 'scan-outline', screen: 'FaceEnrollment', color: Colors.success },
            ].map(({ label, icon, screen, color }) => (
              <TouchableOpacity
                key={label}
                style={styles.actionButton}
                onPress={() => navigation.navigate(screen as never)}
              >
                <View style={[styles.actionIcon, { backgroundColor: color + '15' }]}>
                  <Ionicons name={icon as never} size={22} color={color} />
                </View>
                <Text style={styles.actionLabel}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Recent attendance */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Attendance</Text>
              <TouchableOpacity onPress={() => navigation.navigate('AttendanceHistory' as never)}>
                <Text style={styles.seeAll}>See All</Text>
              </TouchableOpacity>
            </View>

            {recentRecords.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="calendar-outline" size={36} color={Colors.textMuted} />
                <Text style={styles.emptyText}>No attendance records yet</Text>
              </View>
            ) : (
              recentRecords.map((record) => (
                <View key={record.id} style={styles.recordCard}>
                  <View style={styles.recordLeft}>
                    <View style={[styles.recordDot, { backgroundColor: Colors[record.status] || Colors.textMuted }]} />
                    <View>
                      <Text style={styles.recordSubject}>
                        {record.subject_name || 'Subject'}
                      </Text>
                      <Text style={styles.recordDate}>{formatDate(record.date)}</Text>
                    </View>
                  </View>
                  <StatusBadge status={record.status} size="sm" />
                </View>
              ))
            )}
          </View>

          {/* Attendance by subject */}
          {summary?.by_subject && summary.by_subject.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>By Subject</Text>
              {summary.by_subject.map((sub) => (
                <View key={sub.subject_id} style={styles.subjectRow}>
                  <View style={styles.subjectInfo}>
                    <Text style={styles.subjectName} numberOfLines={1}>
                      {sub.subject_name}
                    </Text>
                    <Text style={styles.subjectCount}>
                      {sub.present}/{sub.total} classes
                    </Text>
                  </View>
                  <View style={styles.subjectRight}>
                    <Text
                      style={[
                        styles.subjectPercentage,
                        { color: sub.percentage >= 75 ? Colors.success : Colors.danger },
                      ]}
                    >
                      {formatPercentage(sub.percentage)}
                    </Text>
                    <View style={styles.subjectProgressTrack}>
                      <View
                        style={[
                          styles.subjectProgressFill,
                          {
                            width: `${Math.min(sub.percentage, 100)}%`,
                            backgroundColor: sub.percentage >= 75 ? Colors.success : Colors.danger,
                          },
                        ]}
                      />
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
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
  },
  greeting: {
    fontSize: FontSizes.md,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: FontWeights.medium,
  },
  userName: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: 'white',
    maxWidth: width * 0.55,
  },
  classText: {
    fontSize: FontSizes.sm,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },
  contentContainer: {
    padding: Spacing.md,
    marginTop: -20,
  },
  enrollBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.warningFaded,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.warning + '40',
  },
  enrollBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  enrollIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.warning + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  enrollTitle: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.warning,
  },
  enrollSubtitle: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  summaryCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  summaryTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
  },
  summarySubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  gradeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  gradeText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  percentageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  percentageCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primaryFaded,
    borderWidth: 3,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  percentageValue: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.extrabold,
    color: Colors.primary,
  },
  percentageLabel: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  progressWrapper: {
    flex: 1,
    gap: 6,
  },
  progressTrack: {
    height: 8,
    backgroundColor: Colors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressLabel: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: Spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surfaceVariant,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    alignItems: 'center',
    borderTopWidth: 3,
  },
  statIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  statValue: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
  statLabel: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  actionButton: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    paddingVertical: Spacing.md,
    gap: 8,
    ...Shadow.sm,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    color: Colors.textSecondary,
  },
  section: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
  },
  seeAll: {
    fontSize: FontSizes.sm,
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyText: {
    fontSize: FontSizes.md,
    color: Colors.textMuted,
  },
  recordCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  recordLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  recordDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  recordSubject: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.medium,
    color: Colors.textPrimary,
  },
  recordDate: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  subjectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  subjectInfo: {
    flex: 1,
  },
  subjectName: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.medium,
    color: Colors.textPrimary,
  },
  subjectCount: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  subjectRight: {
    width: 90,
    alignItems: 'flex-end',
    gap: 4,
  },
  subjectPercentage: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
  },
  subjectProgressTrack: {
    width: '100%',
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  subjectProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
});

export default StudentDashboardScreen;
