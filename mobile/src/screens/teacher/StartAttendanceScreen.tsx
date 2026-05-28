import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { useAppDispatch, useAppSelector } from '@/store';
import { startSessionThunk, endSessionThunk } from '@/store/slices/attendance.slice';
import { Button } from '@/components/common/Button';
import { Colors } from '@/constants/colors';
import { BorderRadius, FontSizes, FontWeights, Shadow, Spacing } from '@/constants/theme';
import { userApi } from '@/api/user.api';
import { useLocation } from '@/hooks/useLocation';
import { ClassRoom, Subject } from '@/types';
import { formatTime } from '@/utils/helpers';

const StartAttendanceScreen: React.FC = () => {
  const navigation = useNavigation();
  const dispatch = useAppDispatch();
  const { currentSession, isSessionLoading } = useAppSelector((state) => state.attendance);
  const { getLocation } = useLocation();

  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedClass, setSelectedClass] = useState<ClassRoom | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [locationData, setLocationData] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isLoadingClasses, setIsLoadingClasses] = useState(true);
  const [showClassPicker, setShowClassPicker] = useState(false);
  const [showSubjectPicker, setShowSubjectPicker] = useState(false);

  const loadClasses = useCallback(async () => {
    try {
      const response = await userApi.getClasses();
      setClasses(response.data.data);
    } catch {
      Alert.alert('Error', 'Failed to load classes');
    } finally {
      setIsLoadingClasses(false);
    }
  }, []);

  const loadSubjects = useCallback(async (classId: string) => {
    try {
      const response = await userApi.getSubjects({ class_id: classId });
      setSubjects(response.data.data);
    } catch {
      setSubjects([]);
    }
  }, []);

  useEffect(() => {
    loadClasses();
    // Get location
    getLocation().then((loc) => {
      if (loc) setLocationData(loc);
    });
  }, [loadClasses, getLocation]);

  const handleClassSelect = useCallback(
    (cls: ClassRoom) => {
      setSelectedClass(cls);
      setSelectedSubject(null);
      setShowClassPicker(false);
      loadSubjects(cls.id);
    },
    [loadSubjects]
  );

  const handleSubjectSelect = useCallback((subject: Subject) => {
    setSelectedSubject(subject);
    setShowSubjectPicker(false);
  }, []);

  const handleStartSession = useCallback(async () => {
    if (!selectedClass || !selectedSubject) {
      Alert.alert('Missing Information', 'Please select a class and subject to start attendance.');
      return;
    }

    const result = await dispatch(
      startSessionThunk({
        class_id: selectedClass.id,
        subject_id: selectedSubject.id,
        location: locationData || undefined,
      })
    );

    if (startSessionThunk.fulfilled.match(result)) {
      const session = result.payload;
      (navigation as any).navigate('LiveScan', { sessionId: session.id });
    } else {
      Alert.alert('Error', result.payload as string || 'Failed to start session');
    }
  }, [selectedClass, selectedSubject, locationData, dispatch, navigation]);

  const handleEndSession = useCallback(async () => {
    if (!currentSession) return;
    Alert.alert(
      'End Session',
      'Are you sure you want to end this attendance session?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Session',
          style: 'destructive',
          onPress: async () => {
            await dispatch(endSessionThunk(currentSession.id));
          },
        },
      ]
    );
  }, [currentSession, dispatch]);

  // Active session view
  if (currentSession?.status === 'active') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.activeSessionCard}>
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>

            <Text style={styles.activeTitle}>Attendance In Progress</Text>
            <Text style={styles.activeSubtitle}>
              {currentSession.subject_name || 'Subject'} — {currentSession.class_name || 'Class'}
            </Text>

            <View style={styles.sessionMetrics}>
              <View style={styles.metricItem}>
                <Ionicons name="people-outline" size={24} color={Colors.success} />
                <Text style={styles.metricValue}>{currentSession.present_count || 0}</Text>
                <Text style={styles.metricLabel}>Present</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricItem}>
                <Ionicons name="close-circle-outline" size={24} color={Colors.danger} />
                <Text style={styles.metricValue}>{currentSession.absent_count || 0}</Text>
                <Text style={styles.metricLabel}>Absent</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricItem}>
                <Ionicons name="time-outline" size={24} color={Colors.textMuted} />
                <Text style={styles.metricValue}>{currentSession.total_students || 0}</Text>
                <Text style={styles.metricLabel}>Total</Text>
              </View>
            </View>

            <Text style={styles.sessionStarted}>
              Started at {formatTime(currentSession.start_time)}
            </Text>
          </View>

          <View style={styles.activeActions}>
            <Button
              title="Continue Scanning"
              onPress={() =>
                (navigation as any).navigate('LiveScan', { sessionId: currentSession.id })
              }
              fullWidth
              size="lg"
              icon="scan-outline"
            />
            <Button
              title="End Session"
              onPress={handleEndSession}
              fullWidth
              size="md"
              variant="danger"
              icon="stop-circle-outline"
              style={styles.endButton}
              loading={isSessionLoading}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="play-circle-outline" size={28} color={Colors.secondary} />
            </View>
            <Text style={styles.headerTitle}>Start Attendance</Text>
            <Text style={styles.headerSubtitle}>Configure and begin a new attendance session</Text>
          </View>

          <View style={styles.content}>
            {/* Class selector */}
            <View style={styles.pickerSection}>
              <Text style={styles.pickerLabel}>Select Class</Text>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setShowClassPicker(!showClassPicker)}
              >
                <View style={styles.pickerLeft}>
                  <Ionicons name="school-outline" size={20} color={Colors.textSecondary} />
                  <Text style={[styles.pickerText, !selectedClass && styles.pickerPlaceholder]}>
                    {selectedClass ? `${selectedClass.name} — ${selectedClass.department}` : 'Choose a class...'}
                  </Text>
                </View>
                <Ionicons
                  name={showClassPicker ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={Colors.textSecondary}
                />
              </TouchableOpacity>

              {showClassPicker && (
                <View style={styles.dropdownList}>
                  {isLoadingClasses ? (
                    <Text style={styles.dropdownLoading}>Loading classes...</Text>
                  ) : classes.length === 0 ? (
                    <Text style={styles.dropdownEmpty}>No classes found</Text>
                  ) : (
                    classes.map((cls) => (
                      <TouchableOpacity
                        key={cls.id}
                        style={[
                          styles.dropdownItem,
                          selectedClass?.id === cls.id && styles.dropdownItemSelected,
                        ]}
                        onPress={() => handleClassSelect(cls)}
                      >
                        <Text style={[styles.dropdownItemText, selectedClass?.id === cls.id && { color: Colors.primary }]}>
                          {cls.name}
                        </Text>
                        <Text style={styles.dropdownItemSub}>
                          {cls.department} • Sem {cls.semester}
                        </Text>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              )}
            </View>

            {/* Subject selector */}
            <View style={styles.pickerSection}>
              <Text style={styles.pickerLabel}>Select Subject</Text>
              <TouchableOpacity
                style={[styles.pickerButton, !selectedClass && styles.pickerDisabled]}
                onPress={() => selectedClass && setShowSubjectPicker(!showSubjectPicker)}
                disabled={!selectedClass}
              >
                <View style={styles.pickerLeft}>
                  <Ionicons name="book-outline" size={20} color={Colors.textSecondary} />
                  <Text style={[styles.pickerText, !selectedSubject && styles.pickerPlaceholder]}>
                    {selectedSubject
                      ? `${selectedSubject.code} — ${selectedSubject.name}`
                      : selectedClass
                      ? 'Choose a subject...'
                      : 'Select class first'}
                  </Text>
                </View>
                <Ionicons
                  name={showSubjectPicker ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={Colors.textSecondary}
                />
              </TouchableOpacity>

              {showSubjectPicker && (
                <View style={styles.dropdownList}>
                  {subjects.length === 0 ? (
                    <Text style={styles.dropdownEmpty}>No subjects for this class</Text>
                  ) : (
                    subjects.map((subject) => (
                      <TouchableOpacity
                        key={subject.id}
                        style={[
                          styles.dropdownItem,
                          selectedSubject?.id === subject.id && styles.dropdownItemSelected,
                        ]}
                        onPress={() => handleSubjectSelect(subject)}
                      >
                        <Text style={[styles.dropdownItemText, selectedSubject?.id === subject.id && { color: Colors.primary }]}>
                          {subject.name}
                        </Text>
                        <Text style={styles.dropdownItemSub}>{subject.code}</Text>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              )}
            </View>

            {/* Location info */}
            <View style={styles.locationCard}>
              <Ionicons
                name={locationData ? 'location' : 'location-outline'}
                size={20}
                color={locationData ? Colors.success : Colors.textMuted}
              />
              <Text style={styles.locationText}>
                {locationData
                  ? `Location captured (${locationData.latitude.toFixed(4)}, ${locationData.longitude.toFixed(4)})`
                  : 'Location not available'}
              </Text>
            </View>

            {/* Session preview */}
            {selectedClass && selectedSubject && (
              <View style={styles.previewCard}>
                <Text style={styles.previewTitle}>Session Preview</Text>
                <View style={styles.previewRow}>
                  <Ionicons name="school-outline" size={16} color={Colors.textSecondary} />
                  <Text style={styles.previewText}>{selectedClass.name} — {selectedClass.department}</Text>
                </View>
                <View style={styles.previewRow}>
                  <Ionicons name="book-outline" size={16} color={Colors.textSecondary} />
                  <Text style={styles.previewText}>{selectedSubject.code} — {selectedSubject.name}</Text>
                </View>
                <View style={styles.previewRow}>
                  <Ionicons name="time-outline" size={16} color={Colors.textSecondary} />
                  <Text style={styles.previewText}>Starting now — {new Date().toLocaleTimeString()}</Text>
                </View>
              </View>
            )}

            <Button
              title="Start Attendance Session"
              onPress={handleStartSession}
              loading={isSessionLoading}
              disabled={!selectedClass || !selectedSubject || isSessionLoading}
              fullWidth
              size="lg"
              variant="secondary"
              icon="play-circle"
              iconPosition="right"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    alignItems: 'center',
    padding: Spacing.xl,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  headerIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.secondaryFaded,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: FontSizes.xxl, fontWeight: FontWeights.bold, color: Colors.textPrimary },
  headerSubtitle: { fontSize: FontSizes.sm, color: Colors.textSecondary, textAlign: 'center' },
  content: { padding: Spacing.md, gap: Spacing.md },
  pickerSection: { gap: Spacing.sm },
  pickerLabel: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.textSecondary,
    letterSpacing: 0.3,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  pickerDisabled: {
    backgroundColor: Colors.surfaceVariant,
    opacity: 0.6,
  },
  pickerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  pickerText: { fontSize: FontSizes.md, color: Colors.textPrimary, flex: 1 },
  pickerPlaceholder: { color: Colors.textMuted },
  dropdownList: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.md,
  },
  dropdownLoading: { padding: Spacing.md, textAlign: 'center', color: Colors.textMuted },
  dropdownEmpty: { padding: Spacing.md, textAlign: 'center', color: Colors.textMuted, fontStyle: 'italic' },
  dropdownItem: {
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  dropdownItemSelected: { backgroundColor: Colors.primaryFaded },
  dropdownItemText: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.medium,
    color: Colors.textPrimary,
  },
  dropdownItemSub: { fontSize: FontSizes.xs, color: Colors.textSecondary, marginTop: 2 },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  locationText: { fontSize: FontSizes.sm, color: Colors.textSecondary, flex: 1 },
  previewCard: {
    backgroundColor: Colors.secondaryFaded,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.secondary + '30',
  },
  previewTitle: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
    color: Colors.secondary,
    marginBottom: Spacing.xs,
  },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  previewText: { fontSize: FontSizes.sm, color: Colors.textSecondary, flex: 1 },
  activeSessionCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    ...Shadow.md,
    gap: Spacing.md,
    borderWidth: 2,
    borderColor: Colors.success + '40',
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dangerFaded,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.danger,
  },
  liveText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    color: Colors.danger,
    letterSpacing: 1,
  },
  activeTitle: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  activeSubtitle: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  sessionMetrics: {
    flexDirection: 'row',
    width: '100%',
    backgroundColor: Colors.surfaceVariant,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  metricItem: { flex: 1, alignItems: 'center', gap: 4 },
  metricDivider: { width: 1, backgroundColor: Colors.border },
  metricValue: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
  },
  metricLabel: { fontSize: FontSizes.xs, color: Colors.textSecondary },
  sessionStarted: { fontSize: FontSizes.sm, color: Colors.textMuted },
  activeActions: { padding: Spacing.md, gap: Spacing.sm },
  endButton: { marginTop: Spacing.sm },
});

export default StartAttendanceScreen;
