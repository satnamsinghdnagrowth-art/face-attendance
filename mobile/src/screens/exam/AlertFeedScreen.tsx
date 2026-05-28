import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { examApi } from '@/api/exam.api';
import { ExamAlert, ExamWithStats } from '@/api/exam.api';
import { Colors } from '@/constants/colors';
import { BorderRadius, FontSizes, FontWeights, Shadow, Spacing } from '@/constants/theme';

type SeverityFilter = 'all' | 'critical' | 'high' | 'medium' | 'low';

const SEVERITY_FILTERS: { key: SeverityFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'critical', label: 'Critical' },
  { key: 'high', label: 'High' },
  { key: 'medium', label: 'Medium' },
  { key: 'low', label: 'Low' },
];

const severityConfig: Record<string, { color: string; bg: string }> = {
  critical: { color: Colors.danger, bg: Colors.dangerFaded },
  high: { color: Colors.chartOrange, bg: '#FFF7ED' },
  medium: { color: Colors.warning, bg: Colors.warningFaded },
  low: { color: Colors.info, bg: Colors.infoFaded },
};

const alertTypeIcon: Record<string, keyof typeof Ionicons.glyphMap> = {
  proxy_suspect: 'person-remove',
  low_confidence: 'warning',
  no_show: 'time',
  multiple_entry: 'copy',
  unauthorized: 'ban',
};

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0, high: 1, medium: 2, low: 3,
};

const AlertFeedScreen: React.FC = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const tabBarHeight = 52 + Math.max(insets.bottom, 8);

  const [alerts, setAlerts] = useState<ExamAlert[]>([]);
  const [activeExams, setActiveExams] = useState<ExamWithStats[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const loadExams = useCallback(async () => {
    try {
      const res = await examApi.listExams();
      const responseData = res.data?.data;
      const exams: ExamWithStats[] = Array.isArray(responseData) ? responseData : (responseData as unknown as { exams: ExamWithStats[] })?.exams ?? [];
      setActiveExams(exams);
      if (exams.length > 0 && !selectedExamId) {
        setSelectedExamId(exams[0].id);
      }
    } catch {
      // silent
    }
  }, [selectedExamId]);

  const loadAlerts = useCallback(async (examId?: string | null) => {
    const id = examId || selectedExamId;
    if (!id) {
      setLoading(false);
      return;
    }
    try {
      const res = await examApi.getAlerts(id);
      const raw: ExamAlert[] = res.data?.data || res.data || [];
      // Sort: unresolved first, then severity, then newest
      const sorted = [...raw].sort((a, b) => {
        if (a.is_resolved !== b.is_resolved) return a.is_resolved ? 1 : -1;
        const sevDiff = (SEVERITY_ORDER[a.severity] ?? 4) - (SEVERITY_ORDER[b.severity] ?? 4);
        if (sevDiff !== 0) return sevDiff;
        return new Date(b.created_at || 0).getTime() -
               new Date(a.created_at || 0).getTime();
      });
      setAlerts(sorted);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [selectedExamId]);

  useEffect(() => {
    loadExams();
  }, []);

  useEffect(() => {
    if (selectedExamId) {
      setLoading(true);
      loadAlerts(selectedExamId);
    }
  }, [selectedExamId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAlerts(selectedExamId);
    setRefreshing(false);
  }, [loadAlerts, selectedExamId]);

  const handleResolve = useCallback(async (alert: ExamAlert) => {
    if (resolvingId) return;
    setResolvingId(alert.id);

    // Optimistic update
    setAlerts((prev) =>
      prev.map((a) => (a.id === alert.id ? { ...a, is_resolved: true } : a))
    );

    try {
      await examApi.resolveAlert(alert.id);
    } catch {
      // Rollback
      setAlerts((prev) =>
        prev.map((a) => (a.id === alert.id ? { ...a, is_resolved: false } : a))
      );
      Alert.alert('Error', 'Failed to resolve alert. Please try again.');
    } finally {
      setResolvingId(null);
    }
  }, [resolvingId]);

  const filteredAlerts = alerts.filter((a) => {
    if (severityFilter === 'all') return true;
    return a.severity === severityFilter;
  });

  const unresolvedCount = alerts.filter((a) => !a.is_resolved).length;

  const formatTimestamp = (ts?: string) => {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) +
      ' · ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const renderAlertCard = ({ item }: { item: ExamAlert }) => {
    const cfg = severityConfig[item.severity] || severityConfig.low;
    const icon = alertTypeIcon[item.alert_type || ''] || 'alert-circle';
    const isResolving = resolvingId === item.id;

    return (
      <View style={[styles.alertCard, item.is_resolved && styles.alertCardResolved]}>
        {/* Left severity bar */}
        <View style={[styles.severityBar, { backgroundColor: cfg.color }]} />

        <View style={styles.alertBody}>
          {/* Top row */}
          <View style={styles.alertTopRow}>
            <View style={[styles.alertTypeIcon, { backgroundColor: cfg.bg }]}>
              <Ionicons name={icon} size={16} color={cfg.color} />
            </View>
            <View style={[styles.severityBadge, { backgroundColor: cfg.bg }]}>
              <Text style={[styles.severityBadgeText, { color: cfg.color }]}>
                {item.severity?.toUpperCase()}
              </Text>
            </View>
            {item.is_resolved && (
              <View style={styles.resolvedBadge}>
                <Ionicons name="checkmark-circle" size={12} color={Colors.success} />
                <Text style={styles.resolvedText}>Resolved</Text>
              </View>
            )}
            <Text style={styles.alertTime}>{formatTimestamp(item.created_at)}</Text>
          </View>

          {/* Message */}
          <Text style={[styles.alertMessage, item.is_resolved && styles.alertMessageResolved]}>
            {item.message || item.alert_type?.replace(/_/g, ' ')}
          </Text>

          {/* Student name */}
          {item.student_name && (
            <View style={styles.studentRow}>
              <Ionicons name="person-outline" size={12} color={Colors.textMuted} />
              <Text style={styles.studentName}>{item.student_name}</Text>
            </View>
          )}

          {/* Actions */}
          {!item.is_resolved && (
            <View style={styles.alertActions}>
              <TouchableOpacity
                style={[styles.resolveBtn, isResolving && styles.resolveBtnDisabled]}
                onPress={() => handleResolve(item)}
                disabled={!!resolvingId}
              >
                {isResolving ? (
                  <ActivityIndicator size="small" color={Colors.success} />
                ) : (
                  <>
                    <Ionicons name="checkmark-outline" size={14} color={Colors.success} />
                    <Text style={styles.resolveBtnText}>Resolve</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.evidenceBtn}
                onPress={() => navigation.navigate('ExamReview' as never)}
              >
                <Ionicons name="eye-outline" size={14} color={Colors.primary} />
                <Text style={styles.evidenceBtnText}>View Evidence</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Alert Feed</Text>
          {unresolvedCount > 0 && (
            <View style={styles.unresolvedBadge}>
              <Text style={styles.unresolvedText}>{unresolvedCount}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
          <Ionicons name="refresh-outline" size={20} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Exam selector */}
      {activeExams.length > 1 && (
        <View style={styles.examSelectorBar}>
          <Ionicons name="document-text-outline" size={14} color={Colors.textMuted} />
          <Text style={styles.examSelectorLabel}>Exam:</Text>
          {activeExams.map((exam) => (
            <TouchableOpacity
              key={exam.id}
              style={[
                styles.examChip,
                selectedExamId === exam.id && styles.examChipActive,
              ]}
              onPress={() => setSelectedExamId(exam.id)}
            >
              <Text
                style={[
                  styles.examChipText,
                  selectedExamId === exam.id && styles.examChipTextActive,
                ]}
                numberOfLines={1}
              >
                {exam.exam_code || exam.title}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Severity filter tabs */}
      <View style={styles.filterRow}>
        {SEVERITY_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterTab, severityFilter === f.key && styles.filterTabActive]}
            onPress={() => setSeverityFilter(f.key)}
          >
            {f.key !== 'all' && (
              <View
                style={[
                  styles.filterDot,
                  { backgroundColor: severityConfig[f.key]?.color || Colors.textMuted },
                ]}
              />
            )}
            <Text
              style={[
                styles.filterTabText,
                severityFilter === f.key && styles.filterTabTextActive,
              ]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading alerts...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredAlerts}
          keyExtractor={(item) => item.id}
          renderItem={renderAlertCard}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: tabBarHeight + 16 },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrapper}>
                <Ionicons name="notifications-off-outline" size={36} color={Colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>No active alerts</Text>
              <Text style={styles.emptyDesc}>
                {severityFilter !== 'all'
                  ? `No ${severityFilter} severity alerts`
                  : 'All clear — no unresolved alerts'}
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

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerTitle: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
  },
  unresolvedBadge: {
    backgroundColor: Colors.danger,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    minWidth: 22,
    alignItems: 'center',
  },
  unresolvedText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    color: 'white',
  },
  refreshBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primaryFaded,
    alignItems: 'center',
    justifyContent: 'center',
  },

  examSelectorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    flexWrap: 'wrap',
  },
  examSelectorLabel: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  examChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceVariant,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  examChipActive: {
    backgroundColor: Colors.primaryFaded,
    borderColor: Colors.primary,
  },
  examChipText: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    maxWidth: 100,
  },
  examChipTextActive: {
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
  },

  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.xs,
  },
  filterTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceVariant,
  },
  filterTabActive: {
    backgroundColor: Colors.primaryFaded,
  },
  filterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  filterTabText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.medium,
    color: Colors.textSecondary,
  },
  filterTabTextActive: {
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
  },

  listContent: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },

  alertCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
    ...Shadow.sm,
  },
  alertCardResolved: {
    opacity: 0.6,
  },
  severityBar: {
    width: 4,
    flexShrink: 0,
  },
  alertBody: {
    flex: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  alertTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  alertTypeIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  severityBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  severityBadgeText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    letterSpacing: 0.5,
  },
  resolvedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.successFaded,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  resolvedText: {
    fontSize: FontSizes.xs,
    color: Colors.success,
    fontWeight: FontWeights.semibold,
  },
  alertTime: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    marginLeft: 'auto',
  },
  alertMessage: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.medium,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  alertMessageResolved: {
    color: Colors.textSecondary,
  },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  studentName: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  alertActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: 2,
  },
  resolveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.successFaded,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.success + '40',
  },
  resolveBtnDisabled: { opacity: 0.5 },
  resolveBtnText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    color: Colors.success,
  },
  evidenceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primaryFaded,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },
  evidenceBtnText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    color: Colors.primary,
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
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    gap: Spacing.md,
  },
  emptyIconWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.semibold,
    color: Colors.textPrimary,
  },
  emptyDesc: {
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});

export default AlertFeedScreen;
