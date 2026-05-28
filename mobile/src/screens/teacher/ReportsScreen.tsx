import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  Share,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';

import { AttendanceChart } from '@/components/charts/AttendanceChart';
import { Colors } from '@/constants/colors';
import { BorderRadius, FontSizes, FontWeights, Shadow, Spacing } from '@/constants/theme';
import { attendanceApi } from '@/api/attendance.api';
import { userApi } from '@/api/user.api';
import { API_BASE_URL } from '@/api/client';
import { ClassRoom, Subject } from '@/types';
import { formatDate, formatPercentage } from '@/utils/helpers';

interface TrendPoint { date: string; percentage: number; present: number; total: number; }

type PeriodFilter = '7days' | '30days' | '3months';

const PERIOD_OPTIONS: { id: PeriodFilter; label: string }[] = [
  { id: '7days', label: 'Last 7 Days' },
  { id: '30days', label: 'Last 30 Days' },
  { id: '3months', label: 'Last 3 Months' },
];

const ReportsScreen: React.FC = () => {
  const [period, setPeriod] = useState<PeriodFilter>('30days');
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedClass, setSelectedClass] = useState<ClassRoom | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const from = useMemo(() => {
    const d = new Date();
    if (period === '7days') d.setDate(d.getDate() - 7);
    else if (period === '30days') d.setDate(d.getDate() - 30);
    else d.setMonth(d.getMonth() - 3);
    return d.toISOString().split('T')[0];
  }, [period]);

  const loadClasses = useCallback(async () => {
    try {
      const res = await userApi.getClasses();
      setClasses(res.data.data);
    } catch {}
  }, []);

  const loadReport = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const res = await attendanceApi.getAttendanceTrend({
        class_id: selectedClass?.id,
        subject_id: selectedSubject?.id,
        from,
      });
      setTrendData(res.data.data);
    } catch {
      setHasError(true);
      setTrendData([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedClass, selectedSubject, from]);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadReport();
    setRefreshing(false);
  }, [loadReport]);

  const handleExport = useCallback(async (format: 'pdf' | 'csv') => {
    setIsExporting(true);
    try {
      const token = await SecureStore.getItemAsync('access_token');
      const params = new URLSearchParams({ from, format });
      if (selectedClass?.id) params.set('class_id', selectedClass.id);
      if (selectedSubject?.id) params.set('subject_id', selectedSubject.id);

      const downloadUrl = `${API_BASE_URL}/attendance/export?${params.toString()}`;
      const filename = `attendance_${format}_${Date.now()}.${format}`;
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
          message: `Attendance report (${format.toUpperCase()})`,
        });
      } else {
        Alert.alert('Export Failed', 'Could not generate the report. Please try again.');
      }
    } catch {
      Alert.alert('Export Failed', 'Failed to export. Please check your connection.');
    } finally {
      setIsExporting(false);
    }
  }, [from, selectedClass, selectedSubject]);

  const chartData = useMemo(
    () =>
      trendData.map((d) => ({
        label: formatDate(d.date).split(',')[0].slice(0, 6),
        value: d.percentage,
      })),
    [trendData]
  );

  const avgAttendance = useMemo(
    () =>
      trendData.length > 0
        ? trendData.reduce((sum, d) => sum + d.percentage, 0) / trendData.length
        : 0,
    [trendData]
  );

  const totalPresent = trendData.reduce((sum, d) => sum + d.present, 0);
  const totalClasses = trendData.reduce((sum, d) => sum + d.total, 0);

  const handleSelectClass = () => {
    Alert.alert(
      'Select Class',
      undefined,
      [
        {
          text: 'All Classes',
          onPress: () => {
            setSelectedClass(null);
            setSelectedSubject(null);
          },
        },
        ...classes.map((c) => ({
          text: c.name,
          onPress: () => {
            setSelectedClass(c);
            setSelectedSubject(null);
            userApi.getSubjects({ class_id: c.id }).then((r) => setSubjects(r.data.data)).catch(() => {});
          },
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ]
    );
  };

  const handleSelectSubject = () => {
    Alert.alert(
      'Select Subject',
      undefined,
      [
        { text: 'All Subjects', onPress: () => setSelectedSubject(null) },
        ...subjects.map((s) => ({
          text: s.name,
          onPress: () => setSelectedSubject(s),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.secondary} />
        }
        contentContainerStyle={{ paddingBottom: Spacing.xxl }}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Reports</Text>
          <Text style={styles.headerSubtitle}>Attendance analytics for your classes</Text>
        </View>

        {/* Period filter chips */}
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

        {/* Filters */}
        <View style={styles.filtersCard}>
          <TouchableOpacity style={styles.filterRow} onPress={handleSelectClass}>
            <Ionicons name="school-outline" size={18} color={Colors.secondary} />
            <Text style={[styles.filterText, !selectedClass && styles.filterTextMuted]}>
              {selectedClass ? selectedClass.name : 'All Classes'}
            </Text>
            <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
          </TouchableOpacity>

          {selectedClass && (
            <TouchableOpacity
              style={[styles.filterRow, styles.filterRowBorder]}
              onPress={handleSelectSubject}
            >
              <Ionicons name="book-outline" size={18} color={Colors.secondary} />
              <Text style={[styles.filterText, !selectedSubject && styles.filterTextMuted]}>
                {selectedSubject ? selectedSubject.name : 'All Subjects'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Summary stats */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { borderLeftColor: avgAttendance >= 75 ? Colors.success : Colors.danger }]}>
            <Ionicons
              name="bar-chart-outline"
              size={20}
              color={avgAttendance >= 75 ? Colors.success : Colors.danger}
            />
            <Text style={[styles.statValue, { color: avgAttendance >= 75 ? Colors.success : Colors.danger }]}>
              {formatPercentage(avgAttendance, 1)}
            </Text>
            <Text style={styles.statLabel}>Avg Attendance</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: Colors.primary }]}>
            <Ionicons name="calendar-outline" size={20} color={Colors.primary} />
            <Text style={[styles.statValue, { color: Colors.primary }]}>{totalClasses}</Text>
            <Text style={styles.statLabel}>Total Records</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: Colors.success }]}>
            <Ionicons name="checkmark-circle-outline" size={20} color={Colors.success} />
            <Text style={[styles.statValue, { color: Colors.success }]}>{totalPresent}</Text>
            <Text style={styles.statLabel}>Present Days</Text>
          </View>
        </View>

        {/* Trend chart */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <View>
              <Text style={styles.chartTitle}>Attendance Trend</Text>
              <Text style={styles.chartSubtitle}>
                {selectedClass ? selectedClass.name : 'All classes'}
                {selectedSubject ? ` · ${selectedSubject.name}` : ''}
              </Text>
            </View>
            {!isLoading && !hasError && trendData.length > 0 && (
              <View style={[
                styles.trendBadge,
                { backgroundColor: avgAttendance >= 75 ? Colors.successFaded : Colors.dangerFaded },
              ]}>
                <Ionicons
                  name={avgAttendance >= 75 ? 'trending-up' : 'trending-down'}
                  size={14}
                  color={avgAttendance >= 75 ? Colors.success : Colors.danger}
                />
                <Text style={[styles.trendBadgeText, { color: avgAttendance >= 75 ? Colors.success : Colors.danger }]}>
                  {avgAttendance >= 75 ? 'Good' : 'Low'}
                </Text>
              </View>
            )}
          </View>

          {isLoading ? (
            <View style={styles.chartPlaceholder}>
              <ActivityIndicator size="large" color={Colors.secondary} />
              <Text style={styles.chartPlaceholderText}>Loading data...</Text>
            </View>
          ) : hasError ? (
            <View style={styles.chartPlaceholder}>
              <Ionicons name="cloud-offline-outline" size={40} color={Colors.danger} />
              <Text style={styles.chartErrorTitle}>Unable to load data</Text>
              <Text style={styles.chartErrorDesc}>Check your connection and try again</Text>
              <TouchableOpacity style={styles.retryButton} onPress={loadReport}>
                <Ionicons name="refresh" size={14} color={Colors.secondary} />
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : chartData.length > 0 ? (
            <AttendanceChart data={chartData} type="line" height={200} color={Colors.secondary} />
          ) : (
            <View style={styles.chartPlaceholder}>
              <Ionicons name="bar-chart-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.chartPlaceholderText}>No attendance data for this period</Text>
              <Text style={styles.chartPlaceholderSub}>
                Try selecting a different time range or start an attendance session
              </Text>
            </View>
          )}
        </View>

        {/* Export */}
        <View style={styles.exportCard}>
          <View style={styles.exportHeader}>
            <Ionicons name="download-outline" size={20} color={Colors.textPrimary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.exportTitle}>Export Report</Text>
              <Text style={styles.exportSubtitle}>
                Download data for {selectedClass ? selectedClass.name : 'all classes'}
              </Text>
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
              <Text style={styles.exportBtnPrimaryText}>PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.exportBtn, styles.exportBtnOutline, isExporting && styles.exportBtnDisabled]}
              onPress={() => handleExport('csv')}
              disabled={isExporting}
            >
              {isExporting ? (
                <ActivityIndicator size="small" color={Colors.secondary} />
              ) : (
                <Ionicons name="grid-outline" size={16} color={Colors.secondary} />
              )}
              <Text style={styles.exportBtnOutlineText}>CSV</Text>
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
  headerSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },

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
  periodChipActive: {
    backgroundColor: Colors.secondaryFaded,
    borderColor: Colors.secondary,
  },
  periodChipText: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeights.medium,
  },
  periodChipTextActive: {
    color: Colors.secondary,
    fontWeight: FontWeights.semibold,
  },

  // Filters
  filtersCard: {
    margin: Spacing.md,
    marginBottom: 0,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  filterRowBorder: {
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  filterText: {
    flex: 1,
    fontSize: FontSizes.md,
    color: Colors.textPrimary,
    fontWeight: FontWeights.medium,
  },
  filterTextMuted: { color: Colors.textSecondary, fontWeight: FontWeights.regular },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm + 4,
    alignItems: 'center',
    gap: 4,
    borderLeftWidth: 3,
    ...Shadow.sm,
  },
  statValue: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
  },
  statLabel: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
  },

  // Chart
  chartCard: {
    marginHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.md,
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  chartTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
  },
  chartSubtitle: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  trendBadgeText: { fontSize: FontSizes.xs, fontWeight: FontWeights.semibold },
  chartPlaceholder: {
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceVariant,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
  },
  chartPlaceholderText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  chartPlaceholderSub: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  chartErrorTitle: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.danger,
  },
  chartErrorDesc: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    backgroundColor: Colors.secondaryFaded,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
  },
  retryText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.secondary,
  },

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
  exportSubtitle: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
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
  exportBtnPrimary: { backgroundColor: Colors.secondary },
  exportBtnOutline: {
    backgroundColor: Colors.secondaryFaded,
    borderWidth: 1,
    borderColor: Colors.secondary,
  },
  exportBtnDisabled: { opacity: 0.6 },
  exportBtnPrimaryText: {
    color: 'white',
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
  },
  exportBtnOutlineText: {
    color: Colors.secondary,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
  },
});

export default ReportsScreen;
