import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator,
  ScrollView, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';

import { examApi, ExamWithStats, ExamHall, ExamSession } from '@/api/exam.api';
import { useReVerifyTimer } from '@/hooks/useReVerifyTimer';
import { useAppDispatch, useAppSelector } from '@/store';
import { startSessionThunk, endSessionThunk, clearCurrentSession } from '@/store/slices/exam.slice';
import { Colors } from '@/constants/colors';
import { BorderRadius, FontSizes, FontWeights, Shadow, Spacing } from '@/constants/theme';
import { InvigilatorStackParamList } from '@/navigation/types';

type RouteParams = RouteProp<InvigilatorStackParamList, 'HallSession'>;

function formatElapsed(startedAt: string): string {
  const diff = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  const h = Math.floor(diff / 3600).toString().padStart(2, '0');
  const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
  const s = (diff % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

const HallSessionScreen: React.FC = () => {
  const navigation = useNavigation();
  // route.params may be undefined if rendered outside the stack (defensive guard)
  const route = useRoute<RouteParams>();
  const dispatch = useAppDispatch();
  const routeParams = (route.params as InvigilatorStackParamList['HallSession'] | undefined);
  const examId = routeParams?.examId ?? '';
  const hallId = routeParams?.hallId ?? '';
  const currentSession = useAppSelector((s) => s.exam.currentSession);

  const [exam, setExam] = useState<ExamWithStats | null>(null);
  const [hall, setHall] = useState<ExamHall | null>(null);
  const [elapsed, setElapsed] = useState('00:00:00');
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sessionStats, setSessionStats] = useState({ verified: 0, flagged: 0, not_scanned: 0 });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const reVerifyIntervalMins = exam?.re_verify_interval_mins ?? 0;

  const { nextReVerifyIn, verifyCount } = useReVerifyTimer({
    intervalMins: reVerifyIntervalMins,
    sessionActive: !!currentSession && currentSession.status === 'active',
    onTimerFired: useCallback((round: number) => {
      Alert.alert(
        `Re-Verification Required (Round ${round})`,
        `Time for periodic re-scan. Please re-verify flagged students and a random sample.\n\nTap Students to begin.`,
        [
          { text: 'Later', style: 'cancel' },
          { text: 'Start Re-Scan', onPress: () => (navigation as any).navigate('Students', {}) },
        ]
      );
    }, [navigation]),
  });

  // Guard: if navigated here without required params, redirect back
  useEffect(() => {
    if (!examId || !hallId) {
      navigation.goBack();
    }
  }, [examId, hallId, navigation]);

  const loadData = useCallback(async () => {
    try {
      const examRes = await examApi.getExam(examId);
      const examData = examRes.data.data;
      setExam(examData);
      const foundHall = examData.halls.find((h) => h.id === hallId);
      if (foundHall) setHall(foundHall);
    } catch {
      // keep previous
    } finally {
      setIsLoading(false);
    }
  }, [examId, hallId]);

  const loadStats = useCallback(async () => {
    if (!currentSession?.id) return;
    try {
      const res = await examApi.getSessionStudents(currentSession.id);
      const students = res.data.data;
      setSessionStats({
        verified: students.filter((s) => s.latest_verdict === 'verified').length,
        flagged: students.filter((s) => s.latest_verdict === 'flagged').length,
        not_scanned: students.filter((s) => s.latest_verdict === 'not_scanned').length,
      });
    } catch {}
  }, [currentSession?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (currentSession?.started_at) {
      setElapsed(formatElapsed(currentSession.started_at));
      timerRef.current = setInterval(() => {
        setElapsed(formatElapsed(currentSession.started_at));
      }, 1000);
      loadStats();
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [currentSession?.started_at, loadStats]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadData(), loadStats()]);
    setRefreshing(false);
  }, [loadData, loadStats]);

  const handleStartSession = useCallback(async (force = false) => {
    if (!examId || !hallId) {
      Alert.alert('Navigation Error', 'Hall information is missing. Please go back and tap the hall again.');
      return;
    }
    setIsStarting(true);
    try {
      const result = await dispatch(startSessionThunk({ examId, hallId, force })).unwrap();
      // Show a brief informational toast if resuming an existing session
      if ((result as any)?.resumed && !force) {
        Alert.alert(
          'Session Resumed',
          'An existing session for this hall was found and resumed. Tap "Start Fresh" to begin a new one.',
          [{ text: 'OK' }]
        );
      }
    } catch (e: unknown) {
      let msg = 'Unable to start session. Please try again.';
      if (typeof e === 'string') msg = e;
      else if (e && typeof (e as { message?: string }).message === 'string') {
        msg = (e as { message: string }).message;
      }
      Alert.alert('Session Error', msg);
    } finally {
      setIsStarting(false);
    }
  }, [dispatch, examId, hallId]);

  const handleStartFresh = useCallback(() => {
    Alert.alert(
      'Start Fresh Session',
      'This will end the current active session and start a new one. All existing scan records will be kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start Fresh',
          style: 'destructive',
          onPress: () => handleStartSession(true),
        },
      ]
    );
  }, [handleStartSession]);

  const handleEndSession = useCallback(() => {
    Alert.alert(
      'End Hall Session',
      'Are you sure you want to end this session? Students will be marked as no-show.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Session',
          style: 'destructive',
          onPress: async () => {
            if (!currentSession?.id) return;
            setIsEnding(true);
            try {
              await dispatch(endSessionThunk(currentSession.id)).unwrap();
              dispatch(clearCurrentSession());
            } catch (endErr: unknown) {
              const endMsg = typeof endErr === 'string' ? endErr : 'Failed to end session. Please try again.';
              Alert.alert('Error', endMsg);
            } finally {
              setIsEnding(false);
            }
          },
        },
      ]
    );
  }, [currentSession, dispatch]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading hall info...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const hasActiveSession = !!currentSession && currentSession.status === 'active';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <LinearGradient
        colors={hasActiveSession ? [Colors.successDark, Colors.success] : [Colors.primaryDark, Colors.primary]}
        style={styles.header}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color="white" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            {hasActiveSession ? (
              <>
                <View style={styles.liveRow}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveLabel}>SESSION ACTIVE</Text>
                </View>
                <Text style={styles.timerText}>{elapsed}</Text>
              </>
            ) : (
              <>
                <Text style={styles.headerTitle}>{hall?.hall_name ?? 'Hall'}</Text>
                <Text style={styles.headerSubtitle}>{exam?.title ?? 'Examination'}</Text>
              </>
            )}
          </View>
          <View style={{ width: 40 }} />
        </View>
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {hasActiveSession ? (
          /* ── Active session view ── */
          <>
            {/* Stats */}
            <View style={styles.statsCard}>
              {[
                { label: 'Verified', count: sessionStats.verified, color: Colors.success },
                { label: 'Flagged', count: sessionStats.flagged, color: Colors.warning },
                { label: 'Pending', count: sessionStats.not_scanned, color: Colors.textMuted },
              ].map(({ label, count, color }) => (
                <View key={label} style={styles.statItem}>
                  <Text style={[styles.statCount, { color }]}>{count}</Text>
                  <Text style={styles.statLabel}>{label}</Text>
                </View>
              ))}
            </View>

            {/* Re-verify countdown */}
            {reVerifyIntervalMins > 0 && (
              <View style={styles.reVerifyCard}>
                <Ionicons name="time-outline" size={18} color={Colors.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.reVerifyTitle}>Next Re-Verification</Text>
                  <Text style={styles.reVerifyTime}>
                    {nextReVerifyIn > 0
                      ? `${Math.floor(nextReVerifyIn / 60)}m ${nextReVerifyIn % 60}s`
                      : 'Due now'}
                  </Text>
                </View>
                {verifyCount > 0 && (
                  <View style={styles.reVerifyBadge}>
                    <Text style={styles.reVerifyBadgeText}>{verifyCount} done</Text>
                  </View>
                )}
              </View>
            )}

            {/* Primary action */}
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => navigation.navigate('Students' as never)}
            >
              <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.primaryBtnGrad}>
                <Ionicons name="people-outline" size={24} color="white" />
                <Text style={styles.primaryBtnText}>Manage Students</Text>
                <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => navigation.navigate('Students' as never)}
            >
              <LinearGradient colors={[Colors.success, Colors.successDark]} style={styles.primaryBtnGrad}>
                <Ionicons name="scan-outline" size={24} color="white" />
                <Text style={styles.primaryBtnText}>Scan Student Entry</Text>
                <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
              </LinearGradient>
            </TouchableOpacity>

            {/* Session management row: End + Start Fresh */}
            <View style={styles.sessionActions}>
              <TouchableOpacity
                style={[styles.endSessionBtn, { flex: 1 }, isEnding && styles.btnDisabled]}
                onPress={handleEndSession}
                disabled={isEnding}
              >
                {isEnding ? (
                  <ActivityIndicator size="small" color={Colors.danger} />
                ) : (
                  <Ionicons name="stop-circle-outline" size={18} color={Colors.danger} />
                )}
                <Text style={styles.endSessionText}>
                  {isEnding ? 'Ending...' : 'End Session'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.freshSessionBtn, isStarting && styles.btnDisabled]}
                onPress={handleStartFresh}
                disabled={isStarting || isEnding}
              >
                <Ionicons name="refresh-circle-outline" size={18} color={Colors.warning} />
                <Text style={styles.freshSessionText}>Start Fresh</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          /* ── No active session view ── */
          <>
            {/* Exam info */}
            <View style={styles.infoCard}>
              <View style={styles.infoIconRow}>
                <Ionicons name="document-text-outline" size={20} color={Colors.primary} />
                <Text style={styles.infoCardTitle}>Examination</Text>
              </View>
              <Text style={styles.examTitle} numberOfLines={2}>{exam?.title ?? '—'}</Text>
              <Text style={styles.examCode}>{exam?.exam_code}</Text>
              {exam?.scheduled_start && (
                <View style={styles.infoRow}>
                  <Ionicons name="time-outline" size={15} color={Colors.textMuted} />
                  <Text style={styles.infoText}>
                    {new Date(exam.scheduled_start).toLocaleString()} · {exam.duration_mins} mins
                  </Text>
                </View>
              )}
            </View>

            {/* Hall info */}
            <View style={styles.infoCard}>
              <View style={styles.infoIconRow}>
                <Ionicons name="business-outline" size={20} color={Colors.secondary} />
                <Text style={styles.infoCardTitle}>Your Hall</Text>
              </View>
              <Text style={styles.hallName}>{hall?.hall_name ?? '—'}</Text>
              {hall?.building && (
                <View style={styles.infoRow}>
                  <Ionicons name="location-outline" size={15} color={Colors.textMuted} />
                  <Text style={styles.infoText}>{hall.building}{hall.floor ? ` · ${hall.floor}` : ''}</Text>
                </View>
              )}
              <View style={styles.infoRow}>
                <Ionicons name="people-outline" size={15} color={Colors.textMuted} />
                <Text style={styles.infoText}>Capacity: {hall?.capacity ?? '—'} seats · {exam?.total_enrolled ?? 0} enrolled</Text>
              </View>
            </View>

            {/* Instructions */}
            <View style={styles.instructionsCard}>
              <Ionicons name="information-circle-outline" size={18} color={Colors.info} />
              <Text style={styles.instructionsText}>
                Open the hall session when you are ready to begin checking in students. Students will be verified using face recognition.
              </Text>
            </View>

            {/* CTA */}
            <TouchableOpacity
              style={[styles.openSessionBtn, isStarting && styles.btnDisabled]}
              onPress={() => handleStartSession(false)}
              disabled={isStarting}
            >
              <LinearGradient colors={[Colors.success, Colors.successDark]} style={styles.openSessionGrad}>
                {isStarting ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Ionicons name="play-circle-outline" size={26} color="white" />
                )}
                <Text style={styles.openSessionText}>
                  {isStarting ? 'Opening Session...' : 'Open Hall Session'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  loadingText: { color: Colors.textMuted, fontSize: FontSizes.sm },
  // Header
  header: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.lg + 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold, color: 'white' },
  headerSubtitle: { fontSize: FontSizes.xs, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'white' },
  liveLabel: { color: 'white', fontSize: FontSizes.xs, fontWeight: FontWeights.bold, letterSpacing: 1 },
  timerText: { color: 'white', fontSize: FontSizes.xxxl, fontWeight: FontWeights.extrabold, letterSpacing: 2, marginTop: 4 },
  // Content
  scrollContent: { padding: Spacing.md, marginTop: -16, gap: Spacing.md, paddingBottom: Spacing.xxl },
  // Stats card
  statsCard: {
    flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: BorderRadius.xl,
    padding: Spacing.md, ...Shadow.sm,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statCount: { fontSize: FontSizes.xxl, fontWeight: FontWeights.extrabold },
  statLabel: { fontSize: FontSizes.xs, color: Colors.textSecondary },
  // Primary action buttons
  primaryBtn: { borderRadius: BorderRadius.xl, overflow: 'hidden', ...Shadow.md },
  primaryBtnGrad: {
    flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.sm,
  },
  primaryBtnText: { flex: 1, color: 'white', fontSize: FontSizes.md, fontWeight: FontWeights.semibold },
  // Session management row
  sessionActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  freshSessionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: Colors.warningFaded, borderRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    borderWidth: 1.5, borderColor: Colors.warning + '50',
  },
  freshSessionText: { color: Colors.warning, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  // End session
  endSessionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, backgroundColor: Colors.dangerFaded, borderRadius: BorderRadius.xl,
    padding: Spacing.md, borderWidth: 1.5, borderColor: Colors.danger + '40',
  },
  endSessionText: { color: Colors.danger, fontSize: FontSizes.md, fontWeight: FontWeights.semibold },
  // Info cards
  infoCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.xl,
    padding: Spacing.md, gap: Spacing.xs, ...Shadow.sm,
  },
  infoIconRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 4 },
  infoCardTitle: { fontSize: FontSizes.xs, fontWeight: FontWeights.bold, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  examTitle: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold, color: Colors.textPrimary },
  examCode: { fontSize: FontSizes.sm, color: Colors.primary, fontWeight: FontWeights.semibold },
  hallName: { fontSize: FontSizes.xl, fontWeight: FontWeights.bold, color: Colors.textPrimary },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoText: { fontSize: FontSizes.sm, color: Colors.textSecondary },
  instructionsCard: {
    flexDirection: 'row', gap: Spacing.sm, backgroundColor: Colors.infoFaded,
    borderRadius: BorderRadius.lg, padding: Spacing.md, borderLeftWidth: 3, borderLeftColor: Colors.info,
  },
  instructionsText: { flex: 1, fontSize: FontSizes.sm, color: Colors.textSecondary, lineHeight: 20 },
  // Open session button
  openSessionBtn: { borderRadius: BorderRadius.xl, overflow: 'hidden', ...Shadow.lg },
  openSessionGrad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: Spacing.lg, gap: Spacing.sm,
  },
  openSessionText: { color: 'white', fontSize: FontSizes.lg, fontWeight: FontWeights.bold },
  btnDisabled: { opacity: 0.6 },
  // Re-verify timer card
  reVerifyCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.warningFaded, borderRadius: BorderRadius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.warning + '40',
  },
  reVerifyTitle: { fontSize: FontSizes.xs, color: Colors.textSecondary, fontWeight: FontWeights.medium },
  reVerifyTime: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold, color: Colors.warning },
  reVerifyBadge: {
    backgroundColor: Colors.warning, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  reVerifyBadgeText: { fontSize: FontSizes.xs, color: 'white', fontWeight: FontWeights.bold },
});

export default HallSessionScreen;
