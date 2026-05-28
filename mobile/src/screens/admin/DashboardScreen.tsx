import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';

import { useAuth } from '@/hooks/useAuth';
import { AttendanceChart } from '@/components/charts/AttendanceChart';
import { Avatar } from '@/components/common/Avatar';
import { Colors } from '@/constants/colors';
import { BorderRadius, FontSizes, FontWeights, Shadow, Spacing } from '@/constants/theme';
import { userApi, DashboardStats } from '@/api/user.api';
import { attendanceApi } from '@/api/attendance.api';
import { getGreeting, formatPercentage } from '@/utils/helpers';

const { width } = Dimensions.get('window');

interface MetricCard {
  label: string;
  value: string | number;
  icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
  color: string;
  bg: string;
}

const AdminDashboardScreen: React.FC = () => {
  const { user } = useAuth();
  const navigation = useNavigation();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [trendData, setTrendData] = useState<{ label: string; value: number }[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [trendLoading, setTrendLoading] = useState(true);
  const [statsError, setStatsError] = useState(false);
  const [trendError, setTrendError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const from30Days = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  })();

  // Independent loaders — one failure doesn't block others
  const loadStats = useCallback(async () => {
    setStatsError(false);
    setStatsLoading(true);
    try {
      const res = await userApi.getDashboardStats();
      setStats(res.data.data);
    } catch {
      setStatsError(true);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadTrend = useCallback(async () => {
    setTrendError(false);
    setTrendLoading(true);
    try {
      const res = await attendanceApi.getAttendanceTrend({ from: from30Days });
      const trend = res.data.data;
      setTrendData(
        trend.map((d) => ({
          label: new Date(d.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
          value: d.percentage,
        }))
      );
    } catch {
      setTrendError(true);
    } finally {
      setTrendLoading(false);
    }
  }, [from30Days]);

  useEffect(() => {
    loadStats();
    loadTrend();
  }, [loadStats, loadTrend]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([loadStats(), loadTrend()]);
    setRefreshing(false);
  }, [loadStats, loadTrend]);

  const attendanceRate = stats?.today_attendance_rate ?? 0;
  const presentToday = Math.round((attendanceRate / 100) * (stats?.total_students ?? 0));

  const metrics: MetricCard[] = [
    {
      label: 'Total Students',
      value: stats?.total_students ?? 0,
      icon: 'people-outline',
      color: Colors.primary,
      bg: Colors.primaryFaded,
    },
    {
      label: 'Teachers',
      value: stats?.total_teachers ?? 0,
      icon: 'school-outline',
      color: Colors.secondary,
      bg: Colors.secondaryFaded,
    },
    {
      label: "Today's Rate",
      value: statsLoading ? '...' : `${Math.round(attendanceRate)}%`,
      icon: 'checkmark-circle-outline',
      color: attendanceRate >= 75 ? Colors.success : Colors.danger,
      bg: attendanceRate >= 75 ? Colors.successFaded : Colors.dangerFaded,
    },
    {
      label: 'Active Sessions',
      value: stats?.active_sessions ?? 0,
      icon: 'play-circle-outline',
      color: Colors.warning,
      bg: Colors.warningFaded,
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Spacing.xl }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.success} />
        }
      >
        {/* Header */}
        <LinearGradient
          colors={[Colors.successDark, Colors.success]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <View style={styles.headerRow}>
            <View style={{ flex: 1, marginRight: Spacing.md }}>
              <Text style={styles.greeting}>{getGreeting()},</Text>
              <Text style={styles.adminName} numberOfLines={1}>{user?.name || 'Admin'}</Text>
              <View style={styles.rolePill}>
                <Ionicons name="shield-checkmark-outline" size={12} color="rgba(255,255,255,0.9)" />
                <Text style={styles.roleText}>System Administrator</Text>
              </View>
            </View>
            <Avatar name={user?.name || 'A'} photoUrl={user?.photo_url} size={54} />
          </View>
        </LinearGradient>

        <View style={styles.content}>
          {/* Metric cards */}
          <View style={styles.metricsGrid}>
            {metrics.map(({ label, value, icon, color, bg }) => (
              <View key={label} style={[styles.metricCard, { borderTopColor: color }]}>
                <View style={[styles.metricIconWrapper, { backgroundColor: bg }]}>
                  {statsLoading ? (
                    <ActivityIndicator size="small" color={color} />
                  ) : (
                    <Ionicons name={icon} size={22} color={color} />
                  )}
                </View>
                <Text style={[styles.metricValue, { color }]}>
                  {statsLoading ? '–' : String(value)}
                </Text>
                <Text style={styles.metricLabel}>{label}</Text>
              </View>
            ))}
          </View>

          {statsError && (
            <TouchableOpacity style={styles.errorBanner} onPress={loadStats}>
              <Ionicons name="cloud-offline-outline" size={16} color={Colors.danger} />
              <Text style={styles.errorText}>Stats unavailable · Tap to retry</Text>
            </TouchableOpacity>
          )}

          {/* Attendance trend chart */}
          <View style={styles.chartCard}>
            <View style={styles.chartHeaderRow}>
              <View>
                <Text style={styles.chartTitle}>Attendance Trend</Text>
                <Text style={styles.chartSubtitle}>Last 30 days</Text>
              </View>
              {!trendLoading && !trendError && trendData.length > 0 && (
                <View style={[
                  styles.trendBadge,
                  {
                    backgroundColor:
                      trendData.length > 0 &&
                      trendData[trendData.length - 1]!.value >= 75
                        ? Colors.successFaded
                        : Colors.dangerFaded,
                  },
                ]}>
                  <Text style={[
                    styles.trendBadgeText,
                    {
                      color:
                        trendData.length > 0 &&
                        trendData[trendData.length - 1]!.value >= 75
                          ? Colors.success
                          : Colors.danger,
                    },
                  ]}>
                    {trendData.length > 0
                      ? `${trendData[trendData.length - 1]!.value.toFixed(1)}%`
                      : '0%'}
                  </Text>
                </View>
              )}
            </View>

            {trendLoading ? (
              <View style={styles.chartPlaceholder}>
                <ActivityIndicator size="large" color={Colors.success} />
                <Text style={styles.chartPlaceholderText}>Loading trend data...</Text>
              </View>
            ) : trendError ? (
              <View style={styles.chartPlaceholder}>
                <Ionicons name="bar-chart-outline" size={36} color={Colors.textMuted} />
                <Text style={styles.chartPlaceholderText}>Unable to load chart</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={loadTrend}>
                  <Ionicons name="refresh" size={14} color={Colors.success} />
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : trendData.length > 0 ? (
              <AttendanceChart data={trendData} type="line" height={180} color={Colors.success} />
            ) : (
              <View style={styles.chartPlaceholder}>
                <Ionicons name="bar-chart-outline" size={36} color={Colors.textMuted} />
                <Text style={styles.chartPlaceholderText}>No attendance data yet</Text>
              </View>
            )}
          </View>

          {/* Today's overview */}
          <View style={styles.overviewCard}>
            <Text style={styles.sectionTitle}>Today's Overview</Text>

            <View style={styles.overviewRow}>
              {[
                {
                  icon: 'people' as const,
                  color: Colors.primary,
                  value: statsLoading ? '–' : String(stats?.total_students ?? 0),
                  label: 'Total Students',
                },
                {
                  icon: 'checkmark-circle' as const,
                  color: Colors.success,
                  value: statsLoading ? '–' : String(presentToday),
                  label: 'Present Today',
                },
                {
                  icon: 'play-circle' as const,
                  color: Colors.warning,
                  value: statsLoading ? '–' : String(stats?.active_sessions ?? 0),
                  label: 'Active Sessions',
                },
              ].map(({ icon, color, value, label }, i, arr) => (
                <React.Fragment key={label}>
                  <View style={styles.overviewItem}>
                    <Ionicons name={icon} size={26} color={color} />
                    <Text style={[styles.overviewValue, { color }]}>{value}</Text>
                    <Text style={styles.overviewLabel}>{label}</Text>
                  </View>
                  {i < arr.length - 1 && <View style={styles.overviewDivider} />}
                </React.Fragment>
              ))}
            </View>

            <View style={styles.rateContainer}>
              <View style={styles.rateHeaderRow}>
                <Text style={styles.rateLabel}>Today's Attendance Rate</Text>
                <Text style={[styles.rateValue, { color: attendanceRate >= 75 ? Colors.success : Colors.danger }]}>
                  {statsLoading ? '...' : formatPercentage(attendanceRate)}
                </Text>
              </View>
              <View style={styles.rateTrack}>
                <View
                  style={[
                    styles.rateFill,
                    {
                      width: `${Math.min(attendanceRate, 100)}%` as `${number}%`,
                      backgroundColor: attendanceRate >= 75 ? Colors.success : Colors.danger,
                    },
                  ]}
                />
              </View>
            </View>
          </View>

          {/* Quick navigation */}
          <View style={styles.quickNavCard}>
            <Text style={styles.sectionTitle}>Quick Access</Text>
            <View style={styles.quickNavGrid}>
              {[
                { icon: 'people-outline' as const, label: 'Students', tab: 'Students', color: Colors.primary },
                { icon: 'school-outline' as const, label: 'Teachers', tab: 'Teachers', color: Colors.secondary },
                { icon: 'document-text-outline' as const, label: 'Reports', tab: 'Reports', color: Colors.success },
                { icon: 'settings-outline' as const, label: 'Settings', tab: 'Settings', color: Colors.warning },
              ].map(({ icon, label, tab, color }) => (
                <TouchableOpacity
                  key={label}
                  style={[styles.quickNavItem, { borderColor: color + '40' }]}
                  onPress={() => navigation.navigate(tab as never)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.quickNavIcon, { backgroundColor: color + '15' }]}>
                    <Ionicons name={icon} size={22} color={color} />
                  </View>
                  <Text style={[styles.quickNavLabel, { color }]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
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
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl + 12,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  greeting: { fontSize: FontSizes.sm, color: 'rgba(255,255,255,0.8)' },
  adminName: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: 'white',
    marginTop: 2,
    maxWidth: width * 0.6,
  },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  roleText: { fontSize: FontSizes.xs, color: 'rgba(255,255,255,0.9)' },

  // Content
  content: { padding: Spacing.md, marginTop: -20 },

  // Metric cards
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  metricCard: {
    width: (width - Spacing.md * 2 - Spacing.sm) / 2,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderTopWidth: 3,
    ...Shadow.sm,
  },
  metricIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  metricValue: { fontSize: FontSizes.xxl, fontWeight: FontWeights.extrabold },
  metricLabel: { fontSize: FontSizes.xs, color: Colors.textSecondary, marginTop: 4 },

  // Error banner
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.dangerFaded,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm + 4,
    marginBottom: Spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.danger,
  },
  errorText: { fontSize: FontSizes.xs, color: Colors.danger, flex: 1 },

  // Chart
  chartCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.md,
  },
  chartHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  chartTitle: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold, color: Colors.textPrimary },
  chartSubtitle: { fontSize: FontSizes.xs, color: Colors.textSecondary, marginTop: 2 },
  trendBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  trendBadgeText: { fontSize: FontSizes.xs, fontWeight: FontWeights.bold },
  chartPlaceholder: {
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceVariant,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  chartPlaceholderText: { color: Colors.textMuted, fontSize: FontSizes.sm },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.successFaded,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  retryText: { fontSize: FontSizes.xs, color: Colors.success, fontWeight: FontWeights.semibold },

  // Section title
  sectionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },

  // Overview card
  overviewCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.sm,
  },
  overviewRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceVariant,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  overviewItem: { flex: 1, alignItems: 'center', gap: 4 },
  overviewDivider: { width: 1, backgroundColor: Colors.border },
  overviewValue: { fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  overviewLabel: { fontSize: FontSizes.xs, color: Colors.textSecondary, textAlign: 'center' },
  rateContainer: { gap: Spacing.sm },
  rateHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rateLabel: { fontSize: FontSizes.sm, color: Colors.textSecondary },
  rateValue: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold },
  rateTrack: { height: 8, backgroundColor: Colors.border, borderRadius: 4, overflow: 'hidden' },
  rateFill: { height: '100%', borderRadius: 4 },

  // Quick navigation
  quickNavCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.sm,
  },
  quickNavGrid: { flexDirection: 'row', gap: Spacing.sm },
  quickNavItem: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    backgroundColor: Colors.surface,
  },
  quickNavIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickNavLabel: { fontSize: FontSizes.xs, fontWeight: FontWeights.semibold },
});

export default AdminDashboardScreen;
