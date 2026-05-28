import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Colors } from '@/constants/colors';
import { BorderRadius, FontSizes, FontWeights, Shadow, Spacing } from '@/constants/theme';
import { attendanceApi } from '@/api/attendance.api';
import { LeaveRequest } from '@/types';
import { formatDate, getRelativeTime } from '@/utils/helpers';

const statusConfig: Record<string, { color: string; bg: string; label: string; icon: string }> = {
  pending: { color: Colors.warning, bg: Colors.warningFaded, label: 'Pending', icon: 'time-outline' },
  approved: { color: Colors.success, bg: Colors.successFaded, label: 'Approved', icon: 'checkmark-circle-outline' },
  rejected: { color: Colors.danger, bg: Colors.dangerFaded, label: 'Rejected', icon: 'close-circle-outline' },
};

const LeaveRequestScreen: React.FC = () => {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fromError, setFromError] = useState('');
  const [toError, setToError] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadLeaveRequests = useCallback(async () => {
    try {
      const response = await attendanceApi.getLeaveRequests();
      setLeaveRequests(response.data.data as LeaveRequest[]);
    } catch (error) {
      console.error('Failed to load leave requests:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLeaveRequests();
  }, [loadLeaveRequests]);

  const validateForm = useCallback(() => {
    let valid = true;
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

    if (!fromDate) { setFromError('From date is required'); valid = false; }
    else if (!dateRegex.test(fromDate)) { setFromError('Use format YYYY-MM-DD'); valid = false; }
    else { setFromError(''); }

    if (!toDate) { setToError('To date is required'); valid = false; }
    else if (!dateRegex.test(toDate)) { setToError('Use format YYYY-MM-DD'); valid = false; }
    else if (toDate < fromDate) { setToError('To date cannot be before from date'); valid = false; }
    else { setToError(''); }

    if (!reason.trim()) { setReasonError('Reason is required'); valid = false; }
    else if (reason.trim().length < 10) { setReasonError('Please provide more detail (min 10 characters)'); valid = false; }
    else { setReasonError(''); }

    return valid;
  }, [fromDate, toDate, reason]);

  const handleSubmit = useCallback(async () => {
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      await attendanceApi.submitLeaveRequest({
        from_date: fromDate,
        to_date: toDate,
        reason: reason.trim(),
      });

      Alert.alert(
        'Request Submitted',
        'Your leave request has been submitted successfully. You will be notified once it is reviewed.',
        [{ text: 'OK' }]
      );

      setFromDate('');
      setToDate('');
      setReason('');
      await loadLeaveRequests();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      Alert.alert('Error', e?.response?.data?.message || 'Failed to submit leave request.');
    } finally {
      setIsSubmitting(false);
    }
  }, [fromDate, toDate, reason, validateForm, loadLeaveRequests]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Submit form */}
          <View style={styles.formCard}>
            <View style={styles.formHeader}>
              <View style={styles.formHeaderIcon}>
                <Ionicons name="document-text-outline" size={22} color={Colors.secondary} />
              </View>
              <View>
                <Text style={styles.formTitle}>New Leave Request</Text>
                <Text style={styles.formSubtitle}>Request leave for specific dates</Text>
              </View>
            </View>

            <Input
              label="From Date"
              value={fromDate}
              onChangeText={setFromDate}
              placeholder="YYYY-MM-DD"
              leftIcon="calendar-outline"
              error={fromError}
              keyboardType="numeric"
              hint="e.g., 2024-12-01"
            />

            <Input
              label="To Date"
              value={toDate}
              onChangeText={setToDate}
              placeholder="YYYY-MM-DD"
              leftIcon="calendar-outline"
              error={toError}
              keyboardType="numeric"
              hint="e.g., 2024-12-03"
            />

            <Input
              label="Reason"
              value={reason}
              onChangeText={setReason}
              placeholder="Explain the reason for your leave request..."
              leftIcon="chatbubble-outline"
              multiline
              numberOfLines={4}
              error={reasonError}
            />

            <Button
              title="Submit Leave Request"
              onPress={handleSubmit}
              loading={isSubmitting}
              disabled={isSubmitting}
              fullWidth
              size="lg"
              variant="secondary"
              icon="send-outline"
              iconPosition="right"
            />
          </View>

          {/* Past requests */}
          <View style={styles.historySection}>
            <Text style={styles.historyTitle}>Past Leave Requests</Text>

            {isLoading ? (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Loading requests...</Text>
              </View>
            ) : leaveRequests.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="document-outline" size={36} color={Colors.textMuted} />
                <Text style={styles.emptyText}>No leave requests yet</Text>
              </View>
            ) : (
              leaveRequests.map((request) => {
                const config = statusConfig[request.status] || statusConfig.pending;
                return (
                  <View key={request.id} style={styles.requestCard}>
                    <View style={styles.requestHeader}>
                      <View>
                        <Text style={styles.requestDates}>
                          {formatDate(request.from_date)} → {formatDate(request.to_date)}
                        </Text>
                        <Text style={styles.requestTime}>
                          Submitted {getRelativeTime(request.created_at)}
                        </Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: config.bg }]}>
                        <Ionicons name={config.icon as never} size={14} color={config.color} />
                        <Text style={[styles.statusText, { color: config.color }]}>
                          {config.label}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.requestReason} numberOfLines={2}>
                      {request.reason}
                    </Text>
                    {request.review_note && (
                      <View style={styles.reviewNote}>
                        <Ionicons name="chatbubble-ellipses-outline" size={14} color={Colors.textSecondary} />
                        <Text style={styles.reviewNoteText}>{request.review_note}</Text>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  formCard: {
    margin: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    ...Shadow.md,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  formHeaderIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.secondaryFaded,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
  },
  formSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  historySection: {
    margin: Spacing.md,
    marginTop: 0,
  },
  historyTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  loadingContainer: {
    alignItems: 'center',
    padding: Spacing.xl,
  },
  loadingText: {
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  emptyText: {
    fontSize: FontSizes.md,
    color: Colors.textMuted,
  },
  requestCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadow.sm,
  },
  requestHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  requestDates: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.textPrimary,
  },
  requestTime: {
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  statusText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },
  requestReason: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  reviewNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: Spacing.sm,
    backgroundColor: Colors.surfaceVariant,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
  },
  reviewNoteText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
});

export default LeaveRequestScreen;
