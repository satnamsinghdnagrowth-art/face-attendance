import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';

import { examApi } from '@/api/exam.api';
import { StudentSessionStatus } from '@/api/exam.api';
import { useAppSelector } from '@/store';
import { Colors } from '@/constants/colors';
import { BorderRadius, FontSizes, FontWeights, Shadow, Spacing } from '@/constants/theme';

type RouteParams = {
  sessionId?: string;
  hallId?: string;
  examId?: string;
};

type StatusType = StudentSessionStatus['latest_verdict'];

const statusConfig: Record<
  string,
  { color: string; bg: string; label: string; showProxy?: boolean }
> = {
  verified: { color: Colors.success, bg: Colors.successFaded, label: 'Verified' },
  flagged: { color: Colors.warning, bg: Colors.warningFaded, label: 'Flagged' },
  rejected: { color: Colors.danger, bg: Colors.dangerFaded, label: 'Rejected' },
  proxy_suspect: { color: Colors.danger, bg: Colors.dangerFaded, label: 'Proxy', showProxy: true },
  not_scanned: { color: Colors.textMuted, bg: Colors.surfaceVariant, label: 'Pending' },
};

const AUTO_REFRESH_INTERVAL = 10000;

const StudentListScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<Record<string, RouteParams>, string>>();
  const insets = useSafeAreaInsets();
  const tabBarHeight = 52 + Math.max(insets.bottom, 8);

  const currentSession = useAppSelector((s) => (s as any).exam?.currentSession);
  const sessionId = route.params?.sessionId || currentSession?.id || '';
  const examId = route.params?.examId || currentSession?.exam_id || '';
  const hallId = route.params?.hallId || currentSession?.hall_id || '';

  const [students, setStudents] = useState<StudentSessionStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const autoRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadStudents = useCallback(async () => {
    if (!sessionId) {
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const res = await examApi.getSessionStudents(sessionId);
      setStudents(res.data?.data || res.data || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load students');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  const scheduleAutoRefresh = useCallback(() => {
    if (autoRefreshTimer.current) clearTimeout(autoRefreshTimer.current);
    autoRefreshTimer.current = setTimeout(async () => {
      await loadStudents();
      scheduleAutoRefresh();
    }, AUTO_REFRESH_INTERVAL);
  }, [loadStudents]);

  useEffect(() => {
    loadStudents();
    scheduleAutoRefresh();
    return () => {
      if (autoRefreshTimer.current) clearTimeout(autoRefreshTimer.current);
    };
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadStudents();
    setRefreshing(false);
    scheduleAutoRefresh();
  }, [loadStudents, scheduleAutoRefresh]);

  const filteredStudents = students.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (s.student_name || '').toLowerCase().includes(q) ||
      (s.seat_number || '').toLowerCase().includes(q) ||
      (s.roll_number || '').toLowerCase().includes(q)
    );
  });

  // Stats
  const verified = students.filter((s) => s.latest_verdict === 'verified').length;
  const flagged = students.filter((s) => s.latest_verdict === 'flagged').length;
  const notScanned = students.filter((s) => s.latest_verdict === 'not_scanned').length;

  const renderStudentCard = ({ item }: { item: StudentSessionStatus }) => {
    const cfg = statusConfig[item.latest_verdict] || statusConfig.not_scanned;
    const isScanned = item.latest_verdict !== 'not_scanned';

    return (
      <TouchableOpacity
        style={styles.studentCard}
        activeOpacity={0.8}
        onPress={() =>
          (navigation as any).navigate('EntryVerification', {
            sessionId,
            examId,
            hallId,
            studentId: item.student_id,
            studentName: item.student_name,
            seatNumber: item.seat_number,
            rollNumber: item.roll_number,
          })
        }
      >
        {/* Avatar */}
        <View style={[styles.studentAvatar, { backgroundColor: cfg.bg }]}>
          <Text style={[styles.studentInitial, { color: cfg.color }]}>
            {(item.student_name || '?').charAt(0).toUpperCase()}
          </Text>
        </View>

        {/* Info */}
        <View style={styles.studentInfo}>
          <Text style={styles.studentName} numberOfLines={1}>
            {item.student_name || 'Unknown Student'}
          </Text>
          <View style={styles.studentMeta}>
            {item.seat_number && (
              <Text style={styles.studentMetaText}>Seat {item.seat_number}</Text>
            )}
            {item.roll_number && (
              <Text style={styles.studentMetaText}>Roll {item.roll_number}</Text>
            )}
          </View>
          {isScanned && item.confidence_score !== undefined && (
            <Text style={styles.confidenceText}>
              {Math.round((item.confidence_score || 0) * 100)}% confidence
            </Text>
          )}
        </View>

        {/* Status indicator */}
        <View style={styles.statusBlock}>
          <View style={[styles.statusCircle, { backgroundColor: cfg.color }]}>
            {item.latest_verdict === 'proxy_suspect' && (
              <Text style={styles.proxyText}>P</Text>
            )}
          </View>
          <Text style={[styles.statusLabel, { color: cfg.color }]}>{cfg.label}</Text>
        </View>

        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>
            {currentSession?.hall_name || 'Hall Students'}
          </Text>
          <Text style={styles.headerSub}>{students.length} students</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
          <Ionicons name="refresh-outline" size={20} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Stats bar */}
      <View style={styles.statsBar}>
        <View style={[styles.statItem, { borderColor: Colors.success }]}>
          <Text style={[styles.statValue, { color: Colors.success }]}>{verified}</Text>
          <Text style={styles.statLabel}>Verified</Text>
        </View>
        <View style={[styles.statItem, { borderColor: Colors.warning }]}>
          <Text style={[styles.statValue, { color: Colors.warning }]}>{flagged}</Text>
          <Text style={styles.statLabel}>Flagged</Text>
        </View>
        <View style={[styles.statItem, { borderColor: Colors.textMuted }]}>
          <Text style={[styles.statValue, { color: Colors.textMuted }]}>{notScanned}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
      </View>

      {/* Search bar */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={18} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, seat or roll number..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading students...</Text>
        </View>
      ) : error ? (
        <View style={styles.emptyState}>
          <Ionicons name="alert-circle-outline" size={36} color={Colors.danger} />
          <Text style={styles.emptyTitle}>Failed to load</Text>
          <Text style={styles.emptyDesc}>{error}</Text>
          <TouchableOpacity style={styles.emptyAction} onPress={loadStudents}>
            <Ionicons name="refresh-outline" size={16} color={Colors.primary} />
            <Text style={styles.emptyActionText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredStudents}
          keyExtractor={(item) => item.student_id || Math.random().toString()}
          renderItem={renderStudentCard}
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
              <Ionicons name="people-outline" size={36} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>
                {search ? 'No matches found' : 'No students in this session'}
              </Text>
            </View>
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: tabBarHeight + 16 }]}
        onPress={onRefresh}
        activeOpacity={0.9}
      >
        <Ionicons name="refresh" size={24} color="white" />
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flex: 1 },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
  },
  headerSub: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  refreshBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primaryFaded,
    alignItems: 'center',
    justifyContent: 'center',
  },

  statsBar: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.md,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    backgroundColor: Colors.surfaceVariant,
    gap: 2,
  },
  statValue: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
  },
  statLabel: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.textPrimary,
    padding: 0,
  },

  listContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },

  studentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
    ...Shadow.sm,
  },
  studentAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  studentInitial: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
  studentInfo: { flex: 1 },
  studentName: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.textPrimary,
  },
  studentMeta: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: 2,
  },
  studentMetaText: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  confidenceText: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statusBlock: {
    alignItems: 'center',
    gap: 3,
  },
  statusCircle: {
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proxyText: {
    fontSize: 8,
    fontWeight: FontWeights.bold,
    color: 'white',
  },
  statusLabel: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
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
  emptyTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.semibold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    textAlign: 'center',
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

  fab: {
    position: 'absolute',
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});

export default StudentListScreen;
