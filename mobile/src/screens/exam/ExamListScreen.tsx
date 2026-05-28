import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';

import { examApi, Exam } from '@/api/exam.api';
import { Colors } from '@/constants/colors';
import { BorderRadius, FontSizes, FontWeights, Shadow, Spacing } from '@/constants/theme';

type FilterType = 'all' | 'scheduled' | 'active' | 'completed' | 'cancelled';

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
];

const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
  scheduled: { bg: Colors.primaryFaded, text: Colors.primary, label: 'Scheduled' },
  active: { bg: Colors.successFaded, text: Colors.success, label: 'Active' },
  completed: { bg: Colors.surfaceVariant, text: Colors.textSecondary, label: 'Completed' },
  cancelled: { bg: Colors.dangerFaded, text: Colors.danger, label: 'Cancelled' },
};

const ExamListScreen: React.FC = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const tabBarHeight = 52 + Math.max(insets.bottom, 8);

  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [error, setError] = useState<string | null>(null);

  const loadExams = useCallback(async () => {
    try {
      setError(null);
      const params = filter !== 'all' ? { status: filter } : undefined;
      const res = await examApi.listExams(params);
      const responseData = res.data?.data;
      setExams(Array.isArray(responseData) ? responseData : (responseData as { exams: Exam[] })?.exams ?? []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load exams');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    loadExams();
  }, [filter]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadExams();
    setRefreshing(false);
  }, [loadExams]);

  const renderStatusBadge = (status: string) => {
    const cfg = statusConfig[status] || statusConfig.scheduled;
    return (
      <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
        {status === 'active' && <View style={styles.activeDot} />}
        <Text style={[styles.statusBadgeText, { color: cfg.text }]}>{cfg.label}</Text>
      </View>
    );
  };

  const renderExamCard = ({ item }: { item: Exam }) => {
    const startDate = new Date(item.scheduled_start || '');
    const formattedDate = isNaN(startDate.getTime())
      ? 'Date TBD'
      : startDate.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
    const formattedTime = isNaN(startDate.getTime())
      ? ''
      : startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    return (
      <TouchableOpacity
        style={styles.examCard}
        activeOpacity={0.8}
        onPress={() => (navigation as any).navigate('ExamDetail', { examId: item.id })}
      >
        <View style={styles.examCardHeader}>
          <View style={styles.examCodeBadge}>
            <Text style={styles.examCodeText}>{item.exam_code || 'EXAM'}</Text>
          </View>
          {renderStatusBadge(item.status)}
        </View>

        <Text style={styles.examTitle} numberOfLines={2}>
          {item.title || 'Untitled Exam'}
        </Text>

        <View style={styles.examMeta}>
          <View style={styles.metaRow}>
            <Ionicons name="calendar-outline" size={13} color={Colors.textMuted} />
            <Text style={styles.metaText}>{formattedDate}</Text>
          </View>
          {formattedTime ? (
            <View style={styles.metaRow}>
              <Ionicons name="time-outline" size={13} color={Colors.textMuted} />
              <Text style={styles.metaText}>{formattedTime}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.examFooter}>
          <View style={styles.footerStat}>
            <Ionicons name="people-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.footerStatText}>
              {item.duration_mins} min
            </Text>
          </View>
          <View style={styles.footerStat}>
            <Ionicons name="business-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.footerStatText}>
              {item.status === 'active' ? 'Live' : item.exam_code}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} style={{ marginLeft: 'auto' }} />
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconWrapper}>
        <Ionicons name="document-text-outline" size={36} color={Colors.textMuted} />
      </View>
      <Text style={styles.emptyTitle}>No exams found</Text>
      <Text style={styles.emptyDesc}>
        {filter !== 'all'
          ? `No ${filter} exams at the moment`
          : 'Create your first exam to get started'}
      </Text>
      <TouchableOpacity
        style={styles.emptyAction}
        onPress={() => navigation.navigate('CreateExam' as never)}
      >
        <Ionicons name="add-circle-outline" size={16} color={Colors.primary} />
        <Text style={styles.emptyActionText}>Create Exam</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <LinearGradient
        colors={[Colors.primaryDark, Colors.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>Examinations</Text>
            <Text style={styles.headerSub}>Manage all exam sessions</Text>
          </View>
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => navigation.navigate('CreateExam' as never)}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={22} color="white" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* Filter chips */}
      <View style={styles.filterBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
              onPress={() => setFilter(f.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading exams...</Text>
        </View>
      ) : error ? (
        <View style={styles.emptyState}>
          <Ionicons name="alert-circle-outline" size={36} color={Colors.danger} />
          <Text style={styles.emptyTitle}>Failed to load</Text>
          <Text style={styles.emptyDesc}>{error}</Text>
          <TouchableOpacity style={styles.emptyAction} onPress={loadExams}>
            <Ionicons name="refresh-outline" size={16} color={Colors.primary} />
            <Text style={styles.emptyActionText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={exams}
          keyExtractor={(item) => item.id}
          renderItem={renderExamCard}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: tabBarHeight + 16 },
          ]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: 'white',
  },
  headerSub: {
    fontSize: FontSizes.sm,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },
  createButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  filterBar: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginTop: -1,
  },
  filterScroll: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceVariant,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primaryFaded,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: Colors.textSecondary,
  },
  filterChipTextActive: {
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
  },

  listContent: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },

  examCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadow.md,
  },
  examCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  examCodeBadge: {
    backgroundColor: Colors.primaryFaded,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  examCodeText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    color: Colors.primary,
    letterSpacing: 0.5,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.success,
  },
  statusBadgeText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },
  examTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  examMeta: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
    flexWrap: 'wrap',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  examFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  footerStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  footerStatText: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
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
    padding: Spacing.xl,
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
    lineHeight: 20,
  },
  emptyAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primaryFaded,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: BorderRadius.full,
  },
  emptyActionText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.primary,
  },
});

export default ExamListScreen;
