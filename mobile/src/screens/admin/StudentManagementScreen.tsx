import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { userApi } from '@/api/user.api';
import { faceApi } from '@/api/face.api';
import { Avatar } from '@/components/common/Avatar';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { EmptyState } from '@/components/common/EmptyState';
import { InlineLoader } from '@/components/common/LoadingOverlay';
import { Colors } from '@/constants/colors';
import { BorderRadius, FontSizes, FontWeights, Shadow, Spacing } from '@/constants/theme';
import { User } from '@/types';

const StudentManagementScreen: React.FC = () => {
  const [students, setStudents] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<User | null>(null);
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [faceStatus, setFaceStatus] = useState<Record<string, boolean>>({});

  const loadStudents = useCallback(async () => {
    try {
      const response = await userApi.getUsers({ role: 'student', limit: 100 });
      const studentList = response.data.data;
      setStudents(studentList);

      // Load face status for each student
      const statusMap: Record<string, boolean> = {};
      await Promise.all(
        studentList.slice(0, 20).map(async (s) => {
          try {
            const res = await faceApi.getStatus(s.id);
            statusMap[s.id] = res.data.data.registered;
          } catch {
            statusMap[s.id] = false;
          }
        })
      );
      setFaceStatus(statusMap);
    } catch {
      Alert.alert('Error', 'Failed to load students');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadStudents();
    setRefreshing(false);
  }, [loadStudents]);

  const filteredStudents = useMemo(
    () =>
      students.filter(
        (s) =>
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          s.email.toLowerCase().includes(search.toLowerCase()) ||
          (s.roll_number || '').toLowerCase().includes(search.toLowerCase())
      ),
    [students, search]
  );

  const handleDeleteStudent = useCallback(
    (student: User) => {
      Alert.alert(
        'Delete Student',
        `Are you sure you want to delete ${student.name}? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await userApi.deleteUser(student.id);
                setStudents((prev) => prev.filter((s) => s.id !== student.id));
                setShowStudentModal(false);
                Alert.alert('Success', `${student.name} has been deleted`);
              } catch {
                Alert.alert('Error', 'Failed to delete student');
              }
            },
          },
        ]
      );
    },
    []
  );

  const renderStudent = useCallback(({ item }: { item: User }) => (
    <TouchableOpacity
      style={styles.studentCard}
      onPress={() => {
        setSelectedStudent(item);
        setShowStudentModal(true);
      }}
    >
      <Avatar name={item.name} photoUrl={item.photo_url} size={44} />
      <View style={styles.studentInfo}>
        <Text style={styles.studentName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.studentEmail} numberOfLines={1}>{item.email}</Text>
        {item.class_id && (
          <Text style={styles.studentClass}>Class: {item.class_id}</Text>
        )}
      </View>
      <View style={styles.studentRight}>
        {faceStatus[item.id] !== undefined && (
          <View style={[styles.faceStatusBadge, { backgroundColor: faceStatus[item.id] ? Colors.successFaded : Colors.dangerFaded }]}>
            <Ionicons
              name={faceStatus[item.id] ? 'scan' : 'scan-outline'}
              size={12}
              color={faceStatus[item.id] ? Colors.success : Colors.danger}
            />
            <Text style={[styles.faceStatusText, { color: faceStatus[item.id] ? Colors.success : Colors.danger }]}>
              {faceStatus[item.id] ? 'Enrolled' : 'Not enrolled'}
            </Text>
          </View>
        )}
        <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
      </View>
    </TouchableOpacity>
  ), [faceStatus]);

  if (isLoading) {
    return <InlineLoader message="Loading students..." />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Student Management</Text>
          <Text style={styles.headerSubtitle}>{students.length} students registered</Text>
        </View>
        <TouchableOpacity style={styles.addButton}>
          <Ionicons name="add" size={22} color="white" />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={18} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search students..."
          placeholderTextColor={Colors.textMuted}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <Text style={styles.statsText}>
          Showing {filteredStudents.length} of {students.length} students
        </Text>
        <Text style={styles.enrolledText}>
          {Object.values(faceStatus).filter(Boolean).length} face-enrolled
        </Text>
      </View>

      <FlatList
        data={filteredStudents}
        renderItem={renderStudent}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.success} />
        }
        ListEmptyComponent={
          <EmptyState
            icon="people-outline"
            title={search ? 'No Results' : 'No Students'}
            message={search ? 'Try a different search term' : 'No students registered yet'}
            actionLabel={search ? 'Clear Search' : undefined}
            onAction={search ? () => setSearch('') : undefined}
          />
        }
      />

      {/* Student detail modal */}
      <Modal
        visible={showStudentModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowStudentModal(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowStudentModal(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.modalContent}>
            {selectedStudent && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Student Profile</Text>
                  <TouchableOpacity onPress={() => setShowStudentModal(false)}>
                    <Ionicons name="close" size={24} color={Colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                <View style={styles.modalStudentInfo}>
                  <Avatar name={selectedStudent.name} photoUrl={selectedStudent.photo_url} size={64} />
                  <View>
                    <Text style={styles.modalStudentName}>{selectedStudent.name}</Text>
                    <Text style={styles.modalStudentEmail}>{selectedStudent.email}</Text>
                    {selectedStudent.phone && (
                      <Text style={styles.modalStudentPhone}>{selectedStudent.phone}</Text>
                    )}
                  </View>
                </View>

                <View style={styles.modalInfoGrid}>
                  {[
                    { label: 'Class', value: selectedStudent.class_id || 'N/A', icon: 'school-outline' },
                    {
                      label: 'Face Status',
                      value: faceStatus[selectedStudent.id] ? 'Enrolled' : 'Not Enrolled',
                      icon: 'scan-outline',
                    },
                    { label: 'Role', value: 'Student', icon: 'person-outline' },
                  ].map(({ label, value, icon }) => (
                    <View key={label} style={styles.modalInfoItem}>
                      <Ionicons name={icon as never} size={16} color={Colors.textMuted} />
                      <View>
                        <Text style={styles.modalInfoLabel}>{label}</Text>
                        <Text style={styles.modalInfoValue}>{value}</Text>
                      </View>
                    </View>
                  ))}
                </View>

                <View style={styles.modalActions}>
                  <Button
                    title="Delete Student"
                    onPress={() => handleDeleteStudent(selectedStudent)}
                    variant="danger"
                    fullWidth
                    size="md"
                    icon="trash-outline"
                  />
                </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: FontSizes.xl, fontWeight: FontWeights.bold, color: Colors.textPrimary },
  headerSubtitle: { fontSize: FontSizes.sm, color: Colors.textSecondary, marginTop: 2 },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: FontSizes.md, color: Colors.textPrimary, paddingVertical: 4 },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surfaceVariant,
  },
  statsText: { fontSize: FontSizes.xs, color: Colors.textSecondary },
  enrolledText: { fontSize: FontSizes.xs, color: Colors.success, fontWeight: FontWeights.medium },
  listContent: { padding: Spacing.md, flexGrow: 1, gap: Spacing.sm },
  studentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.md,
    ...Shadow.sm,
  },
  studentInfo: { flex: 1 },
  studentName: { fontSize: FontSizes.md, fontWeight: FontWeights.semibold, color: Colors.textPrimary },
  studentEmail: { fontSize: FontSizes.xs, color: Colors.textSecondary, marginTop: 2 },
  studentClass: { fontSize: FontSizes.xs, color: Colors.textMuted, marginTop: 1 },
  studentRight: { alignItems: 'flex-end', gap: 4 },
  faceStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    gap: 3,
  },
  faceStatusText: { fontSize: 10, fontWeight: FontWeights.semibold },
  modalBackdrop: { flex: 1, backgroundColor: Colors.overlayDark, justifyContent: 'flex-end' },
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
  },
  modalTitle: { fontSize: FontSizes.xl, fontWeight: FontWeights.bold, color: Colors.textPrimary },
  modalStudentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surfaceVariant,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  modalStudentName: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold, color: Colors.textPrimary },
  modalStudentEmail: { fontSize: FontSizes.sm, color: Colors.textSecondary, marginTop: 2 },
  modalStudentPhone: { fontSize: FontSizes.sm, color: Colors.textMuted },
  modalInfoGrid: { gap: Spacing.sm },
  modalInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  modalInfoLabel: { fontSize: FontSizes.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  modalInfoValue: { fontSize: FontSizes.md, color: Colors.textPrimary, fontWeight: FontWeights.medium, marginTop: 1 },
  modalActions: { gap: Spacing.sm, paddingTop: Spacing.sm },
});

export default StudentManagementScreen;
