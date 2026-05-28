import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, RouteProp } from '@react-navigation/native';

import { useAppDispatch, useAppSelector } from '@/store';
import { loadSessionRecordsThunk, manualOverrideThunk } from '@/store/slices/attendance.slice';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/common/Button';
import { Avatar } from '@/components/common/Avatar';
import { InlineLoader } from '@/components/common/LoadingOverlay';
import { EmptyState } from '@/components/common/EmptyState';
import { Colors } from '@/constants/colors';
import { BorderRadius, FontSizes, FontWeights, Shadow, Spacing } from '@/constants/theme';
import { AttendanceRecord, AttendanceStatus } from '@/types';
import { TeacherStackParamList } from '@/navigation/types';
import { formatTime } from '@/utils/helpers';

type ReviewRoute = RouteProp<TeacherStackParamList, 'AttendanceReview'>;

const STATUS_OPTIONS: AttendanceStatus[] = ['present', 'absent', 'late', 'leave', 'manual_override'];

const AttendanceReviewScreen: React.FC = () => {
  const route = useRoute<ReviewRoute>();
  const dispatch = useAppDispatch();
  const { sessionId } = route.params;
  const { sessionRecords, isLoading } = useAppSelector((state) => state.attendance);

  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [isOverriding, setIsOverriding] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [newStatus, setNewStatus] = useState<AttendanceStatus>('present');

  useEffect(() => {
    dispatch(loadSessionRecordsThunk(sessionId));
  }, [dispatch, sessionId]);

  const handleOverride = useCallback(
    async () => {
      if (!selectedRecord) return;
      setIsOverriding(true);
      try {
        await dispatch(
          manualOverrideThunk({
            recordId: selectedRecord.id,
            status: newStatus,
            reason: overrideReason || 'Manual override by teacher',
          })
        );
        setShowModal(false);
        setSelectedRecord(null);
        setOverrideReason('');
        Alert.alert('Success', 'Attendance status updated');
      } catch {
        Alert.alert('Error', 'Failed to update attendance status');
      } finally {
        setIsOverriding(false);
      }
    },
    [selectedRecord, newStatus, overrideReason, dispatch]
  );

  const stats = {
    present: sessionRecords.filter((r) => r.status === 'present').length,
    absent: sessionRecords.filter((r) => r.status === 'absent').length,
    late: sessionRecords.filter((r) => r.status === 'late').length,
    leave: sessionRecords.filter((r) => r.status === 'leave').length,
  };
  const total = sessionRecords.length;
  const percentage = total > 0 ? Math.round(((stats.present + stats.late) / total) * 100) : 0;

  const renderRecord = useCallback(({ item }: { item: AttendanceRecord }) => (
    <TouchableOpacity
      style={styles.recordCard}
      onPress={() => {
        setSelectedRecord(item);
        setNewStatus(item.status);
        setOverrideReason('');
        setShowModal(true);
      }}
    >
      <Avatar name={item.student_name || 'S'} size={40} />
      <View style={styles.recordInfo}>
        <Text style={styles.recordName}>{item.student_name || 'Student'}</Text>
        <View style={styles.recordMeta}>
          <Text style={styles.recordTime}>{formatTime(item.marked_at)}</Text>
          {item.confidence_score && (
            <Text style={styles.recordConfidence}>
              {Math.round(item.confidence_score * 100)}%
            </Text>
          )}
          {item.status === 'manual_override' && (
            <View style={styles.overrideBadge}>
              <Ionicons name="create" size={10} color={Colors.info} />
              <Text style={styles.overrideBadgeText}>Overridden</Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.recordRight}>
        <StatusBadge status={item.status} size="sm" />
        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} style={{ marginTop: 4 }} />
      </View>
    </TouchableOpacity>
  ), []);

  if (isLoading) {
    return <InlineLoader message="Loading session records..." />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Summary bar */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryCircle}>
          <Text style={[styles.summaryPercentage, { color: percentage >= 75 ? Colors.success : Colors.danger }]}>
            {percentage}%
          </Text>
          <Text style={styles.summaryAttendance}>Attendance</Text>
        </View>
        <View style={styles.summaryStats}>
          {[
            { label: 'Present', value: stats.present, color: Colors.success },
            { label: 'Absent', value: stats.absent, color: Colors.danger },
            { label: 'Late', value: stats.late, color: Colors.warning },
            { label: 'Leave', value: stats.leave, color: Colors.secondary },
          ].map(({ label, value, color }) => (
            <View key={label} style={styles.summaryStat}>
              <Text style={[styles.summaryStatValue, { color }]}>{value}</Text>
              <Text style={styles.summaryStatLabel}>{label}</Text>
            </View>
          ))}
        </View>
      </View>

      <FlatList
        data={sessionRecords}
        renderItem={renderRecord}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            icon="people-outline"
            title="No Records"
            message="No attendance records found for this session"
          />
        }
      />

      {/* Override modal */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowModal(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Update Attendance</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {selectedRecord && (
              <>
                <View style={styles.modalStudent}>
                  <Avatar name={selectedRecord.student_name || 'S'} size={44} />
                  <View>
                    <Text style={styles.modalStudentName}>{selectedRecord.student_name || 'Student'}</Text>
                    <Text style={styles.modalCurrent}>
                      Current: <Text style={{ fontWeight: '600' }}>{selectedRecord.status}</Text>
                    </Text>
                  </View>
                </View>

                <Text style={styles.modalStatusLabel}>Select New Status</Text>
                <View style={styles.statusOptions}>
                  {STATUS_OPTIONS.map((status) => (
                    <TouchableOpacity
                      key={status}
                      style={[
                        styles.statusOption,
                        newStatus === status && styles.statusOptionSelected,
                      ]}
                      onPress={() => setNewStatus(status)}
                    >
                      <StatusBadge status={status} size="sm" />
                    </TouchableOpacity>
                  ))}
                </View>

                <Button
                  title={isOverriding ? 'Updating...' : 'Update Status'}
                  onPress={handleOverride}
                  loading={isOverriding}
                  fullWidth
                  size="md"
                  variant="primary"
                />
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.lg,
  },
  summaryCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: Colors.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
  },
  summaryPercentage: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold },
  summaryAttendance: { fontSize: FontSizes.xs, color: Colors.textMuted },
  summaryStats: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  summaryStat: { alignItems: 'center' },
  summaryStatValue: { fontSize: FontSizes.xl, fontWeight: FontWeights.bold },
  summaryStatLabel: { fontSize: FontSizes.xs, color: Colors.textSecondary },
  listContent: { padding: Spacing.md, flexGrow: 1, gap: Spacing.sm },
  recordCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.md,
    ...Shadow.sm,
  },
  recordInfo: { flex: 1 },
  recordName: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.textPrimary,
  },
  recordMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  recordTime: { fontSize: FontSizes.xs, color: Colors.textMuted },
  recordConfidence: { fontSize: FontSizes.xs, color: Colors.info },
  overrideBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: Colors.infoFaded,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  overrideBadgeText: { fontSize: 10, color: Colors.info },
  recordRight: { alignItems: 'flex-end' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: Colors.overlayDark,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  modalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
  },
  modalStudent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surfaceVariant,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  modalStudentName: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.semibold,
    color: Colors.textPrimary,
  },
  modalCurrent: { fontSize: FontSizes.sm, color: Colors.textSecondary, marginTop: 2 },
  modalStatusLabel: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  statusOption: {
    padding: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  statusOptionSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryFaded,
  },
});

export default AttendanceReviewScreen;
