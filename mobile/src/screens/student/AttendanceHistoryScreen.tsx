import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useAppDispatch, useAppSelector } from '@/store';
import { loadHistoryThunk } from '@/store/slices/attendance.slice';
import { StatusBadge } from '@/components/common/StatusBadge';
import { EmptyState } from '@/components/common/EmptyState';
import { InlineLoader } from '@/components/common/LoadingOverlay';
import { Colors } from '@/constants/colors';
import { BorderRadius, FontSizes, FontWeights, Shadow, Spacing } from '@/constants/theme';
import { AttendanceRecord } from '@/types';
import { formatDate, formatTime, formatPercentage } from '@/utils/helpers';

type FilterPeriod = 'week' | 'month' | 'all';
type FilterStatus = 'all' | 'present' | 'absent' | 'late' | 'leave';

const AttendanceHistoryScreen: React.FC = () => {
  const dispatch = useAppDispatch();
  const { history, isLoading, historyHasMore } = useAppSelector((state) => state.attendance);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<FilterPeriod>('month');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [search, setSearch] = useState('');

  const getDateRange = useCallback((p: FilterPeriod) => {
    const now = new Date();
    if (p === 'week') {
      const from = new Date(now);
      from.setDate(now.getDate() - 7);
      return { from: from.toISOString().split('T')[0] };
    }
    if (p === 'month') {
      const from = new Date(now);
      from.setMonth(now.getMonth() - 1);
      return { from: from.toISOString().split('T')[0] };
    }
    return {};
  }, []);

  const loadHistory = useCallback(
    (refresh = false) => {
      const range = getDateRange(period);
      dispatch(
        loadHistoryThunk({
          page: refresh ? 1 : undefined,
          limit: 20,
          ...range,
          refresh,
        })
      );
    },
    [dispatch, period, getDateRange]
  );

  useEffect(() => {
    loadHistory(true);
  }, [period]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    loadHistory(true);
    setRefreshing(false);
  }, [loadHistory]);

  const filteredHistory = useMemo(() => {
    return history.filter((record) => {
      const matchesStatus = statusFilter === 'all' || record.status === statusFilter;
      const matchesSearch =
        !search ||
        (record.subject_name || '').toLowerCase().includes(search.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [history, statusFilter, search]);

  const summaryStats = useMemo(() => {
    const total = filteredHistory.length;
    const present = filteredHistory.filter((r) => r.status === 'present').length;
    const absent = filteredHistory.filter((r) => r.status === 'absent').length;
    const late = filteredHistory.filter((r) => r.status === 'late').length;
    const percentage = total > 0 ? ((present + late * 0.5) / total) * 100 : 0;
    return { total, present, absent, late, percentage };
  }, [filteredHistory]);

  const renderRecord = useCallback(({ item }: { item: AttendanceRecord }) => (
    <View style={styles.recordCard}>
      <View style={styles.recordLeft}>
        <View
          style={[
            styles.statusDot,
            {
              backgroundColor:
                item.status === 'present'
                  ? Colors.success
                  : item.status === 'absent'
                  ? Colors.danger
                  : item.status === 'late'
                  ? Colors.warning
                  : Colors.secondary,
            },
          ]}
        />
        <View style={styles.recordInfo}>
          <Text style={styles.recordSubject} numberOfLines={1}>
            {item.subject_name || 'Subject'}
          </Text>
          <Text style={styles.recordDate}>{formatDate(item.date)}</Text>
          {item.marked_at && (
            <Text style={styles.recordTime}>
              <Ionicons name="time-outline" size={11} color={Colors.textMuted} />
              {' Marked at '}
              {formatTime(item.marked_at)}
            </Text>
          )}
          {item.confidence_score && (
            <Text style={styles.recordConfidence}>
              {Math.round(item.confidence_score * 100)}% confidence
            </Text>
          )}
        </View>
      </View>
      <StatusBadge status={item.status} size="sm" />
    </View>
  ), []);

  const renderFooter = useCallback(() => {
    if (!isLoading) return null;
    return <InlineLoader size="small" message="Loading..." />;
  }, [isLoading]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Attendance History</Text>
      </View>

      {/* Summary bar */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: Colors.success }]}>{summaryStats.present}</Text>
          <Text style={styles.summaryLabel}>Present</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: Colors.danger }]}>{summaryStats.absent}</Text>
          <Text style={styles.summaryLabel}>Absent</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: Colors.warning }]}>{summaryStats.late}</Text>
          <Text style={styles.summaryLabel}>Late</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text
            style={[
              styles.summaryValue,
              { color: summaryStats.percentage >= 75 ? Colors.success : Colors.danger },
            ]}
          >
            {formatPercentage(summaryStats.percentage, 0)}
          </Text>
          <Text style={styles.summaryLabel}>Rate</Text>
        </View>
      </View>

      {/* Filters */}
      <View style={styles.filtersContainer}>
        {/* Period filter */}
        <View style={styles.filterRow}>
          {(['week', 'month', 'all'] as FilterPeriod[]).map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.filterChip, period === p && styles.filterChipActive]}
              onPress={() => setPeriod(p)}
            >
              <Text style={[styles.filterChipText, period === p && styles.filterChipTextActive]}>
                {p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : 'All Time'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Status filter */}
        <View style={styles.filterRow}>
          {(['all', 'present', 'absent', 'late', 'leave'] as FilterStatus[]).map((s) => (
            <TouchableOpacity
              key={s}
              style={[
                styles.statusChip,
                statusFilter === s && { backgroundColor: Colors.primary + '15', borderColor: Colors.primary },
              ]}
              onPress={() => setStatusFilter(s)}
            >
              <Text
                style={[
                  styles.statusChipText,
                  statusFilter === s && { color: Colors.primary },
                ]}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={18} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search by subject..."
            placeholderTextColor={Colors.textMuted}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <FlatList
        data={filteredHistory}
        renderItem={renderRecord}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
        onEndReached={() => {
          if (historyHasMore && !isLoading) {
            loadHistory(false);
          }
        }}
        onEndReachedThreshold={0.3}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState
              icon="calendar-outline"
              title="No Records Found"
              message={search ? 'Try a different search term' : 'No attendance records for this period'}
              actionLabel={search ? 'Clear Search' : undefined}
              onAction={search ? () => setSearch('') : undefined}
            />
          ) : null
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
  },
  summaryBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, backgroundColor: Colors.border },
  summaryValue: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
  },
  summaryLabel: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  filtersContainer: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
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
    color: Colors.textSecondary,
    fontWeight: FontWeights.medium,
  },
  filterChipTextActive: {
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
  },
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceVariant,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statusChipText: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceVariant,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    marginHorizontal: Spacing.md,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.textPrimary,
    paddingVertical: 4,
  },
  listContent: {
    padding: Spacing.md,
    flexGrow: 1,
  },
  recordCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadow.sm,
  },
  recordLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    gap: Spacing.sm,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 5,
  },
  recordInfo: {
    flex: 1,
  },
  recordSubject: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.textPrimary,
  },
  recordDate: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  recordTime: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    marginTop: 1,
  },
  recordConfidence: {
    fontSize: FontSizes.xs,
    color: Colors.info,
    marginTop: 1,
  },
});

export default AttendanceHistoryScreen;
