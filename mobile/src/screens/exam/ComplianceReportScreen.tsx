import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Share, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';

import { examApi, ExamWithStats, ExamStats } from '@/api/exam.api';
import { API_BASE_URL } from '@/api/client';
import { Colors } from '@/constants/colors';
import { BorderRadius, FontSizes, FontWeights, Shadow, Spacing } from '@/constants/theme';
import { ExamStackParamList } from '@/navigation/types';

type RouteParams = RouteProp<ExamStackParamList, 'ComplianceReport'>;

const ComplianceReportScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<RouteParams>();
  // Defensive access — ComplianceReport always requires examId (stack-only screen)
  const examId: string = (route.params as { examId?: string } | undefined)?.examId ?? '';

  const [exam, setExam] = useState<ExamWithStats | null>(null);
  const [stats, setStats] = useState<ExamStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'pdf'>('csv');

  const loadData = useCallback(async () => {
    try {
      const [examRes, statsRes] = await Promise.allSettled([
        examApi.getExam(examId),
        examApi.getExamStats(examId),
      ]);
      if (examRes.status === 'fulfilled') setExam(examRes.value.data.data);
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data.data);
    } finally {
      setIsLoading(false);
    }
  }, [examId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const token = await SecureStore.getItemAsync('access_token');
      const url = `${API_BASE_URL}/v2/exams/${examId}/export?format=${exportFormat}`;
      const filename = `exam_report_${examId}_${Date.now()}.${exportFormat}`;
      const fileUri = `${(FileSystem as unknown as { cacheDirectory: string }).cacheDirectory ?? ''}${filename}`;

      const result = await FileSystem.downloadAsync(url, fileUri, {
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });

      if (result.status === 200) {
        const shareUri = Platform.OS === 'android'
          ? await FileSystem.getContentUriAsync(result.uri)
          : result.uri;
        await Share.share({
          url: shareUri,
          title: `Exam Compliance Report`,
          message: `Compliance report for ${exam?.title ?? 'examination'}`,
        });
      } else {
        Alert.alert('Export Failed', 'Could not generate the report. Please try again.');
      }
    } catch {
      Alert.alert('Export Failed', 'Failed to export. Please check your connection.');
    } finally {
      setIsExporting(false);
    }
  }, [examId, exam, exportFormat]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const attendanceRate = stats && stats.total_enrolled > 0
    ? ((stats.verified / stats.total_enrolled) * 100).toFixed(1)
    : '0.0';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Compliance Report</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Exam info */}
        <View style={styles.examCard}>
          <Text style={styles.examTitle}>{exam?.title ?? '—'}</Text>
          <Text style={styles.examCode}>{exam?.exam_code}</Text>
          {exam?.scheduled_start && (
            <Text style={styles.examDate}>
              {new Date(exam.scheduled_start).toLocaleDateString('en', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}
            </Text>
          )}
          <View style={[
            styles.statusBadge,
            { backgroundColor: exam?.status === 'completed' ? Colors.successFaded : Colors.warningFaded },
          ]}>
            <Text style={[styles.statusText, { color: exam?.status === 'completed' ? Colors.success : Colors.warning }]}>
              {exam?.status?.toUpperCase() ?? 'UNKNOWN'}
            </Text>
          </View>
        </View>

        {/* Summary stats */}
        {stats && (
          <View style={styles.statsGrid}>
            {[
              { label: 'Total Enrolled', value: stats.total_enrolled, color: Colors.primary },
              { label: 'Verified', value: stats.verified, color: Colors.success },
              { label: 'Flagged', value: stats.flagged, color: Colors.warning },
              { label: 'Rejected', value: stats.rejected, color: Colors.danger },
              { label: 'No Show', value: stats.no_show, color: Colors.textMuted },
              { label: 'Proxy Cases', value: stats.proxy_suspects, color: Colors.danger },
            ].map(({ label, value, color }) => (
              <View key={label} style={[styles.statCard, { borderTopColor: color }]}>
                <Text style={[styles.statValue, { color }]}>{value}</Text>
                <Text style={styles.statLabel}>{label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Attendance rate */}
        <View style={styles.rateCard}>
          <Text style={styles.rateTitle}>Overall Verification Rate</Text>
          <Text style={[styles.rateValue, {
            color: parseFloat(attendanceRate) >= 75 ? Colors.success : Colors.danger,
          }]}>
            {attendanceRate}%
          </Text>
          <View style={styles.rateTrack}>
            <View style={[
              styles.rateFill,
              {
                width: `${Math.min(parseFloat(attendanceRate), 100)}%` as `${number}%`,
                backgroundColor: parseFloat(attendanceRate) >= 75 ? Colors.success : Colors.danger,
              },
            ]} />
          </View>
        </View>

        {/* Digital signature / report hash */}
        {(exam as any)?.report_hash && (
          <View style={styles.hashCard}>
            <Ionicons name="shield-checkmark-outline" size={16} color={Colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={styles.hashTitle}>Digital Signature</Text>
              <Text style={styles.hashValue} numberOfLines={1}>
                {((exam as any).report_hash as string).slice(0, 32)}...
              </Text>
              <Text style={styles.hashNote}>SHA-256 tamper-evident hash</Text>
            </View>
          </View>
        )}

        {/* Format picker */}
        <View style={styles.formatPicker}>
          <TouchableOpacity
            style={[styles.formatBtn, exportFormat === 'csv' && styles.formatBtnActive]}
            onPress={() => setExportFormat('csv')}
          >
            <Text style={[styles.formatBtnText, exportFormat === 'csv' && styles.formatBtnTextActive]}>CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.formatBtn, exportFormat === 'pdf' && styles.formatBtnActive]}
            onPress={() => setExportFormat('pdf')}
          >
            <Text style={[styles.formatBtnText, exportFormat === 'pdf' && styles.formatBtnTextActive]}>PDF</Text>
          </TouchableOpacity>
        </View>

        {/* Export action */}
        <TouchableOpacity
          style={[styles.exportBtn, isExporting && styles.exportBtnDisabled]}
          onPress={handleExport}
          disabled={isExporting}
        >
          {isExporting ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Ionicons name="download-outline" size={22} color="white" />
          )}
          <Text style={styles.exportBtnText}>
            {isExporting
              ? 'Generating Report...'
              : `Export Compliance Report (${exportFormat.toUpperCase()})`}
          </Text>
        </TouchableOpacity>

        <Text style={styles.legalNote}>
          This report contains an immutable audit trail of all identity verification events. Suitable for submission to examination regulatory bodies.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Colors.surfaceVariant, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: FontSizes.xl, fontWeight: FontWeights.bold, color: Colors.textPrimary },
  scrollContent: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },
  examCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.xl,
    padding: Spacing.lg, alignItems: 'center', gap: Spacing.sm, ...Shadow.md,
  },
  examTitle: { fontSize: FontSizes.xl, fontWeight: FontWeights.bold, color: Colors.textPrimary, textAlign: 'center' },
  examCode: { fontSize: FontSizes.md, color: Colors.primary, fontWeight: FontWeights.semibold },
  examDate: { fontSize: FontSizes.sm, color: Colors.textSecondary },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: BorderRadius.full },
  statusText: { fontSize: FontSizes.xs, fontWeight: FontWeights.bold, letterSpacing: 0.5 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  statCard: {
    width: '31%', backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    padding: Spacing.sm + 4, alignItems: 'center', gap: 4,
    borderTopWidth: 3, ...Shadow.sm,
  },
  statValue: { fontSize: FontSizes.xxl, fontWeight: FontWeights.extrabold },
  statLabel: { fontSize: FontSizes.xs, color: Colors.textSecondary, textAlign: 'center' },
  rateCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.xl,
    padding: Spacing.md, gap: Spacing.sm, ...Shadow.sm,
  },
  rateTitle: { fontSize: FontSizes.md, fontWeight: FontWeights.semibold, color: Colors.textSecondary },
  rateValue: { fontSize: FontSizes.xxxl, fontWeight: FontWeights.extrabold },
  rateTrack: { height: 8, backgroundColor: Colors.border, borderRadius: 4, overflow: 'hidden' },
  rateFill: { height: '100%', borderRadius: 4 },
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, backgroundColor: Colors.primary, borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.md, ...Shadow.md,
  },
  exportBtnDisabled: { opacity: 0.6 },
  exportBtnText: { color: 'white', fontSize: FontSizes.md, fontWeight: FontWeights.bold },
  legalNote: {
    fontSize: FontSizes.xs, color: Colors.textMuted, textAlign: 'center',
    lineHeight: 18, paddingHorizontal: Spacing.md,
  },
  // Format picker
  formatPicker: {
    flexDirection: 'row', gap: Spacing.sm,
  },
  formatBtn: {
    flex: 1, alignItems: 'center', paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  formatBtnActive: {
    borderColor: Colors.primary, backgroundColor: Colors.primary + '15',
  },
  formatBtnText: {
    fontSize: FontSizes.md, fontWeight: FontWeights.semibold, color: Colors.textSecondary,
  },
  formatBtnTextActive: {
    color: Colors.primary,
  },
  // Hash card
  hashCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: Colors.successFaded, borderRadius: BorderRadius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.success + '40',
  },
  hashTitle: {
    fontSize: FontSizes.xs, fontWeight: FontWeights.bold, color: Colors.success,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  hashValue: {
    fontSize: FontSizes.sm, fontWeight: FontWeights.medium, color: Colors.textPrimary,
    fontVariant: ['tabular-nums'], marginTop: 2,
  },
  hashNote: {
    fontSize: FontSizes.xs, color: Colors.textMuted, marginTop: 2,
  },
});

export default ComplianceReportScreen;
