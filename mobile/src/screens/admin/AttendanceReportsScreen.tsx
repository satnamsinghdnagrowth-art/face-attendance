import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  FlatList,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { AttendanceChart } from '@/components/charts/AttendanceChart';
import { Button } from '@/components/common/Button';
import { Avatar } from '@/components/common/Avatar';
import { Colors } from '@/constants/colors';
import { BorderRadius, FontSizes, FontWeights, Shadow, Spacing } from '@/constants/theme';
import { attendanceApi } from '@/api/attendance.api';
import { formatPercentage } from '@/utils/helpers';

interface Defaulter {
  student: { id: string; name: string; email?: string };
  percentage: number;
}

type PeriodFilter = '7days' | '30days' | '3months';

const AttendanceReportsScreen: React.FC = () => {
  const [period, setPeriod] = useState<PeriodFilter>('30days');
  const [trendData, setTrendData] = useState<{ label: string; value: number }[]>([]);
  const [defaulters, setDefaulters] = useState<Defaulter[]>([]);
  const [summaryStats, setSummaryStats] = useState({
    avgAttendance: 0,
    totalSessions: 0,
    topClass: '',
    bottomClass: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const getFrom = useCallback((p: PeriodFilter) => {
    const d = new Date();
    if (p === '7days') d.setDate(d.getDate() - 7);
    else if (p === '30days') d.setDate(d.getDate() - 30);
    else d.setMonth(d.getMonth() - 3);
    return d.toISOString().split('T')[0];
  }, []);

  const loadReports = useCallback(async () => {
    setIsLoading(true);
    try {
      const from = getFrom(period);
      const [trendRes, defaultersRes] = await Promise.all([
        attendanceApi.getAttendanceTrend({ from }),
        attendanceApi.getDefaulters({ threshold: 75 }),
      ]);

      const trend = trendRes.data.data;
      setTrendData(
        trend.map((d) => ({
          label: new Date(d.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
          value: d.percentage,
        }))
      );

      setDefaulters(defaultersRes.data.data as Defaulter[]);

      const avg =
        trend.length > 0
          ? trend.reduce((sum, d) => sum + d.percentage, 0) / trend.length
          : 0;
      setSummaryStats((prev) => ({
        ...prev,
        avgAttendance: avg,
        totalSessions: trend.length,
      }));
    } catch (error) {
      console.error('Failed to load reports:', error);
    } finally {
      setIsLoading(false);
    }
  }, [period, getFrom]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadReports();
    setRefreshing(false);
  }, [loadReports]);

  const handleExport = useCallback(async (format: 'pdf' | 'csv') => {
    try {
      await attendanceApi.exportAttendance({ from: getFrom(period), format });
      Alert.alert('Success', `Report exported as ${format.toUpperCase()}`);
    } catch {
      Alert.alert('Error', 'Export failed. Please try again.');
    }
  }, [period, getFrom]);

  const renderDefaulter = useCallback(({ item }: { item: Defaulter }) => (
    <View style={styles.defaulterCard}>
      <Avatar name={item.student.name} size={36} />
      <View style={styles.defaulterInfo}>
        <Text style={styles.defaulterName}>{item.student.name}</Text>
        <View style={styles.defaulterProgressRow}>
          <View style={styles.defaulterProgressTrack}>
            <View
              style={[
                styles.defaulterProgressFill,
                {
                  width: `${Math.min(item.percentage, 100)}%`,
                  backgroundColor: item.percentage < 50 ? Colors.danger : Colors.warning,
                },
              ]}
            />
          </View>
          <Text style={[styles.defaulterPercentage, { color: item.percentage < 50 ? Colors.danger : Colors.warning }]}>
            {formatPercentage(item.percentage)}
          </Text>
        </View>
      </View>
      <View style={[
        styles.riskBadge,
        { backgroundColor: item.percentage < 50 ? Colors.dangerFaded : Colors.warningFaded }
      ]}>
        <Text style={[styles.riskText, { color: item.percentage < 50 ? Colors.danger : Colors.warning }]}>
          {item.percentage < 50 ? 'High Risk' : 'At Risk'}
        </Text>
      </View>
    </View>
  ), []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.success} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Attendance Reports</Text>
          <Text style={styles.headerSubtitle}>Comprehensive analysis</Text>
        </View>

        {/* Period filter */}
        <View style={styles.periodFilter}>
          {([
            { id: '7days', label: 'Last 7 Days' },
            { id: '30days', label: 'Last 30 Days' },
            { id: '3months', label: 'Last 3 Months' },
          ] as { id: PeriodFilter; label: string }[]).map(({ id, label }) => (
            <TouchableOpacity
              key={id}
              style={[styles.periodChip, period === id && styles.periodChipActive]}
              onPress={() => setPeriod(id)}
            >
              <Text style={[styles.periodChipText, period === id && styles.periodChipTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Summary stats */}
        <View style={styles.summaryGrid}>
          {[
            {
              label: 'Avg. Attendance',
              value: formatPercentage(summaryStats.avgAttendance),
              icon: 'bar-chart-outline',
              color: summaryStats.avgAttendance >= 75 ? Colors.success : Colors.danger,
            },
            {
              label: 'Data Points',
              value: summaryStats.totalSessions,
              icon: 'calendar-outline',
              color: Colors.primary,
            },
            {
              label: 'Defaulters',
              value: defaulters.length,
              icon: 'warning-outline',
              color: defaulters.length > 0 ? Colors.danger : Colors.success,
            },
          ].map(({ label, value, icon, color }) => (
            <View key={label} style={styles.summaryCard}>
              <View style={[styles.summaryIconWrapper, { backgroundColor: color + '15' }]}>
                <Ionicons name={icon as never} size={22} color={color} />
              </View>
              <Text style={[styles.summaryValue, { color }]}>{value}</Text>
              <Text style={styles.summaryLabel}>{label}</Text>
            </View>
          ))}
        </View>

        {/* Trend chart */}
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Attendance Trend</Text>
          {isLoading ? (
            <View style={styles.chartLoading}>
              <Text style={styles.chartLoadingText}>Loading...</Text>
            </View>
          ) : trendData.length > 0 ? (
            <AttendanceChart data={trendData} type="line" height={200} color={Colors.primary} />
          ) : (
            <View style={styles.chartEmpty}>
              <Ionicons name="bar-chart-outline" size={36} color={Colors.textMuted} />
              <Text style={styles.chartEmptyText}>No data for this period</Text>
            </View>
          )}
        </View>

        {/* Defaulters list */}
        {defaulters.length > 0 && (
          <View style={styles.defaultersSection}>
            <View style={styles.defaultersHeader}>
              <View style={styles.defaultersTitleRow}>
                <Ionicons name="warning" size={18} color={Colors.danger} />
                <Text style={styles.defaultersTitle}>Students Below 75%</Text>
              </View>
              <Text style={styles.defaultersCount}>{defaulters.length} students</Text>
            </View>

            {defaulters.map((d) => (
              <View key={d.student.id}>
                {renderDefaulter({ item: d })}
              </View>
            ))}
          </View>
        )}

        {/* Export options */}
        <View style={styles.exportCard}>
          <Text style={styles.exportTitle}>Export Report</Text>
          <View style={styles.exportButtons}>
            <Button
              title="PDF"
              onPress={() => handleExport('pdf')}
              variant="primary"
              size="md"
              icon="document-outline"
              style={styles.exportBtn}
            />
            <Button
              title="CSV"
              onPress={() => handleExport('csv')}
              variant="outline"
              size="md"
              icon="download-outline"
              style={styles.exportBtn}
            />
          </View>
        </View>
      </ScrollView>
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
  headerTitle: { fontSize: FontSizes.xl, fontWeight: FontWeights.bold, color: Colors.textPrimary },
  headerSubtitle: { fontSize: FontSizes.sm, color: Colors.textSecondary, marginTop: 2 },
  periodFilter: {
    flexDirection: 'row',
    padding: Spacing.md,
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  periodChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceVariant,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  periodChipActive: { backgroundColor: Colors.primaryFaded, borderColor: Colors.primary },
  periodChipText: { fontSize: FontSizes.xs, color: Colors.textSecondary, fontWeight: FontWeights.medium },
  periodChipTextActive: { color: Colors.primary, fontWeight: FontWeights.semibold },
  summaryGrid: {
    flexDirection: 'row',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    gap: 6,
    ...Shadow.sm,
  },
  summaryIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryValue: { fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  summaryLabel: { fontSize: FontSizes.xs, color: Colors.textSecondary, textAlign: 'center' },
  chartCard: {
    marginHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.md,
  },
  chartTitle: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold, color: Colors.textPrimary, marginBottom: Spacing.md },
  chartLoading: { height: 160, alignItems: 'center', justifyContent: 'center' },
  chartLoadingText: { color: Colors.textMuted },
  chartEmpty: {
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceVariant,
    borderRadius: BorderRadius.md,
  },
  chartEmptyText: { color: Colors.textMuted },
  defaultersSection: {
    marginHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
    ...Shadow.sm,
  },
  defaultersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  defaultersTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  defaultersTitle: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold, color: Colors.danger },
  defaultersCount: { fontSize: FontSizes.sm, color: Colors.textSecondary },
  defaulterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  defaulterInfo: { flex: 1 },
  defaulterName: { fontSize: FontSizes.sm, fontWeight: FontWeights.semibold, color: Colors.textPrimary, marginBottom: 4 },
  defaulterProgressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  defaulterProgressTrack: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  defaulterProgressFill: { height: '100%', borderRadius: 3 },
  defaulterPercentage: { fontSize: FontSizes.sm, fontWeight: FontWeights.bold, minWidth: 40, textAlign: 'right' },
  riskBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  riskText: { fontSize: FontSizes.xs, fontWeight: FontWeights.semibold },
  exportCard: {
    marginHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.xxl,
    ...Shadow.sm,
  },
  exportTitle: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold, color: Colors.textPrimary, marginBottom: Spacing.md },
  exportButtons: { flexDirection: 'row', gap: Spacing.sm },
  exportBtn: { flex: 1 },
});

export default AttendanceReportsScreen;
