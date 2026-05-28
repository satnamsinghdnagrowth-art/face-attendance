import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { examApi } from '@/api/exam.api';
import { Colors } from '@/constants/colors';
import { BorderRadius, FontSizes, FontWeights, Shadow, Spacing } from '@/constants/theme';

interface FormState {
  title: string;
  exam_code: string;
  scheduled_start: string;
  scheduled_end: string;
  duration_mins: string;
  face_threshold: string;
  flag_threshold: string;
  instructions: string;
}

type FormErrors = Partial<Record<keyof FormState, string>>;

const DEFAULT_FORM: FormState = {
  title: '',
  exam_code: '',
  scheduled_start: '',
  scheduled_end: '',
  duration_mins: '180',
  face_threshold: '0.85',
  flag_threshold: '0.70',
  instructions: '',
};

const CreateExamScreen: React.FC = () => {
  const navigation = useNavigation();
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setField = useCallback(<K extends keyof FormState>(key: K, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }, []);

  const validate = useCallback((): boolean => {
    const newErrors: FormErrors = {};

    if (!form.title.trim() || form.title.trim().length < 5)
      newErrors.title = 'Title must be at least 5 characters';

    if (!form.exam_code.trim() || form.exam_code.trim().length < 3)
      newErrors.exam_code = 'Exam code must be at least 3 characters';

    if (!form.scheduled_start)
      newErrors.scheduled_start = 'Start date/time is required';

    if (!form.scheduled_end)
      newErrors.scheduled_end = 'End date/time is required';

    if (form.scheduled_start && form.scheduled_end && form.scheduled_end <= form.scheduled_start)
      newErrors.scheduled_end = 'End time must be after start time';

    const dur = parseInt(form.duration_mins, 10);
    if (isNaN(dur) || dur < 30 || dur > 600)
      newErrors.duration_mins = 'Duration must be between 30 and 600 minutes';

    const faceT = parseFloat(form.face_threshold);
    if (isNaN(faceT) || faceT < 0.5 || faceT > 1.0)
      newErrors.face_threshold = 'Must be between 0.5 and 1.0';

    const flagT = parseFloat(form.flag_threshold);
    if (isNaN(flagT) || flagT < 0.3 || flagT > 0.9)
      newErrors.flag_threshold = 'Must be between 0.3 and 0.9';

    if (faceT <= flagT && !isNaN(faceT) && !isNaN(flagT))
      newErrors.face_threshold = 'Verification threshold must be higher than flag threshold';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form]);

  const handleSubmit = useCallback(async () => {
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      await examApi.createExam({
        title: form.title.trim(),
        exam_code: form.exam_code.trim().toUpperCase(),
        scheduled_start: new Date(form.scheduled_start).toISOString(),
        scheduled_end: new Date(form.scheduled_end).toISOString(),
        duration_mins: parseInt(form.duration_mins, 10),
        face_threshold: parseFloat(form.face_threshold),
        flag_threshold: parseFloat(form.flag_threshold),
        instructions: form.instructions.trim() || undefined,
      });
      Alert.alert('Exam Created', `"${form.title}" has been created successfully.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to create exam';
      Alert.alert('Error', msg);
    } finally {
      setIsSubmitting(false);
    }
  }, [form, validate, navigation]);

  const faceT = parseFloat(form.face_threshold) || 0.85;
  const flagT = parseFloat(form.flag_threshold) || 0.70;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Examination</Text>
        <View style={{ width: 38 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Exam Details */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Exam Details</Text>
            <View style={styles.card}>
              <Field label="Exam Title *" error={errors.title}>
                <TextInput
                  style={[styles.input, errors.title && styles.inputError]}
                  value={form.title}
                  onChangeText={(v) => setField('title', v)}
                  placeholder="e.g. Computer Science Final 2026"
                  placeholderTextColor={Colors.textMuted}
                />
              </Field>

              <Field label="Exam Code *" error={errors.exam_code}>
                <TextInput
                  style={[styles.input, errors.exam_code && styles.inputError]}
                  value={form.exam_code}
                  onChangeText={(v) => setField('exam_code', v.toUpperCase())}
                  placeholder="e.g. CS-FINAL-2026"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="characters"
                />
              </Field>

              <Field label="Instructions (optional)">
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={form.instructions}
                  onChangeText={(v) => setField('instructions', v)}
                  placeholder="Instructions for invigilators..."
                  placeholderTextColor={Colors.textMuted}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </Field>
            </View>
          </View>

          {/* Schedule */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Schedule</Text>
            <View style={styles.card}>
              <Field label="Start Date & Time *" error={errors.scheduled_start}
                hint="Format: YYYY-MM-DD HH:MM">
                <TextInput
                  style={[styles.input, errors.scheduled_start && styles.inputError]}
                  value={form.scheduled_start}
                  onChangeText={(v) => setField('scheduled_start', v)}
                  placeholder="2026-06-15 09:00"
                  placeholderTextColor={Colors.textMuted}
                />
              </Field>

              <Field label="End Date & Time *" error={errors.scheduled_end}
                hint="Format: YYYY-MM-DD HH:MM">
                <TextInput
                  style={[styles.input, errors.scheduled_end && styles.inputError]}
                  value={form.scheduled_end}
                  onChangeText={(v) => setField('scheduled_end', v)}
                  placeholder="2026-06-15 12:00"
                  placeholderTextColor={Colors.textMuted}
                />
              </Field>

              <Field label="Duration (minutes) *" error={errors.duration_mins}>
                <TextInput
                  style={[styles.input, errors.duration_mins && styles.inputError]}
                  value={form.duration_mins}
                  onChangeText={(v) => setField('duration_mins', v)}
                  placeholder="180"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="numeric"
                />
              </Field>
            </View>
          </View>

          {/* Security Settings */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Security Settings</Text>
            <View style={styles.card}>
              <Field
                label="Verification Threshold *"
                error={errors.face_threshold}
                hint="Minimum confidence to mark VERIFIED (0.5 – 1.0). Default: 0.85"
              >
                <TextInput
                  style={[styles.input, errors.face_threshold && styles.inputError]}
                  value={form.face_threshold}
                  onChangeText={(v) => setField('face_threshold', v)}
                  placeholder="0.85"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="decimal-pad"
                />
              </Field>

              <Field
                label="Flag Threshold *"
                error={errors.flag_threshold}
                hint="Below this score triggers a manual review alert. Default: 0.70"
              >
                <TextInput
                  style={[styles.input, errors.flag_threshold && styles.inputError]}
                  value={form.flag_threshold}
                  onChangeText={(v) => setField('flag_threshold', v)}
                  placeholder="0.70"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="decimal-pad"
                />
              </Field>

              {/* Visual confidence scale */}
              <View style={styles.scaleContainer}>
                <Text style={styles.scaleLabel}>Confidence Scale</Text>
                <View style={styles.scale}>
                  <View style={[styles.scaleSegment, styles.scaleRed, { flex: Math.round(flagT * 10) }]} />
                  <View style={[styles.scaleSegment, styles.scaleAmber, { flex: Math.round((faceT - flagT) * 10) }]} />
                  <View style={[styles.scaleSegment, styles.scaleGreen, { flex: Math.round((1 - faceT) * 10) }]} />
                </View>
                <View style={styles.scaleTextRow}>
                  <Text style={[styles.scaleSegLabel, { color: Colors.danger }]}>Rejected</Text>
                  <Text style={[styles.scaleSegLabel, { color: Colors.warning }]}>Flagged</Text>
                  <Text style={[styles.scaleSegLabel, { color: Colors.success }]}>Verified</Text>
                </View>
                <View style={styles.scaleMarkers}>
                  <Text style={styles.scaleMarker}>0.0</Text>
                  <Text style={styles.scaleMarker}>{form.flag_threshold}</Text>
                  <Text style={styles.scaleMarker}>{form.face_threshold}</Text>
                  <Text style={styles.scaleMarker}>1.0</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Ionicons name="checkmark-circle-outline" size={22} color="white" />
            )}
            <Text style={styles.submitBtnText}>
              {isSubmitting ? 'Creating...' : 'Create Examination'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// Simple form field wrapper component
const Field: React.FC<{
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}> = ({ label, error, hint, children }) => (
  <View style={fieldStyles.container}>
    <Text style={fieldStyles.label}>{label}</Text>
    {children}
    {hint && !error && <Text style={fieldStyles.hint}>{hint}</Text>}
    {error && <Text style={fieldStyles.error}>{error}</Text>}
  </View>
);

const fieldStyles = StyleSheet.create({
  container: { marginBottom: Spacing.md },
  label: { fontSize: FontSizes.sm, fontWeight: FontWeights.semibold, color: Colors.textSecondary, marginBottom: 6 },
  hint: { fontSize: FontSizes.xs, color: Colors.textMuted, marginTop: 4 },
  error: { fontSize: FontSizes.xs, color: Colors.danger, marginTop: 4 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
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
  scrollContent: { padding: Spacing.md, paddingBottom: Spacing.xxl, gap: Spacing.md },
  section: { gap: Spacing.sm },
  sectionTitle: {
    fontSize: FontSizes.sm, fontWeight: FontWeights.bold, color: Colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 4,
  },
  card: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.xl,
    padding: Spacing.md, ...Shadow.sm,
  },
  input: {
    backgroundColor: Colors.surfaceVariant, borderRadius: BorderRadius.md,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: FontSizes.md, color: Colors.textPrimary,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  inputError: { borderColor: Colors.danger + '80', backgroundColor: Colors.dangerFaded },
  textArea: { minHeight: 80 },
  // Confidence scale
  scaleContainer: { marginTop: Spacing.sm, gap: Spacing.sm },
  scaleLabel: { fontSize: FontSizes.xs, fontWeight: FontWeights.semibold, color: Colors.textSecondary },
  scale: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden' },
  scaleSegment: { height: '100%' },
  scaleRed: { backgroundColor: Colors.danger },
  scaleAmber: { backgroundColor: Colors.warning },
  scaleGreen: { backgroundColor: Colors.success },
  scaleTextRow: { flexDirection: 'row', justifyContent: 'space-between' },
  scaleSegLabel: { fontSize: FontSizes.xs, fontWeight: FontWeights.semibold },
  scaleMarkers: { flexDirection: 'row', justifyContent: 'space-between' },
  scaleMarker: { fontSize: FontSizes.xs, color: Colors.textMuted },
  // Submit
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, backgroundColor: Colors.primary, borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.md + 2, ...Shadow.lg,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: 'white', fontSize: FontSizes.lg, fontWeight: FontWeights.bold },
});

export default CreateExamScreen;
