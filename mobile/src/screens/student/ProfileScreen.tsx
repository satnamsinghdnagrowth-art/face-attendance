import React, { useState, useCallback } from 'react';
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
import * as ImagePicker from 'expo-image-picker';

import { useAuth } from '@/hooks/useAuth';
import { Avatar } from '@/components/common/Avatar';
import { Input } from '@/components/common/Input';
import { Button } from '@/components/common/Button';
import { Colors } from '@/constants/colors';
import { BorderRadius, FontSizes, FontWeights, Shadow, Spacing } from '@/constants/theme';
import { userApi } from '@/api/user.api';
import { authApi } from '@/api/auth.api';

const ProfileScreen: React.FC = () => {
  const { user, logout, updateUserProfile } = useAuth();

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [isSaving, setIsSaving] = useState(false);

  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [isChangingPw, setIsChangingPw] = useState(false);

  const handleSaveProfile = useCallback(async () => {
    if (!user) return;
    if (!name.trim()) {
      Alert.alert('Error', 'Name cannot be empty');
      return;
    }

    setIsSaving(true);
    try {
      await userApi.updateUser(user.id, { name: name.trim(), phone: phone.trim() });
      updateUserProfile({ name: name.trim(), phone: phone.trim() });
      setIsEditing(false);
      Alert.alert('Success', 'Profile updated successfully');
    } catch {
      Alert.alert('Error', 'Failed to update profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [user, name, phone, updateUserProfile]);

  const handlePickPhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow photo library access to upload a photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaType.images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0] && user) {
      try {
        const response = await userApi.uploadPhoto(user.id, result.assets[0].uri);
        updateUserProfile({ photo_url: response.data.data.photo_url });
        Alert.alert('Success', 'Profile photo updated!');
      } catch {
        Alert.alert('Error', 'Failed to upload photo. Please try again.');
      }
    }
  }, [user, updateUserProfile]);

  const handleChangePassword = useCallback(async () => {
    setPwError('');
    setPwSuccess('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPwError('Please fill in all password fields');
      return;
    }
    if (newPassword.length < 6) {
      setPwError('New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('New passwords do not match');
      return;
    }

    setIsChangingPw(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setPwSuccess('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setIsChangingPassword(false);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setPwError(e?.response?.data?.message || 'Failed to change password');
    } finally {
      setIsChangingPw(false);
    }
  }, [currentPassword, newPassword, confirmPassword]);

  const handleLogout = useCallback(() => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: logout,
        },
      ]
    );
  }, [logout]);

  const roleColor = {
    student: Colors.primary,
    teacher: Colors.secondary,
    admin: Colors.success,
    super_admin: Colors.danger,
  }[user?.role || 'student'];

  const roleLabel = {
    student: 'Student',
    teacher: 'Teacher',
    admin: 'Admin',
    super_admin: 'Super Admin',
  }[user?.role || 'student'];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Profile header */}
          <View style={styles.profileHeader}>
            <Avatar
              name={user?.name || 'User'}
              photoUrl={user?.photo_url}
              size={88}
              onPress={handlePickPhoto}
              showEditButton
            />
            <Text style={styles.profileName}>{user?.name || 'Unknown User'}</Text>
            <View style={[styles.roleBadge, { backgroundColor: roleColor + '18' }]}>
              <Ionicons
                name={user?.role === 'student' ? 'school' : user?.role === 'teacher' ? 'person' : 'shield'}
                size={14}
                color={roleColor}
              />
              <Text style={[styles.roleText, { color: roleColor }]}>{roleLabel}</Text>
            </View>
            <Text style={styles.emailText}>{user?.email}</Text>
          </View>

          <View style={styles.content}>
            {/* Profile info card */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Profile Information</Text>
                <TouchableOpacity
                  onPress={() => {
                    if (isEditing) {
                      setName(user?.name || '');
                      setPhone(user?.phone || '');
                    }
                    setIsEditing(!isEditing);
                  }}
                  style={styles.editButton}
                >
                  <Ionicons name={isEditing ? 'close-outline' : 'pencil-outline'} size={18} color={Colors.primary} />
                  <Text style={styles.editButtonText}>{isEditing ? 'Cancel' : 'Edit'}</Text>
                </TouchableOpacity>
              </View>

              {isEditing ? (
                <View style={styles.editForm}>
                  <Input
                    label="Full Name"
                    value={name}
                    onChangeText={setName}
                    placeholder="Your full name"
                    leftIcon="person-outline"
                    autoCapitalize="words"
                  />
                  <Input
                    label="Phone Number"
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="Your phone number"
                    leftIcon="call-outline"
                    keyboardType="phone-pad"
                  />
                  <Button
                    title="Save Changes"
                    onPress={handleSaveProfile}
                    loading={isSaving}
                    fullWidth
                    size="md"
                    variant="primary"
                  />
                </View>
              ) : (
                <View style={styles.infoList}>
                  {[
                    { label: 'Full Name', value: user?.name, icon: 'person-outline' },
                    { label: 'Email', value: user?.email, icon: 'mail-outline' },
                    { label: 'Phone', value: user?.phone || 'Not set', icon: 'call-outline' },
                    { label: 'Role', value: roleLabel, icon: 'shield-outline' },
                    { label: 'Class', value: user?.class_id || 'Not assigned', icon: 'school-outline' },
                  ].map(({ label, value, icon }) => (
                    <View key={label} style={styles.infoRow}>
                      <Ionicons name={icon as never} size={18} color={Colors.textMuted} />
                      <View style={styles.infoText}>
                        <Text style={styles.infoLabel}>{label}</Text>
                        <Text style={styles.infoValue}>{value}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Change password */}
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.cardHeader}
                onPress={() => setIsChangingPassword(!isChangingPassword)}
              >
                <Text style={styles.cardTitle}>Security</Text>
                <Ionicons
                  name={isChangingPassword ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={Colors.textSecondary}
                />
              </TouchableOpacity>

              {isChangingPassword && (
                <View style={styles.editForm}>
                  {pwError ? (
                    <View style={styles.errorBanner}>
                      <Ionicons name="alert-circle" size={16} color={Colors.danger} />
                      <Text style={styles.errorText}>{pwError}</Text>
                    </View>
                  ) : null}
                  {pwSuccess ? (
                    <View style={styles.successBanner}>
                      <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                      <Text style={styles.successText}>{pwSuccess}</Text>
                    </View>
                  ) : null}

                  <Input
                    label="Current Password"
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    placeholder="Enter current password"
                    leftIcon="lock-closed-outline"
                    secureTextEntry
                  />
                  <Input
                    label="New Password"
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="At least 6 characters"
                    leftIcon="lock-open-outline"
                    secureTextEntry
                  />
                  <Input
                    label="Confirm New Password"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Repeat new password"
                    leftIcon="lock-open-outline"
                    secureTextEntry
                  />
                  <Button
                    title="Change Password"
                    onPress={handleChangePassword}
                    loading={isChangingPw}
                    fullWidth
                    size="md"
                    variant="secondary"
                  />
                </View>
              )}
            </View>

            {/* Logout */}
            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={22} color={Colors.danger} />
              <Text style={styles.logoutText}>Sign Out</Text>
            </TouchableOpacity>

            <Text style={styles.version}>FaceAttend v1.0.0</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  profileHeader: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  profileName: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    marginTop: Spacing.sm,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    gap: 6,
  },
  roleText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  emailText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  content: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  cardTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primaryFaded,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  editButtonText: {
    fontSize: FontSizes.sm,
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
  },
  editForm: {
    padding: Spacing.md,
    gap: 4,
  },
  infoList: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  infoText: { flex: 1 },
  infoLabel: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeights.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: FontSizes.md,
    color: Colors.textPrimary,
    marginTop: 2,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.dangerFaded,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  errorText: { flex: 1, fontSize: FontSizes.sm, color: Colors.danger },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.successFaded,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  successText: { flex: 1, fontSize: FontSizes.sm, color: Colors.success },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.dangerFaded,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.danger + '30',
  },
  logoutText: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.semibold,
    color: Colors.danger,
  },
  version: {
    textAlign: 'center',
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    paddingBottom: Spacing.lg,
  },
});

export default ProfileScreen;
