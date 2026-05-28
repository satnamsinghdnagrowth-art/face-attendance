import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { AttendanceChart } from '@/components/charts/AttendanceChart';
import { Button } from '@/components/common/Button';
import { Colors } from '@/constants/colors';
import { BorderRadius, FontSizes, FontWeights, Shadow, Spacing } from '@/constants/theme';
import { attendanceApi } from '@/api/attendance.api';
import { userApi } from '@/api/user.api';
import { ClassRoom, Subject } from '@/types';
import { formatDate, formatPercentage } from '@/utils/helpers';

interface TrendPoint { date: string; percentage: number; present: number; total: number; }

const ReportsScreen: React.FC = () => {
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedClass, setSelectedClass] = useState<ClassRoom | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const from = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  })();

  const loadClasses = useCallback(async () => {
    try {
      const res = await userApi.getClasses();
      setClasses(res.data.data);
    } catch {}
  }, []);

  const loadReport = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await attendanceApi.getAttendanceTrend({
        class_id: selectedClass?.id,
        subject_id: selectedSubject?.id,
        from,
      });
      setTrendData(res.data.data);
    } catch {
      setTrendData([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedClass, selectedSubject, from]);

  useEffect(() => {
    loadClasses();
    loadReport();
  }, [loadClasses, loadReport]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadReport();
    setRefreshing(false);
  }, [loadReport]);

  const handleExport = useCallback(async (format: 'pdf' | 'csv') => {
    try {
      await attendanceApi.exportAttendance({
        class_id: selectedClass?.id,
        subject_id: selectedSubject?.id,
        from,
        format,
      });
      Alert.alert('Success', `Report exported as ${format.toUpperCase()}`);
    } catch {
      Alert.alert('Error', 'Failed to export report. Please try again.');
    }
  }, [selectedClass, selectedSubject, from]);

  const chartData = trendData.map((d) => ({
    label: formatDate(d.date).split(',')[0].slice(0, 6),
    value: d.percentage,
  }));

  const avgAttendance = trendData.length > 0
    ? trendData.reduce((sum, d) => sum + d.percentage, 0) / trendData.length
    : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.secondary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Attendance Reports</Text>
          <Text style={styles.headerSubtitle}>Last 30 days</Text>
        </View>

        {/* Filters */}
        <View style={styles.filtersCard}>
          <TouchableOpacity
            style={styles.filterRow}
            onPress={() => {
              Alert.alert(
                'Select Class',
                undefined,
                [
                  { text: 'All Classes', onPress: () => { setSelectedClass(null); setSelectedSubject(null); } },
                  ...classes.map((c) => ({
                    text: c.name,
                    onPress: () => {
                      setSelectedClass(c);
                      setSelectedSubject(null);
                      userApi.getSubjects({ class_id: c.id }).then((r) => setSubjects(r.data.data));
                    },
                  })),
                  { text: 'Cancel', style: 'cancel' as const },
                ]
              );
            }}
          >
            <Ionicons name="school-outline" size={18} color={Colors.textSecondary} />
            <Text style={styles.filterText}>
              {selectedClass ? selectedClass.name : 'All Classes'}
            </Text>
            <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
          </TouchableOpacity>

          {selectedClass && (
            <TouchableOpacity
              style={[styles.filterRow, styles.filterRowBorder]}
              onPress={() => {
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
              }}
            >
              <Ionicons name="book-outline" size={18} color={Colors.textSecondary} />
              <Text style={styles.filterText}>
                {selectedSubject ? selectedSubject.name : 'All Subjects'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Summary stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: avgAttendance >= 75 ? Colors.success : Colors.danger }]}>
              {formatPercentage(avgAttendance, 1)}
            </Text>
            <Text style={styles.statLabel}>Avg Attendance</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{trendData.reduce((sum, d) => sum + d.total, 0)}</Text>
            <Text style={styles.statLabel}>Total Classes</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: Colors.success }]}>
              {trendData.reduce((sum, d) => sum + d.present, 0)}
            </Text>
            <Text style={styles.statLabel}>Present Days</Text>
          </View>
        </View>

        {/* Trend chart */}
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Attendance Trend</Text>
          <Text style={styles.chartSubtitle}>
            {selectedClass ? selectedClass.name : 'All classes'}{' '}
            {selectedSubject ? `• ${selectedSubject.name}` : ''}
          </Text>
          {isLoading ? (
            <View style={styles.chartLoading}>
              <Text style={styles.chartLoadingText}>Loading chart data...</Text>
            </View>
          ) : chartData.length > 0 ? (
            <AttendanceChart data={chartData} type="line" height={200} color={Colors.secondary} />
          ) : (
            <View style={styles.chartEmpty}>
              <Ionicons name="bar-chart-outline" size={36} color={Colors.textMuted} />
              <Text style={styles.chartEmptyText}>No data for this period</Text>
            </View>
          )}
        </View>

        {/* Export options */}
        <View style={styles.exportCard}>
          <Text style={styles.exportTitle}>Export Report</Text>
          <Text style={styles.exportSubtitle}>Download attendance data for the selected period</Text>
          <View style={styles.exportButtons}>
            <Button
              title="Export PDF"
              onPress={() => handleExport('pdf')}
              variant="primary"
              size="md"
              icon="document-outline"
              style={styles.exportButton}
            />
            <Button
              title="Export CSV"
              onPress={() => handleExport('csv')}
              variant="outline"
              size="md"
              icon="download-outline"
              style={styles.exportButton}
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
  filtersCard: {
    margin: Spacing.md,
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
  filterRowBorder: { borderTopWidth: 1, borderTopColor: Colors.divider },
  filterText: { flex: 1, fontSize: FontSizes.md, color: Colors.textPrimary },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    ...Shadow.sm,
  },
  statValue: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
  },
  statLabel: { fontSize: FontSizes.xs, color: Colors.textSecondary, marginTop: 4 },
  chartCard: {
    margin: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    ...Shadow.md,
  },
  chartTitle: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold, color: Colors.textPrimary },
  chartSubtitle: { fontSize: FontSizes.sm, color: Colors.textSecondary, marginBottom: Spacing.md },
  chartLoading: { height: 200, alignItems: 'center', justifyContent: 'center' },
  chartLoadingText: { fontSize: FontSizes.sm, color: Colors.textMuted },
  chartEmpty: {
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceVariant,
    borderRadius: BorderRadius.md,
  },
  chartEmptyText: { fontSize: FontSizes.sm, color: Colors.textMuted },
  exportCard: {
    margin: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    ...Shadow.sm,
    marginBottom: Spacing.xxl,
  },
  exportTitle: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold, color: Colors.textPrimary },
  exportSubtitle: { fontSize: FontSizes.sm, color: Colors.textSecondary, marginVertical: Spacing.sm },
  exportButtons: { flexDirection: 'row', gap: Spacing.sm },
  exportButton: { flex: 1 },
});

export default ReportsScreen;
