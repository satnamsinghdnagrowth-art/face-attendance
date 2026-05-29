import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';

import { examApi, Exam, ExamHall } from '@/api/exam.api';
import { useAppSelector } from '@/store';
import { useAuth } from '@/hooks/useAuth';
import { Colors } from '@/constants/colors';
import { BorderRadius, FontSizes, FontWeights, Shadow, Spacing } from '@/constants/theme';

interface ExamWithHalls extends Exam {
  halls: ExamHall[];
}

/**
 * Landing tab screen for hall invigilators.
 * Does NOT require route params — safe to render as a bottom tab.
 * Loads exams where this invigilator is assigned and shows their halls.
 */
const InvigilatorHomeScreen: React.FC = () => {
  const navigation = useNavigation();
  const { user } = useAuth();
  const currentSession = useAppSelector((s) => s.exam.currentSession);

  const [exams, setExams] = useState<ExamWithHalls[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAssignedExams = useCallback(async () => {
    setError(null);
    try {
      // Load scheduled + active exams and find halls assigned to this invigilator
      const [scheduledRes, activeRes] = await Promise.allSettled([
        examApi.listExams({ status: 'scheduled' }),
        examApi.listExams({ status: 'active' }),
      ]);

      const allExams: Exam[] = [];

      if (scheduledRes.status === 'fulfilled') {
        const data = scheduledRes.value.data.data;
        const list = Array.isArray(data) ? data : (data as { exams: Exam[] })?.exams ?? [];
        allExams.push(...list);
      }
      if (activeRes.status === 'fulfilled') {
        const data = activeRes.value.data.data;
        const list = Array.isArray(data) ? data : (data as { exams: Exam[] })?.exams ?? [];
        allExams.push(...list);
      }

      // Load halls for each exam to find ones assigned to this invigilator
      const examWithHalls: ExamWithHalls[] = [];

      await Promise.all(
        allExams.map(async (exam) => {
          try {
            const hallsRes = await examApi.getHalls(exam.id);
            const halls = hallsRes.data.data;
            const myHalls = halls.filter(
              (h) => !user?.id || h.invigilator_id === user.id
            );
            if (myHalls.length > 0 || !user?.id) {
              examWithHalls.push({ ...exam, halls: myHalls.length > 0 ? myHalls : halls });
            }
          } catch {
            // skip exam if halls fail to load
          }
        })
      );

      setExams(examWithHalls.sort((a, b) =>
        new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime()
      ));
    } catch (e) {
      setError('Failed to load your assigned halls. Pull down to retry.');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadAssignedExams();
  }, [loadAssignedExams]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAssignedExams();
    setRefreshing(false);
  }, [loadAssignedExams]);

  const handleOpenHall = useCallback((examId: string, hallId: string) => {
    (navigation as any).navigate('HallSession', { examId, hallId });
  }, [navigation]);

  const statusConfig: Record<string, { color: string; bg: string; label: string }> = {
    scheduled: { color: Colors.primary, bg: Colors.primaryFaded, label: 'Scheduled' },
    active:    { color: Colors.success, bg: Colors.successFaded, label: 'Active' },
    completed: { color: Colors.textMuted, bg: Colors.surfaceVariant, label: 'Completed' },
    cancelled: { color: Colors.danger, bg: Colors.dangerFaded, label: 'Cancelled' },
  };

  const renderExam = useCallback(({ item }: { item: ExamWithHalls }) => {
    const cfg = statusConfig[item.status] ?? statusConfig.scheduled!;
    const startDate = item.scheduled_start
      ? new Date(item.scheduled_start).toLocaleString([], {
          month: 'short', day: 'numeric',
          hour: '2-digit', minute: '2-digit',
        })
      : '—';

    return (
      <View style={styles.examCard}>
        {/* Exam header */}
        <View style={styles.examHeader}>
          <View style={{ flex: 1, marginRight: Spacing.sm }}>
            <Text style={styles.examTitle} numberOfLines={2}>{item.title}</Text>
            <View style={styles.examMeta}>
              <Ionicons name="calendar-outline" size={12} color={Colors.textMuted} />
              <Text style={styles.examMetaText}>{startDate}</Text>
              <Text style={styles.examMetaSep}>·</Text>
              <Text style={styles.examMetaText}>{item.duration_mins} min</Text>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
            {item.status === 'active' && <View style={styles.activeDot} />}
            <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>

        {/* Halls */}
        {item.halls.map((hall) => {
          const isMyActiveSession =
            currentSession?.hall_id === hall.id && currentSession?.status === 'active';

          return (
            <TouchableOpacity
              key={hall.id}
              style={[styles.hallRow, isMyActiveSession && styles.hallRowActive]}
              onPress={() => handleOpenHall(item.id, hall.id)}
              activeOpacity={0.75}
            >
              <View style={styles.hallLeft}>
                <View style={[
                  styles.hallIconWrapper,
                  { backgroundColor: isMyActiveSession ? Colors.successFaded : Colors.surfaceVariant },
                ]}>
                  <Ionicons
                    name={isMyActiveSession ? 'pulse' : 'business-outline'}
                    size={16}
                    color={isMyActiveSession ? Colors.success : Colors.textSecondary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.hallName}>{hall.hall_name}</Text>
                  {(hall.floor || hall.building) && (
                    <Text style={styles.hallLocation}>
                      {[hall.floor, hall.building].filter(Boolean).join(' · ')}
                    </Text>
                  )}
                </View>
              </View>

              <View style={styles.hallRight}>
                {isMyActiveSession ? (
                  <View style={styles.activePill}>
                    <View style={styles.activePillDot} />
                    <Text style={styles.activePillText}>Active</Text>
                  </View>
                ) : (
                  <View style={styles.openPill}>
                    <Text style={styles.openPillText}>
                      {item.status === 'active' ? 'Continue' : 'Open'}
                    </Text>
                    <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }, [handleOpenHall, currentSession, statusConfig]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <LinearGradient
        colors={[Colors.warningDark, Colors.warning]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>My Halls</Text>
            <Text style={styles.headerSubtitle}>Tap a hall to open or manage your session</Text>
          </View>
          <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
            <Ionicons name="refresh-outline" size={20} color="white" />
          </TouchableOpacity>
        </View>

        {/* Active session banner */}
        {currentSession?.status === 'active' && (
          <View style={styles.activeSessionBanner}>
            <View style={styles.activeBannerDot} />
            <Text style={styles.activeSessionText}>Session in progress</Text>
          </View>
        )}
      </LinearGradient>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.warning} />
          <Text style={styles.loadingText}>Loading your halls...</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={48} color={Colors.danger} />
          <Text style={styles.errorTitle}>Connection Error</Text>
          <Text style={styles.errorDesc}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadAssignedExams}>
            <Ionicons name="refresh-outline" size={16} color={Colors.warning} />
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={exams}
          renderItem={renderExam}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.warning} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrapper}>
                <Ionicons name="business-outline" size={40} color={Colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>No Halls Assigned</Text>
              <Text style={styles.emptyDesc}>
                You are not assigned to any exam halls yet. Contact your admin.
              </Text>
              <TouchableOpacity style={styles.retryBtn} onPress={loadAssignedExams}>
                <Ionicons name="refresh-outline" size={16} color={Colors.warning} />
                <Text style={styles.retryBtnText}>Refresh</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  // Header
  header: {
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.xl,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start' },
  headerTitle: { fontSize: FontSizes.xxl, fontWeight: FontWeights.bold, color: 'white' },
  headerSubtitle: { fontSize: FontSizes.sm, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  refreshBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
  },
  activeSessionBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: BorderRadius.full,
    paddingHorizontal: 12, paddingVertical: 5, alignSelf: 'flex-start',
  },
  activeBannerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'white' },
  activeSessionText: { color: 'white', fontSize: FontSizes.xs, fontWeight: FontWeights.semibold },
  // List
  listContent: { padding: Spacing.md, gap: Spacing.md, flexGrow: 1 },
  // Exam card
  examCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.xl,
    overflow: 'hidden', ...Shadow.md,
  },
  examHeader: {
    flexDirection: 'row', alignItems: 'flex-start',
    padding: Spacing.md, paddingBottom: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  examTitle: { fontSize: FontSizes.md, fontWeight: FontWeights.bold, color: Colors.textPrimary },
  examMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  examMetaText: { fontSize: FontSizes.xs, color: Colors.textMuted },
  examMetaSep: { color: Colors.textMuted, fontSize: FontSizes.xs },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: BorderRadius.full,
  },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  statusText: { fontSize: FontSizes.xs, fontWeight: FontWeights.semibold },
  // Hall row
  hallRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 4, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  hallRowActive: { backgroundColor: Colors.successFaded },
  hallLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  hallIconWrapper: {
    width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
  },
  hallName: { fontSize: FontSizes.sm, fontWeight: FontWeights.semibold, color: Colors.textPrimary },
  hallLocation: { fontSize: FontSizes.xs, color: Colors.textMuted, marginTop: 1 },
  hallRight: { flexShrink: 0 },
  activePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.successFaded, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.success + '40',
  },
  activePillDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  activePillText: { fontSize: FontSizes.xs, color: Colors.success, fontWeight: FontWeights.semibold },
  openPill: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  openPillText: { fontSize: FontSizes.sm, color: Colors.primary, fontWeight: FontWeights.semibold },
  // States
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.xl },
  loadingText: { fontSize: FontSizes.sm, color: Colors.textMuted },
  errorTitle: { fontSize: FontSizes.lg, fontWeight: FontWeights.semibold, color: Colors.textPrimary },
  errorDesc: { fontSize: FontSizes.sm, color: Colors.textMuted, textAlign: 'center' },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.warningFaded, paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.warning + '50',
  },
  retryBtnText: { fontSize: FontSizes.sm, fontWeight: FontWeights.semibold, color: Colors.warning },
  emptyState: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  emptyIconWrapper: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.surfaceVariant,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontSize: FontSizes.lg, fontWeight: FontWeights.semibold, color: Colors.textPrimary },
  emptyDesc: { fontSize: FontSizes.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20, paddingHorizontal: Spacing.lg },
});

export default InvigilatorHomeScreen;
