import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  Share,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';

import { AttendanceChart } from '@/components/charts/AttendanceChart';
import { Avatar } from '@/components/common/Avatar';
import { Colors } from '@/constants/colors';
import { BorderRadius, FontSizes, FontWeights, Shadow, Spacing } from '@/constants/theme';
import { attendanceApi } from '@/api/attendance.api';
import { API_BASE_URL } from '@/api/client';
import { formatPercentage } from '@/utils/helpers';

interface Defaulter {
  student: { id: string; name: string; email?: string };
  percentage: number;
}

type PeriodFilter = '7days' | '30days' | '3months';

const PERIOD_OPTIONS: { id: PeriodFilter; label: string }[] = [
  { id: '7days', label: 'Last 7 Days' },
  { id: '30days', label: 'Last 30 Days' },
  { id: '3months', label: 'Last 3 Months' },
];

const AttendanceReportsScreen: React.FC = () => {
  const [period, setPeriod] = useState<PeriodFilter>('30days');
  const [trendData, setTrendData] = useState<{ label: string; value: number }[]>([]);
  const [defaulters, setDefaulters] = useState<Defaulter[]>([]);
  const [summaryStats, setSummaryStats] = useState({ avgAttendance: 0, totalSessions: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
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
    setHasError(false);
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
      setSummaryStats({ avgAttendance: avg, totalSessions: trend.length });
    } catch {
      setHasError(true);
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
    setIsExporting(true);
    try {
      const token = await SecureStore.getItemAsync('access_token');
      const from = getFrom(period);
      const params = new URLSearchParams({ from, format });

      const downloadUrl = `${API_BASE_URL}/attendance/export?${params.toString()}`;
      const filename = `attendance_report_${format}_${Date.now()}.${format}`;
      const fileUri = `${(FileSystem as unknown as { cacheDirectory: string }).cacheDirectory ?? ''}${filename}`;

      const result = await FileSystem.downloadAsync(downloadUrl, fileUri, {
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });

      if (result.status === 200) {
        const shareUri =
          Platform.OS === 'android'
            ? await FileSystem.getContentUriAsync(result.uri)
            : result.uri;
        await Share.share({
          url: shareUri,
          title: `Attendance Report.${format.toUpperCase()}`,
          message: `Attendance report exported as ${format.toUpperCase()}`,
        });
      } else {
        Alert.alert('Export Failed', 'Could not generate report. Please try again.');
      }
    } catch {
      Alert.alert('Export Failed', 'Failed to export. Please check your connection.');
    } finally {
      setIsExporting(false);
    }
  }, [period, getFrom]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.success} />
        }
        contentContainerStyle={{ paddingBottom: Spacing.xxl }}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Attendance Reports</Text>
          <Text style={styles.headerSubtitle}>Comprehensive analysis</Text>
        </View>

        {/* Period filter */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.periodFilter}
        >
          {PERIOD_OPTIONS.map(({ id, label }) => (
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
        </ScrollView>

        {/* Error state */}
        {hasError && !isLoading && (
          <View style={styles.errorBanner}>
            <Ionicons name="cloud-offline-outline" size={20} color={Colors.danger} />
            <Text style={styles.errorText}>Unable to load data. Pull down to retry.</Text>
          </View>
        )}

        {/* Summary stats */}
        <View style={styles.summaryGrid}>
          {[
            {
              label: 'Avg. Attendance',
              value: isLoading ? '...' : formatPercentage(summaryStats.avgAttendance),
              icon: 'bar-chart-outline',
              color: summaryStats.avgAttendance >= 75 ? Colors.success : Colors.danger,
            },
            {
              label: 'Data Points',
              value: isLoading ? '...' : String(summaryStats.totalSessions),
              icon: 'calendar-outline',
              color: Colors.primary,
            },
            {
              label: 'Defaulters',
              value: isLoading ? '...' : String(defaulters.length),
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
            <View style={styles.chartPlaceholder}>
              <ActivityIndicator size="large" color={Colors.success} />
              <Text style={styles.chartPlaceholderText}>Loading data...</Text>
            </View>
          ) : trendData.length > 0 ? (
            <AttendanceChart data={trendData} type="line" height={200} color={Colors.primary} />
          ) : (
            <View style={styles.chartPlaceholder}>
              <Ionicons name="bar-chart-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.chartPlaceholderText}>No data for this period</Text>
            </View>
          )}
        </View>

        {/* Defaulters list */}
        {defaulters.length > 0 && (
          <View style={styles.defaultersSection}>
            <View style={styles.defaultersHeader}>
              <View style={styles.defaultersTitleRow}>
                <View style={styles.warningIconWrapper}>
                  <Ionicons name="warning" size={16} color={Colors.danger} />
                </View>
                <Text style={styles.defaultersTitle}>Students Below 75%</Text>
              </View>
              <View style={styles.defaultersCountBadge}>
                <Text style={styles.defaultersCount}>{defaulters.length}</Text>
              </View>
            </View>

            {defaulters.map((d) => (
              <View key={d.student.id} style={styles.defaulterCard}>
                <Avatar name={d.student.name} size={38} />
                <View style={styles.defaulterInfo}>
                  <Text style={styles.defaulterName}>{d.student.name}</Text>
                  <View style={styles.defaulterProgressRow}>
                    <View style={styles.defaulterProgressTrack}>
                      <View
                        style={[
                          styles.defaulterProgressFill,
                          {
                            width: `${Math.min(d.percentage, 100)}%` as `${number}%`,
                            backgroundColor: d.percentage < 50 ? Colors.danger : Colors.warning,
                          },
                        ]}
                      />
                    </View>
                    <Text
                      style={[
                        styles.defaulterPercentage,
                        { color: d.percentage < 50 ? Colors.danger : Colors.warning },
                      ]}
                    >
                      {formatPercentage(d.percentage)}
                    </Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.riskBadge,
                    { backgroundColor: d.percentage < 50 ? Colors.dangerFaded : Colors.warningFaded },
                  ]}
                >
                  <Text
                    style={[
                      styles.riskText,
                      { color: d.percentage < 50 ? Colors.danger : Colors.warning },
                    ]}
                  >
                    {d.percentage < 50 ? 'High Risk' : 'At Risk'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Export options */}
        <View style={styles.exportCard}>
          <View style={styles.exportHeader}>
            <Ionicons name="download-outline" size={20} color={Colors.textPrimary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.exportTitle}>Export Report</Text>
              <Text style={styles.exportSubtitle}>Download attendance data for this period</Text>
            </View>
          </View>
          <View style={styles.exportButtons}>
            <TouchableOpacity
              style={[styles.exportBtn, styles.exportBtnPrimary, isExporting && styles.exportBtnDisabled]}
              onPress={() => handleExport('pdf')}
              disabled={isExporting}
            >
              {isExporting ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Ionicons name="document-outline" size={16} color="white" />
              )}
              <Text style={styles.exportBtnPrimaryText}>Export PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.exportBtn, styles.exportBtnOutline, isExporting && styles.exportBtnDisabled]}
              onPress={() => handleExport('csv')}
              disabled={isExporting}
            >
              {isExporting ? (
                <ActivityIndicator size="small" color={Colors.success} />
              ) : (
                <Ionicons name="grid-outline" size={16} color={Colors.success} />
              )}
              <Text style={styles.exportBtnOutlineText}>Export CSV</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Header
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
  headerSubtitle: { fontSize: FontSizes.sm, color: Colors.textSecondary, marginTop: 2 },

  // Period filter
  periodFilter: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 4,
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  periodChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceVariant,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  periodChipActive: { backgroundColor: Colors.primaryFaded, borderColor: Colors.primary },
  periodChipText: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeights.medium,
  },
  periodChipTextActive: { color: Colors.primary, fontWeight: FontWeights.semibold },

  // Error banner
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    padding: Spacing.sm + 4,
    backgroundColor: Colors.dangerFaded,
    borderRadius: BorderRadius.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.danger,
  },
  errorText: { fontSize: FontSizes.sm, color: Colors.danger, flex: 1 },

  // Summary stats
  summaryGrid: {
    flexDirection: 'row',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm + 4,
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

  // Chart
  chartCard: {
    marginHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.md,
  },
  chartTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  chartPlaceholder: {
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceVariant,
    borderRadius: BorderRadius.md,
  },
  chartPlaceholderText: { color: Colors.textMuted, fontSize: FontSizes.sm },

  // Defaulters
  defaultersSection: {
    marginHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.sm,
  },
  defaultersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  defaultersTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  warningIconWrapper: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.dangerFaded,
    alignItems: 'center',
    justifyContent: 'center',
  },
  defaultersTitle: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
  },
  defaultersCountBadge: {
    backgroundColor: Colors.dangerFaded,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  defaultersCount: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    color: Colors.danger,
  },
  defaulterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  defaulterInfo: { flex: 1 },
  defaulterName: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  defaulterProgressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  defaulterProgressTrack: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  defaulterProgressFill: { height: '100%', borderRadius: 3 },
  defaulterPercentage: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    minWidth: 40,
    textAlign: 'right',
  },
  riskBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: BorderRadius.full },
  riskText: { fontSize: FontSizes.xs, fontWeight: FontWeights.semibold },

  // Export
  exportCard: {
    marginHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    ...Shadow.sm,
  },
  exportHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  exportTitle: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
  },
  exportSubtitle: { fontSize: FontSizes.xs, color: Colors.textSecondary, marginTop: 2 },
  exportButtons: { flexDirection: 'row', gap: Spacing.sm },
  exportBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: BorderRadius.lg,
    gap: 6,
  },
  exportBtnPrimary: { backgroundColor: Colors.primary },
  exportBtnOutline: {
    backgroundColor: Colors.primaryFaded,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  exportBtnDisabled: { opacity: 0.6 },
  exportBtnPrimaryText: {
    color: 'white',
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
  },
  exportBtnOutlineText: {
    color: Colors.primary,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
  },
});

export default AttendanceReportsScreen;
