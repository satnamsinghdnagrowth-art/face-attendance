import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';

import { examApi, ExamWithStats, ExamHall, ExamStats } from '@/api/exam.api';
import { useAppDispatch } from '@/store';
import { updateExamStatusThunk } from '@/store/slices/exam.slice';
import { Colors } from '@/constants/colors';
import { BorderRadius, FontSizes, FontWeights, Shadow, Spacing } from '@/constants/theme';

type RouteParams = { examId: string };

const statusColors: Record<string, { bg: string[]; label: string }> = {
  scheduled: { bg: [Colors.primary, Colors.primaryDark], label: 'Scheduled' },
  active: { bg: [Colors.success, Colors.successDark], label: 'Active' },
  completed: { bg: [Colors.textSecondary, Colors.textMuted], label: 'Completed' },
  cancelled: { bg: [Colors.danger, Colors.dangerDark], label: 'Cancelled' },
};

const ExamDetailScreen: React.FC = () => {
  const navigation = useNavigation();
  const dispatch = useAppDispatch();
  const route = useRoute<RouteProp<Record<string, RouteParams>, string>>();
  // Defensive: ExamDetail is always a stack screen with required params, but guard anyway
  const examId: string = route.params?.examId ?? '';

  const [exam, setExam] = useState<ExamWithStats | null>(null);
  const [stats, setStats] = useState<ExamStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);

  const loadExam = useCallback(async () => {
    try {
      const res = await examApi.getExam(examId);
      setExam(res.data?.data || res.data);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to load exam');
    } finally {
      setLoading(false);
    }
  }, [examId]);

  const loadStats = useCallback(async () => {
    try {
      const res = await examApi.getExamStats?.(examId);
      if (res) setStats(res.data?.data || res.data);
    } catch {
      // stats failure is non-fatal
    } finally {
      setStatsLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    loadExam();
    loadStats();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([loadExam(), loadStats()]);
    setRefreshing(false);
  }, [loadExam, loadStats]);

  const handleStartSession = useCallback((hall: ExamHall) => {
    (navigation as any).navigate('HallSession', { examId, hallId: hall.id });
  }, [navigation, examId]);

  const handleViewStudents = useCallback((hall: ExamHall) => {
    (navigation as any).navigate('Students', { hallId: hall.id, examId, sessionId: '' });
  }, [navigation, examId]);

  const handleExamStatusChange = useCallback(
    (newStatus: 'active' | 'completed' | 'cancelled') => {
      const labels: Record<string, string> = {
        active:    'Start Exam',
        completed: 'Mark as Completed',
        cancelled: 'Cancel Exam',
      };
      const messages: Record<string, string> = {
        active:    'Start this exam? All halls will be notified.',
        completed: 'Mark this exam as completed? This cannot be undone.',
        cancelled: 'Cancel this exam? This cannot be undone.',
      };
      Alert.alert(
        labels[newStatus] ?? 'Update Status',
        messages[newStatus] ?? 'Update exam status?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Confirm',
            style: newStatus === 'cancelled' ? 'destructive' : 'default',
            onPress: async () => {
              try {
                await dispatch(updateExamStatusThunk({ examId, status: newStatus })).unwrap();
                await loadExam();
              } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : 'Failed to update status';
                Alert.alert('Error', msg);
              }
            },
          },
        ]
      );
    },
    [dispatch, examId, loadExam]
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.topBarSimple}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading exam details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!exam) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.topBarSimple}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <View style={styles.loadingState}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.danger} />
          <Text style={styles.loadingText}>Exam not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const statusCfg = statusColors[exam.status] || statusColors.scheduled;
  const startDate = new Date(exam.scheduled_start || '');
  const endDate = new Date(exam.scheduled_end || '');

  const statCards = [
    {
      label: 'Enrolled',
      value: stats?.total_enrolled ?? exam.total_enrolled ?? 0,
      icon: 'people-outline' as const,
      color: Colors.primary,
    },
    {
      label: 'Verified',
      value: stats?.verified ?? 0,
      icon: 'checkmark-circle-outline' as const,
      color: Colors.success,
    },
    {
      label: 'Flagged',
      value: stats?.flagged ?? 0,
      icon: 'flag-outline' as const,
      color: Colors.warning,
    },
    {
      label: 'Rejected',
      value: stats?.rejected ?? 0,
      icon: 'close-circle-outline' as const,
      color: Colors.danger,
    },
  ];

  const halls: ExamHall[] = exam.halls || [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
        contentContainerStyle={{ paddingBottom: Spacing.xl }}
      >
        {/* Header card with gradient */}
        <LinearGradient
          colors={statusCfg.bg as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <TouchableOpacity style={styles.backBtnWhite} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color="white" />
          </TouchableOpacity>

          <View style={styles.examCodeBadge}>
            <Text style={styles.examCodeText}>{exam.exam_code || 'EXAM'}</Text>
          </View>

          <Text style={styles.headerTitle} numberOfLines={2}>{exam.title}</Text>

          <View style={styles.statusPill}>
            {exam.status === 'active' && <View style={styles.activeDot} />}
            <Text style={styles.statusText}>{statusCfg.label}</Text>
          </View>

          <View style={styles.headerMeta}>
            <View style={styles.metaItem}>
              <Ionicons name="calendar-outline" size={14} color="rgba(255,255,255,0.8)" />
              <Text style={styles.metaItemText}>
                {isNaN(startDate.getTime())
                  ? 'Date TBD'
                  : startDate.toLocaleDateString('en-US', {
                      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
                    })}
              </Text>
            </View>
            {!isNaN(startDate.getTime()) && (
              <View style={styles.metaItem}>
                <Ionicons name="time-outline" size={14} color="rgba(255,255,255,0.8)" />
                <Text style={styles.metaItemText}>
                  {startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  {!isNaN(endDate.getTime())
                    ? ` – ${endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
                    : ''}
                </Text>
              </View>
            )}
            {exam.duration_mins && (
              <View style={styles.metaItem}>
                <Ionicons name="hourglass-outline" size={14} color="rgba(255,255,255,0.8)" />
                <Text style={styles.metaItemText}>{exam.duration_mins} min</Text>
              </View>
            )}
          </View>
        </LinearGradient>

        <View style={styles.content}>
          {/* Stats row */}
          <View style={styles.statsRow}>
            {statsLoading
              ? statCards.map((s) => (
                  <View key={s.label} style={styles.statCard}>
                    <ActivityIndicator size="small" color={s.color} />
                    <Text style={styles.statLabel}>{s.label}</Text>
                  </View>
                ))
              : statCards.map((s) => (
                  <View key={s.label} style={styles.statCard}>
                    <Ionicons name={s.icon} size={20} color={s.color} />
                    <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
                    <Text style={styles.statLabel}>{s.label}</Text>
                  </View>
                ))}
          </View>

          {/* Halls section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Exam Halls</Text>
              <Text style={styles.sectionCount}>{halls.length} halls</Text>
            </View>

            {halls.length === 0 ? (
              <View style={styles.emptyHalls}>
                <Ionicons name="business-outline" size={28} color={Colors.textMuted} />
                <Text style={styles.emptyHallsText}>No halls assigned yet</Text>
              </View>
            ) : (
              halls.map((hall, idx) => (
                <View
                  key={hall.id}
                  style={[styles.hallCard, idx === halls.length - 1 && styles.hallCardLast]}
                >
                  <View style={styles.hallInfo}>
                    <View style={styles.hallNameRow}>
                      <Text style={styles.hallName}>{hall.hall_name}</Text>
                      {false && (
                        <View style={styles.activePill}>
                          <View style={styles.activeDotSmall} />
                          <Text style={styles.activePillText}>Active</Text>
                        </View>
                      )}
                    </View>
                    {(hall.floor || hall.building) && (
                      <Text style={styles.hallLocation}>
                        {[hall.floor, hall.building].filter(Boolean).join(' · ')}
                      </Text>
                    )}
                    <View style={styles.hallStats}>
                      {hall.invigilator_name && (
                        <Text style={styles.hallStatText}>
                          <Ionicons name="person-outline" size={11} color={Colors.textMuted} />{' '}
                          {hall.invigilator_name}
                        </Text>
                      )}
                      <Text style={styles.hallStatText}>
                        Capacity: {hall.capacity || '—'}
                      </Text>
                      <Text style={styles.hallStatText}>
                        Capacity: {hall.capacity}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.hallActions}>
                    {!false ? (
                      <TouchableOpacity
                        style={styles.hallActionBtn}
                        onPress={() => handleStartSession(hall)}
                      >
                        <Ionicons name="play-circle-outline" size={14} color={Colors.success} />
                        <Text style={[styles.hallActionText, { color: Colors.success }]}>
                          Start
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      style={[styles.hallActionBtn, styles.hallActionBtnOutline]}
                      onPress={() => handleViewStudents(hall)}
                    >
                      <Ionicons name="people-outline" size={14} color={Colors.primary} />
                      <Text style={[styles.hallActionText, { color: Colors.primary }]}>
                        Students
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>

          {/* Exam status actions */}
          {exam.status === 'scheduled' && (
            <View style={styles.statusActions}>
              <TouchableOpacity
                style={[styles.statusBtn, styles.statusBtnStart]}
                onPress={() => handleExamStatusChange('active')}
                activeOpacity={0.8}
              >
                <Ionicons name="play-circle-outline" size={18} color="white" />
                <Text style={styles.statusBtnStartText}>Start Exam</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.statusBtn, styles.statusBtnCancel]}
                onPress={() => handleExamStatusChange('cancelled')}
                activeOpacity={0.8}
              >
                <Ionicons name="close-circle-outline" size={18} color={Colors.danger} />
                <Text style={styles.statusBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

          {exam.status === 'active' && (
            <View style={styles.statusActions}>
              <TouchableOpacity
                style={[styles.statusBtn, styles.statusBtnComplete]}
                onPress={() => handleExamStatusChange('completed')}
                activeOpacity={0.8}
              >
                <Ionicons name="checkmark-circle-outline" size={18} color="white" />
                <Text style={styles.statusBtnStartText}>Mark Completed</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.statusBtn, styles.statusBtnCancel]}
                onPress={() => handleExamStatusChange('cancelled')}
                activeOpacity={0.8}
              >
                <Ionicons name="stop-circle-outline" size={18} color={Colors.danger} />
                <Text style={styles.statusBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Export compliance report */}
          <TouchableOpacity
            style={styles.exportBtn}
            activeOpacity={0.8}
            onPress={() => (navigation as any).navigate('ComplianceReport', { examId })}
          >
            <Ionicons name="download-outline" size={18} color={Colors.primary} />
            <Text style={styles.exportBtnText}>Export Compliance Report</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.primary} style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  topBarSimple: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerGradient: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl + 8,
  },
  backBtnWhite: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
    alignSelf: 'flex-start',
  },
  examCodeBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
  },
  examCodeText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    color: 'white',
    letterSpacing: 1,
  },
  headerTitle: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: 'white',
    marginBottom: Spacing.sm,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.md,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'white',
  },
  statusText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    color: 'white',
  },
  headerMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm + 4,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaItemText: {
    fontSize: FontSizes.xs,
    color: 'rgba(255,255,255,0.9)',
  },

  content: {
    padding: Spacing.md,
    marginTop: -12,
  },

  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm + 2,
    alignItems: 'center',
    gap: 4,
    ...Shadow.sm,
  },
  statValue: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
  },
  statLabel: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    textAlign: 'center',
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
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
  },
  sectionCount: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    backgroundColor: Colors.surfaceVariant,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },

  emptyHalls: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    gap: Spacing.sm,
  },
  emptyHallsText: {
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },

  hallCard: {
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  hallCardLast: { borderBottomWidth: 0 },
  hallInfo: { marginBottom: Spacing.sm },
  hallNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: 2,
  },
  hallName: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.textPrimary,
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.successFaded,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  activeDotSmall: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Colors.success,
  },
  activePillText: {
    fontSize: FontSizes.xs,
    color: Colors.success,
    fontWeight: FontWeights.semibold,
  },
  hallLocation: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  hallStats: {
    flexDirection: 'row',
    gap: Spacing.md,
    flexWrap: 'wrap',
  },
  hallStatText: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  hallActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  hallActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.successFaded,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  hallActionBtnOutline: {
    backgroundColor: Colors.primaryFaded,
  },
  hallActionText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },

  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    ...Shadow.sm,
    borderWidth: 1,
    borderColor: Colors.primaryFaded,
  },
  exportBtnText: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.primary,
  },

  // Status action buttons
  statusActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  statusBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: BorderRadius.lg,
  },
  statusBtnStart:    { backgroundColor: Colors.success },
  statusBtnComplete: { backgroundColor: Colors.primary },
  statusBtnCancel: {
    backgroundColor: Colors.dangerFaded,
    borderWidth: 1,
    borderColor: Colors.danger + '50',
    flex: 0,
    paddingHorizontal: 16,
  },
  statusBtnStartText:  { color: 'white', fontSize: FontSizes.sm, fontWeight: FontWeights.bold },
  statusBtnCancelText: { color: Colors.danger, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },

  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: FontSizes.md,
    color: Colors.textMuted,
  },
});

export default ExamDetailScreen;
