import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';

import { examApi } from '@/api/exam.api';
import { ExamWithStats, ExamStats, ExamAlert, ExamHall } from '@/api/exam.api';
import { useAppDispatch } from '@/store';
import { addAlert } from '@/store/slices/exam.slice';
import socketService from '@/services/socket.service';
import { Colors } from '@/constants/colors';
import { BorderRadius, FontSizes, FontWeights, Shadow, Spacing } from '@/constants/theme';
import { SocketExamAlertPayload } from '@/types';

const AUTO_REFRESH_MS = 30000;

const severityColors: Record<string, string> = {
  critical: Colors.danger,
  high: Colors.chartOrange,
  medium: Colors.warning,
  low: Colors.info,
};

const ChiefExaminerDashboard: React.FC = () => {
  const navigation = useNavigation();
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();
  const tabBarHeight = 52 + Math.max(insets.bottom, 8);

  const [activeExams, setActiveExams] = useState<ExamWithStats[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [examStats, setExamStats] = useState<ExamStats | null>(null);
  const [alerts, setAlerts] = useState<ExamAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [elapsedTime, setElapsedTime] = useState('00:00');

  const autoRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const selectedExam = activeExams.find((e) => e.id === selectedExamId) || activeExams[0] || null;

  const updateElapsedTimer = useCallback((startTime?: string) => {
    if (!startTime) return;
    if (timerInterval.current) clearInterval(timerInterval.current);
    timerInterval.current = setInterval(() => {
      const diff = Math.floor((Date.now() - new Date(startTime).getTime()) / 1000);
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      const pad = (n: number) => String(n).padStart(2, '0');
      setElapsedTime(h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`);
    }, 1000);
  }, []);

  const loadData = useCallback(async () => {
    try {
      // Load active exams
      const examsRes = await examApi.listExams({ status: 'active' });
      const rd = examsRes.data?.data;
      const exams: ExamWithStats[] = Array.isArray(rd) ? rd : (rd as unknown as { exams: ExamWithStats[] })?.exams ?? [];
      setActiveExams(exams);

      if (exams.length > 0) {
        const examId = selectedExamId || exams[0].id;
        if (!selectedExamId) setSelectedExamId(exams[0].id);

        // Load stats independently
        try {
          const statsRes = await examApi.getExamStats?.(examId);
          if (statsRes) setExamStats(statsRes.data?.data || statsRes.data);
        } catch {
          // non-fatal
        }

        // Load alerts independently
        try {
          const alertsRes = await examApi.getAlerts(examId);
          setAlerts(alertsRes.data?.data || alertsRes.data || []);
        } catch {
          // non-fatal
        }

        // Start elapsed timer
        const exam = exams.find((e) => e.id === examId) || exams[0];
        if (exam?.scheduled_start) {
          updateElapsedTimer(exam.scheduled_start);
        }
      }
    } catch {
      // top-level failure — silently fail, data stays stale
    } finally {
      setLoading(false);
    }
  }, [selectedExamId, updateElapsedTimer]);

  const scheduleAutoRefresh = useCallback(() => {
    if (autoRefreshTimer.current) clearTimeout(autoRefreshTimer.current);
    autoRefreshTimer.current = setTimeout(async () => {
      await loadData();
      scheduleAutoRefresh();
    }, AUTO_REFRESH_MS);
  }, [loadData]);

  useEffect(() => {
    loadData();
    scheduleAutoRefresh();
    return () => {
      if (autoRefreshTimer.current) clearTimeout(autoRefreshTimer.current);
      if (timerInterval.current) clearInterval(timerInterval.current);
    };
  }, []);

  useEffect(() => {
    if (selectedExamId) {
      loadData();
    }
  }, [selectedExamId]);

  // ─── Socket.IO real-time integration ───────────────────────────────────────
  // Join the exam room to receive live alerts and verification events.
  // Falls back to polling (30s auto-refresh) when socket is not connected.
  useEffect(() => {
    if (!selectedExamId) return;

    // Join exam room for real-time events
    if (socketService.isConnected()) {
      socketService.joinExamRoom(selectedExamId);
    }

    // New exam alert → add to local state immediately
    socketService.onExamAlert((payload: SocketExamAlertPayload) => {
      if (payload.examId !== selectedExamId) return;
      dispatch(addAlert({
        id: payload.alertId,
        exam_id: payload.examId,
        hall_id: payload.hallId,
        event_id: payload.eventId,
        student_id: payload.studentId,
        student_name: payload.studentName,
        alert_type: payload.alertType,
        severity: payload.severity,
        message: payload.message,
        is_resolved: false,
        created_at: new Date().toISOString(),
      }));
      // Also refresh alerts list for full accuracy
      setAlerts((prev) => [{
        id: payload.alertId,
        exam_id: payload.examId,
        hall_id: payload.hallId,
        event_id: payload.eventId,
        student_id: payload.studentId,
        student_name: payload.studentName,
        alert_type: payload.alertType,
        severity: payload.severity,
        message: payload.message,
        is_resolved: false,
        created_at: new Date().toISOString(),
      } as typeof prev[0], ...prev]);
    });

    // Hall session started / ended → refresh exam data
    socketService.onHallSessionUpdate(() => {
      loadData();
    });

    // Exam status changed → reload
    socketService.onExamStatusChanged(({ examId }) => {
      if (examId === selectedExamId) loadData();
    });

    return () => {
      socketService.offExamAlert();
      socketService.offHallSessionUpdate();
      socketService.offExamStatusChanged();
      if (selectedExamId) socketService.leaveExamRoom(selectedExamId);
    };
  }, [selectedExamId, dispatch, loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
    scheduleAutoRefresh();
  }, [loadData, scheduleAutoRefresh]);

  const halls: ExamHall[] = selectedExam?.halls || [];
  const recentAlerts = alerts
    .filter((a) => !a.is_resolved)
    .sort((a, b) => {
      const sev = { critical: 0, high: 1, medium: 2, low: 3 };
      return (sev[a.severity] ?? 4) - (sev[b.severity] ?? 4);
    })
    .slice(0, 3);

  const renderHallCard = ({ item: hall }: { item: ExamHall }) => {
    const total = hall.capacity || 1;
    const verified = 0;
    const flagged = 0;
    const rejected = 0;
    const progress = 0;
    const isActive = false;

    return (
      <View style={styles.hallCard}>
        <View style={styles.hallCardHeader}>
          <View style={styles.hallCardLeft}>
            <Text style={styles.hallCardName}>{hall.hall_name}</Text>
            {(hall.floor || hall.building) && (
              <Text style={styles.hallCardLocation}>
                {[hall.floor, hall.building].filter(Boolean).join(' · ')}
              </Text>
            )}
            {hall.invigilator_name && (
              <View style={styles.invigilatorRow}>
                <Ionicons name="person-outline" size={12} color={Colors.textMuted} />
                <Text style={styles.invigilatorName}>{hall.invigilator_name}</Text>
              </View>
            )}
          </View>
          <View style={[styles.hallStatusBadge, isActive ? styles.hallStatusActive : styles.hallStatusIdle]}>
            {isActive && <View style={styles.activeDot} />}
            <Text style={[styles.hallStatusText, { color: isActive ? Colors.success : Colors.textMuted }]}>
              {isActive ? 'Active' : 'Not Started'}
            </Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <View style={styles.hallStatRow}>
          <Text style={[styles.hallStat, { color: Colors.success }]}>{verified} verified</Text>
          {flagged > 0 && (
            <Text style={[styles.hallStat, { color: Colors.warning }]}>{flagged} flagged</Text>
          )}
          {rejected > 0 && (
            <Text style={[styles.hallStat, { color: Colors.danger }]}>{rejected} rejected</Text>
          )}
          <Text style={[styles.hallStat, { color: Colors.textMuted, marginLeft: 'auto' }]}>
            {total - verified} pending
          </Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading live dashboard...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (activeExams.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.emptyPage}>
          <Ionicons name="pulse-outline" size={56} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>No Active Exams</Text>
          <Text style={styles.emptyDesc}>Live data will appear here when an exam is in progress</Text>
          <TouchableOpacity style={styles.refreshActionBtn} onPress={onRefresh}>
            <Ionicons name="refresh-outline" size={16} color={Colors.primary} />
            <Text style={styles.refreshActionText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabBarHeight + 20 }}
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
            <View style={styles.livePill}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
            <Text style={styles.elapsedTimer}>{elapsedTime}</Text>
          </View>

          <Text style={styles.examTitle} numberOfLines={2}>
            {selectedExam?.title || 'Active Exam'}
          </Text>
          <Text style={styles.examCode}>
            {selectedExam?.exam_code || ''}
          </Text>

          {/* Exam selector if multiple */}
          {activeExams.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.examSelector}
              contentContainerStyle={styles.examSelectorContent}
            >
              {activeExams.map((exam) => (
                <TouchableOpacity
                  key={exam.id}
                  style={[
                    styles.examSelectorChip,
                    selectedExamId === exam.id && styles.examSelectorChipActive,
                  ]}
                  onPress={() => setSelectedExamId(exam.id)}
                >
                  <Text
                    style={[
                      styles.examSelectorText,
                      selectedExamId === exam.id && styles.examSelectorTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {exam.exam_code || exam.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Stats row */}
          <View style={styles.statsRow}>
            {[
              { label: 'Enrolled', value: examStats?.total_enrolled ?? selectedExam?.total_enrolled ?? 0, color: 'white' },
              { label: 'Verified', value: examStats?.verified ?? 0, color: '#86efac' },
              { label: 'Flagged', value: examStats?.flagged ?? 0, color: '#fcd34d' },
              { label: 'Alerts', value: alerts.filter((a) => !a.is_resolved).length, color: '#fca5a5' },
            ].map((s) => (
              <View key={s.label} style={styles.statBox}>
                <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
        </LinearGradient>

        <View style={styles.content}>
          {/* Halls section */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Exam Halls</Text>
            <Text style={styles.sectionCount}>{halls.length} halls</Text>
          </View>

          {halls.length === 0 ? (
            <View style={[styles.section, styles.emptySection]}>
              <Ionicons name="business-outline" size={28} color={Colors.textMuted} />
              <Text style={styles.emptySectionText}>No halls data available</Text>
            </View>
          ) : (
            <FlatList
              data={halls}
              keyExtractor={(h) => h.id}
              renderItem={renderHallCard}
              scrollEnabled={false}
              contentContainerStyle={{ gap: Spacing.sm }}
            />
          )}

          {/* Recent alerts */}
          {recentAlerts.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionRowHeader}>
                <Text style={styles.sectionTitle}>Active Alerts</Text>
                <TouchableOpacity
                  onPress={() => navigation.navigate('ExamAlerts' as never)}
                >
                  <Text style={styles.viewAllText}>View All</Text>
                </TouchableOpacity>
              </View>
              {recentAlerts.map((alert) => (
                <View key={alert.id} style={styles.alertItem}>
                  <View
                    style={[
                      styles.alertSeverityBar,
                      { backgroundColor: severityColors[alert.severity] || Colors.textMuted },
                    ]}
                  />
                  <View style={styles.alertContent}>
                    <Text style={styles.alertMessage} numberOfLines={2}>
                      {alert.message || alert.alert_type}
                    </Text>
                    {alert.student_name && (
                      <Text style={styles.alertStudent}>{alert.student_name}</Text>
                    )}
                  </View>
                  <View
                    style={[
                      styles.alertSeverityBadge,
                      { backgroundColor: (severityColors[alert.severity] || Colors.textMuted) + '20' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.alertSeverityText,
                        { color: severityColors[alert.severity] || Colors.textMuted },
                      ]}
                    >
                      {alert.severity?.toUpperCase()}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Socket.IO connected — real-time alerts and hall updates active */}
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
    paddingBottom: Spacing.xl + 8,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.danger + 'CC',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'white' },
  liveText: {
    color: 'white',
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    letterSpacing: 1,
  },
  elapsedTimer: {
    color: 'white',
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    fontVariant: ['tabular-nums'],
  },
  examTitle: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: 'white',
    marginTop: 2,
  },
  examCode: {
    fontSize: FontSizes.sm,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
    marginBottom: Spacing.md,
  },

  examSelector: { marginBottom: Spacing.md },
  examSelectorContent: { gap: Spacing.sm },
  examSelectorChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.15)',
    maxWidth: 160,
  },
  examSelectorChipActive: {
    backgroundColor: 'white',
  },
  examSelectorText: {
    fontSize: FontSizes.xs,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: FontWeights.medium,
  },
  examSelectorTextActive: {
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
  },

  statsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm + 4,
    gap: Spacing.sm,
  },
  statBox: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
  },
  statLabel: {
    fontSize: FontSizes.xs,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
  },

  content: { padding: Spacing.md, marginTop: -12 },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
    paddingHorizontal: 2,
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

  section: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginTop: Spacing.md,
    ...Shadow.sm,
  },
  sectionRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  viewAllText: {
    fontSize: FontSizes.sm,
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
  },
  emptySection: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
  },
  emptySectionText: {
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },

  // Hall cards
  hallCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    ...Shadow.sm,
  },
  hallCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  hallCardLeft: { flex: 1 },
  hallCardName: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.textPrimary,
  },
  hallCardLocation: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    marginTop: 1,
  },
  invigilatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  invigilatorName: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  hallStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  hallStatusActive: { backgroundColor: Colors.successFaded },
  hallStatusIdle: { backgroundColor: Colors.surfaceVariant },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  hallStatusText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },
  progressBar: {
    height: 6,
    backgroundColor: Colors.surfaceVariant,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.success,
    borderRadius: 3,
  },
  hallStatRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    flexWrap: 'wrap',
  },
  hallStat: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },

  // Alert items
  alertItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    gap: Spacing.sm,
  },
  alertSeverityBar: {
    width: 3,
    height: 36,
    borderRadius: 2,
    flexShrink: 0,
  },
  alertContent: { flex: 1 },
  alertMessage: {
    fontSize: FontSizes.sm,
    color: Colors.textPrimary,
    fontWeight: FontWeights.medium,
  },
  alertStudent: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    marginTop: 1,
  },
  alertSeverityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  alertSeverityText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    letterSpacing: 0.5,
  },

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
  emptyPage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    padding: Spacing.xl,
  },
  emptyTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
  },
  emptyDesc: {
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  refreshActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primaryFaded,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.sm,
  },
  refreshActionText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.primary,
  },
});

export default ChiefExaminerDashboard;
