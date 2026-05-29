import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';

import { examApi, VerificationEvent } from '@/api/exam.api';
import { Colors } from '@/constants/colors';
import { BorderRadius, FontSizes, FontWeights, Shadow, Spacing } from '@/constants/theme';
import { ExamStackParamList } from '@/navigation/types';

type FilterType = 'all' | 'pending' | 'reviewed';

const VERDICT_CONFIG: Record<string, { color: string; bg: string }> = {
  flagged:       { color: Colors.warning, bg: Colors.warningFaded },
  rejected:      { color: Colors.danger,  bg: Colors.dangerFaded  },
  proxy_suspect: { color: Colors.danger,  bg: Colors.dangerFaded  },
};

const FlaggedCasesScreen: React.FC = () => {
  const navigation = useNavigation();
  // route.params is undefined when rendered as a tab (ExamReview) — handle gracefully
  const route = useRoute();
  const examId: string | undefined = (route.params as { examId?: string } | undefined)?.examId;

  const [events, setEvents] = useState<VerificationEvent[]>([]);
  const [filter, setFilter] = useState<FilterType>('pending');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  // When examId is provided (stack context), load events for that exam.
  // When no examId (tab context), load alerts from all active exams to surface
  // flagged/rejected events across the board.
  const loadEvents = useCallback(async () => {
    try {
      if (examId) {
        // Stack context — specific exam
        const alertsRes = await examApi.getAlerts(examId);
        const alertEvents: VerificationEvent[] = alertsRes.data.data
          .filter((a) => a.event_id && a.student_id)
          .map((a) => ({
            id: a.event_id ?? a.id,
            exam_session_id: '',
            exam_id: a.exam_id,
            student_id: a.student_id ?? '',
            student_name: a.student_name ?? 'Unknown',
            scan_type: 'entry',
            confidence_score: 0,
            verdict: a.alert_type === 'proxy_suspect' ? 'proxy_suspect' : 'flagged',
            scanned_at: a.created_at,
          }));
        setEvents(alertEvents);
      } else {
        // Tab context — load flags from all active exams
        const examsRes = await examApi.listExams({ status: 'active' });
        const rd = examsRes.data.data;
        const activeExams = Array.isArray(rd) ? rd : (rd as unknown as { exams: { id: string }[] })?.exams ?? [];

        const allAlerts: VerificationEvent[] = [];
        await Promise.all(
          (activeExams as { id: string }[]).map(async (exam) => {
            try {
              const alertsRes = await examApi.getAlerts(exam.id);
              const flagAlerts = alertsRes.data.data
                .filter((a) => !a.is_resolved && a.student_id)
                .map((a) => ({
                  id: a.event_id ?? a.id,
                  exam_session_id: '',
                  exam_id: a.exam_id,
                  student_id: a.student_id ?? '',
                  student_name: a.student_name ?? 'Unknown',
                  scan_type: 'entry',
                  confidence_score: 0,
                  verdict: a.alert_type === 'proxy_suspect' ? 'proxy_suspect' : 'flagged',
                  scanned_at: a.created_at,
                }));
              allAlerts.push(...flagAlerts);
            } catch {
              // skip failed exams
            }
          })
        );
        setEvents(allAlerts);
      }
    } catch {
      // keep previous data
    } finally {
      setIsLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadEvents();
    setRefreshing(false);
  }, [loadEvents]);

  const handleReview = useCallback(
    (event: VerificationEvent, decision: 'confirmed_proxy' | 'false_alarm') => {
      Alert.alert(
        decision === 'confirmed_proxy' ? 'Confirm Proxy' : 'Mark as False Alarm',
        decision === 'confirmed_proxy'
          ? `Are you sure you want to confirm ${event.student_name} as a proxy case? This will be logged for examination board review.`
          : `Mark this flagged event for ${event.student_name} as a false alarm?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Confirm',
            style: decision === 'confirmed_proxy' ? 'destructive' : 'default',
            onPress: async () => {
              setReviewingId(event.id);
              try {
                await examApi.reviewEvent(event.id, {
                  review_decision: decision,
                  review_note: '',
                });
                setEvents((prev) =>
                  prev.map((e) =>
                    e.id === event.id ? { ...e, review_decision: decision } : e
                  )
                );
              } catch {
                Alert.alert('Error', 'Failed to submit review. Please try again.');
              } finally {
                setReviewingId(null);
              }
            },
          },
        ]
      );
    },
    []
  );

  const filtered = events.filter((e) => {
    if (filter === 'pending') return !e.review_decision;
    if (filter === 'reviewed') return !!e.review_decision;
    return true;
  });

  const pendingCount = events.filter((e) => !e.review_decision).length;

  const renderEvent = useCallback(
    ({ item }: { item: VerificationEvent }) => {
      const cfg = VERDICT_CONFIG[item.verdict] ?? { color: Colors.textMuted, bg: Colors.surfaceVariant };
      const isReviewing = reviewingId === item.id;
      const isReviewed = !!item.review_decision;

      return (
        <View style={[styles.eventCard, { borderLeftColor: cfg.color }]}>
          {/* Header row */}
          <View style={styles.eventHeader}>
            <View style={[styles.verdictBadge, { backgroundColor: cfg.bg }]}>
              <Ionicons
                name={item.verdict === 'flagged' ? 'warning' : 'person-remove'}
                size={12}
                color={cfg.color}
              />
              <Text style={[styles.verdictText, { color: cfg.color }]}>
                {item.verdict.toUpperCase().replace('_', ' ')}
              </Text>
            </View>
            <Text style={styles.eventTime}>
              {new Date(item.scanned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>

          {/* Student info */}
          <Text style={styles.studentName}>{item.student_name}</Text>
          <View style={styles.eventMeta}>
            <Text style={styles.metaText}>Confidence: {(item.confidence_score * 100).toFixed(1)}%</Text>
            <Text style={styles.metaDot}>·</Text>
            <Text style={styles.metaText}>{item.scan_type === 'entry' ? 'Entry Scan' : 'Re-verify'}</Text>
          </View>

          {/* Evidence indicators */}
          <View style={styles.evidenceRow}>
            <View style={[styles.evidencePill, { backgroundColor: Colors.primaryFaded }]}>
              <Ionicons name="camera-outline" size={12} color={Colors.primary} />
              <Text style={[styles.evidenceText, { color: Colors.primary }]}>Face Photo</Text>
            </View>
            {item.id_card_image_url && (
              <View style={[styles.evidencePill, { backgroundColor: Colors.secondaryFaded }]}>
                <Ionicons name="card-outline" size={12} color={Colors.secondary} />
                <Text style={[styles.evidenceText, { color: Colors.secondary }]}>ID Card</Text>
              </View>
            )}
          </View>

          {/* Review actions */}
          {isReviewed ? (
            <View style={[
              styles.reviewedBanner,
              {
                backgroundColor: item.review_decision === 'confirmed_proxy'
                  ? Colors.dangerFaded : Colors.successFaded,
              },
            ]}>
              <Ionicons
                name={item.review_decision === 'confirmed_proxy' ? 'alert-circle' : 'checkmark-circle'}
                size={16}
                color={item.review_decision === 'confirmed_proxy' ? Colors.danger : Colors.success}
              />
              <Text style={[
                styles.reviewedText,
                { color: item.review_decision === 'confirmed_proxy' ? Colors.danger : Colors.success },
              ]}>
                {item.review_decision === 'confirmed_proxy' ? 'Confirmed Proxy' : 'False Alarm'}
              </Text>
            </View>
          ) : (
            <View style={styles.reviewActions}>
              <TouchableOpacity
                style={[styles.reviewBtn, styles.proxyBtn, isReviewing && styles.btnDisabled]}
                onPress={() => handleReview(item, 'confirmed_proxy')}
                disabled={isReviewing}
              >
                {isReviewing ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Ionicons name="person-remove-outline" size={14} color="white" />
                )}
                <Text style={styles.proxyBtnText}>Confirm Proxy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.reviewBtn, styles.falseAlarmBtn, isReviewing && styles.btnDisabled]}
                onPress={() => handleReview(item, 'false_alarm')}
                disabled={isReviewing}
              >
                {isReviewing ? (
                  <ActivityIndicator size="small" color={Colors.success} />
                ) : (
                  <Ionicons name="checkmark-circle-outline" size={14} color={Colors.success} />
                )}
                <Text style={styles.falseAlarmText}>False Alarm</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      );
    },
    [reviewingId, handleReview]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Review Cases</Text>
          <Text style={styles.headerSubtitle}>{events.length} total events</Text>
        </View>
        {pendingCount > 0 && (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeText}>{pendingCount} pending</Text>
          </View>
        )}
      </View>

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {(['all', 'pending', 'reviewed'] as FilterType[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.chip, filter === f && styles.chipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading flagged cases...</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderEvent}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.danger} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="shield-checkmark-outline" size={56} color={Colors.success} />
              <Text style={styles.emptyTitle}>No Cases to Review</Text>
              <Text style={styles.emptyDesc}>
                {filter === 'pending' ? 'All flagged cases have been reviewed' : 'No verification events found'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  loadingText: { color: Colors.textMuted, fontSize: FontSizes.sm },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Colors.surfaceVariant, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: FontSizes.xl, fontWeight: FontWeights.bold, color: Colors.textPrimary },
  headerSubtitle: { fontSize: FontSizes.sm, color: Colors.textSecondary },
  pendingBadge: {
    marginLeft: 'auto', backgroundColor: Colors.dangerFaded,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: BorderRadius.full,
  },
  pendingBadgeText: { fontSize: FontSizes.xs, color: Colors.danger, fontWeight: FontWeights.bold },
  filterRow: {
    flexDirection: 'row', padding: Spacing.sm, gap: Spacing.sm,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  chip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceVariant, borderWidth: 1, borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.dangerFaded, borderColor: Colors.danger },
  chipText: { fontSize: FontSizes.xs, color: Colors.textSecondary, fontWeight: FontWeights.medium },
  chipTextActive: { color: Colors.danger, fontWeight: FontWeights.semibold },
  listContent: { padding: Spacing.md, gap: Spacing.md, flexGrow: 1 },
  eventCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.md, borderLeftWidth: 4, gap: Spacing.sm, ...Shadow.sm,
  },
  eventHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  verdictBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.full,
  },
  verdictText: { fontSize: FontSizes.xs, fontWeight: FontWeights.bold },
  eventTime: { fontSize: FontSizes.xs, color: Colors.textMuted },
  studentName: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold, color: Colors.textPrimary },
  eventMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: FontSizes.xs, color: Colors.textSecondary },
  metaDot: { color: Colors.textMuted },
  evidenceRow: { flexDirection: 'row', gap: Spacing.sm },
  evidencePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.full,
  },
  evidenceText: { fontSize: FontSizes.xs, fontWeight: FontWeights.medium },
  reviewActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: 4 },
  reviewBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: BorderRadius.md,
  },
  proxyBtn: { backgroundColor: Colors.danger },
  proxyBtnText: { color: 'white', fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  falseAlarmBtn: {
    backgroundColor: Colors.successFaded, borderWidth: 1, borderColor: Colors.success + '60',
  },
  falseAlarmText: { color: Colors.success, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  reviewedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    padding: Spacing.sm, borderRadius: BorderRadius.md, marginTop: 4,
  },
  reviewedText: { fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  emptyState: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.sm },
  emptyTitle: { fontSize: FontSizes.lg, fontWeight: FontWeights.semibold, color: Colors.textPrimary },
  emptyDesc: { fontSize: FontSizes.sm, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: Spacing.xl },
  btnDisabled: { opacity: 0.6 },
});

export default FlaggedCasesScreen;
