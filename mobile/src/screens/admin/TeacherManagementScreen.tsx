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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { userApi } from '@/api/user.api';
import { Avatar } from '@/components/common/Avatar';
import { EmptyState } from '@/components/common/EmptyState';
import { InlineLoader } from '@/components/common/LoadingOverlay';
import { Colors } from '@/constants/colors';
import { BorderRadius, FontSizes, FontWeights, Shadow, Spacing } from '@/constants/theme';
import { User, ClassRoom } from '@/types';

const TeacherManagementScreen: React.FC = () => {
  const [teachers, setTeachers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState<User | null>(null);
  const [teacherClasses, setTeacherClasses] = useState<ClassRoom[]>([]);
  const [showModal, setShowModal] = useState(false);

  const loadTeachers = useCallback(async () => {
    try {
      const response = await userApi.getUsers({ role: 'teacher', limit: 100 });
      setTeachers(response.data.data);
    } catch {
      Alert.alert('Error', 'Failed to load teachers');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTeachers();
  }, [loadTeachers]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTeachers();
    setRefreshing(false);
  }, [loadTeachers]);

  const filteredTeachers = useMemo(
    () =>
      teachers.filter(
        (t) =>
          t.name.toLowerCase().includes(search.toLowerCase()) ||
          t.email.toLowerCase().includes(search.toLowerCase())
      ),
    [teachers, search]
  );

  const handleViewTeacher = useCallback(async (teacher: User) => {
    setSelectedTeacher(teacher);
    setTeacherClasses([]);
    setShowModal(true);
    try {
      const res = await userApi.getTeacherClasses(teacher.id);
      setTeacherClasses(res.data.data);
    } catch {}
  }, []);

  const handleDeleteTeacher = useCallback((teacher: User) => {
    Alert.alert(
      'Delete Teacher',
      `Remove ${teacher.name} from the system?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await userApi.deleteUser(teacher.id);
              setTeachers((prev) => prev.filter((t) => t.id !== teacher.id));
              setShowModal(false);
            } catch {
              Alert.alert('Error', 'Failed to delete teacher');
            }
          },
        },
      ]
    );
  }, []);

  const renderTeacher = useCallback(({ item }: { item: User }) => (
    <TouchableOpacity style={styles.teacherCard} onPress={() => handleViewTeacher(item)}>
      <Avatar name={item.name} photoUrl={item.photo_url} size={48} />
      <View style={styles.teacherInfo}>
        <Text style={styles.teacherName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.teacherEmail} numberOfLines={1}>{item.email}</Text>
        {item.department && (
          <View style={styles.departmentBadge}>
            <Ionicons name="school-outline" size={12} color={Colors.secondary} />
            <Text style={styles.departmentText}>{item.department}</Text>
          </View>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
    </TouchableOpacity>
  ), [handleViewTeacher]);

  if (isLoading) return <InlineLoader message="Loading teachers..." />;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Teacher Management</Text>
          <Text style={styles.headerSubtitle}>{teachers.length} teachers</Text>
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
          placeholder="Search teachers..."
          placeholderTextColor={Colors.textMuted}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      <FlatList
        data={filteredTeachers}
        renderItem={renderTeacher}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.success} />
        }
        ListEmptyComponent={
          <EmptyState
            icon="person-outline"
            title={search ? 'No Results' : 'No Teachers'}
            message={search ? 'Try a different search term' : 'No teachers registered yet'}
          />
        }
      />

      {/* Teacher detail modal */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowModal(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.modalContent}>
            {selectedTeacher && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Teacher Profile</Text>
                  <TouchableOpacity onPress={() => setShowModal(false)}>
                    <Ionicons name="close" size={24} color={Colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                <View style={styles.modalTeacherInfo}>
                  <Avatar name={selectedTeacher.name} photoUrl={selectedTeacher.photo_url} size={64} />
                  <View>
                    <Text style={styles.modalTeacherName}>{selectedTeacher.name}</Text>
                    <Text style={styles.modalTeacherEmail}>{selectedTeacher.email}</Text>
                    {selectedTeacher.department && (
                      <Text style={styles.modalDept}>{selectedTeacher.department}</Text>
                    )}
                  </View>
                </View>

                {/* Assigned classes */}
                {teacherClasses.length > 0 && (
                  <View style={styles.classesSection}>
                    <Text style={styles.classesSectionTitle}>Assigned Classes</Text>
                    {teacherClasses.map((cls) => (
                      <View key={cls.id} style={styles.classItem}>
                        <Ionicons name="school-outline" size={16} color={Colors.secondary} />
                        <Text style={styles.classItemText}>{cls.name} — {cls.department}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDeleteTeacher(selectedTeacher)}
                >
                  <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                  <Text style={styles.deleteButtonText}>Remove Teacher</Text>
                </TouchableOpacity>
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
    backgroundColor: Colors.secondary,
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
  listContent: { padding: Spacing.md, flexGrow: 1, gap: Spacing.sm },
  teacherCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.md,
    ...Shadow.sm,
  },
  teacherInfo: { flex: 1 },
  teacherName: { fontSize: FontSizes.md, fontWeight: FontWeights.semibold, color: Colors.textPrimary },
  teacherEmail: { fontSize: FontSizes.xs, color: Colors.textSecondary, marginTop: 2 },
  departmentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  departmentText: { fontSize: FontSizes.xs, color: Colors.secondary },
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
  modalTeacherInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surfaceVariant,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  modalTeacherName: { fontSize: FontSizes.lg, fontWeight: FontWeights.bold, color: Colors.textPrimary },
  modalTeacherEmail: { fontSize: FontSizes.sm, color: Colors.textSecondary, marginTop: 2 },
  modalDept: { fontSize: FontSizes.sm, color: Colors.secondary, marginTop: 2 },
  classesSection: { gap: Spacing.sm },
  classesSectionTitle: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  classItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.secondaryFaded,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  classItemText: { fontSize: FontSizes.sm, color: Colors.textPrimary },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.dangerFaded,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.danger + '30',
  },
  deleteButtonText: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.danger,
  },
});

export default TeacherManagementScreen;
