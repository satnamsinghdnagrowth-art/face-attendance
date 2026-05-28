import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Colors } from '@/constants/colors';
import { BorderRadius, FontSizes, FontWeights, Spacing } from '@/constants/theme';
import { AuthStackParamList } from '@/navigation/types';
import { authApi } from '@/api/auth.api';

type OTPRouteProp = RouteProp<AuthStackParamList, 'OTP'>;

const OTPScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<OTPRouteProp>();
  const { email } = route.params;

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [step, setStep] = useState<'otp' | 'password'>('otp');

  const otpRefs = useRef<(TextInput | null)[]>([]);

  const handleOTPChange = useCallback((value: string, index: number) => {
    const numericValue = value.replace(/[^0-9]/g, '');
    if (numericValue.length > 1) return;

    const newOtp = [...otp];
    newOtp[index] = numericValue;
    setOtp(newOtp);

    // Auto-advance
    if (numericValue && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  }, [otp]);

  const handleOTPKeyPress = useCallback((key: string, index: number) => {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
      const newOtp = [...otp];
      newOtp[index - 1] = '';
      setOtp(newOtp);
    }
  }, [otp]);

  const handleVerifyOTP = useCallback(async () => {
    const otpString = otp.join('');
    if (otpString.length < 6) {
      setError('Please enter the complete 6-digit OTP');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      await authApi.verifyOTP(email, otpString);
      setStep('password');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e?.response?.data?.message || 'Invalid or expired OTP');
    } finally {
      setIsLoading(false);
    }
  }, [otp, email]);

  const handleResetPassword = useCallback(async () => {
    if (!newPassword) {
      setError('Please enter a new password');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      await authApi.resetPassword(otp.join(''), email, newPassword);
      setSuccess(true);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e?.response?.data?.message || 'Failed to reset password');
    } finally {
      setIsLoading(false);
    }
  }, [newPassword, confirmPassword, otp, email]);

  if (success) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successContainer}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={72} color={Colors.success} />
          </View>
          <Text style={styles.successTitle}>Password Reset!</Text>
          <Text style={styles.successSubtitle}>
            Your password has been reset successfully. You can now sign in with your new password.
          </Text>
          <Button
            title="Go to Login"
            onPress={() => navigation.navigate('Login' as never)}
            fullWidth
            size="lg"
            variant="success"
            icon="arrow-forward"
            iconPosition="right"
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {step === 'otp' ? 'Verify OTP' : 'New Password'}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === 'otp' ? (
            <>
              <View style={styles.illustrationContainer}>
                <View style={styles.iconCircle}>
                  <Ionicons name="keypad-outline" size={48} color={Colors.primary} />
                </View>
                <Text style={styles.title}>Enter OTP</Text>
                <Text style={styles.subtitle}>
                  Enter the 6-digit code sent to{' '}
                  <Text style={styles.emailHighlight}>{email}</Text>
                </Text>
              </View>

              {error ? (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={16} color={Colors.danger} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              {/* OTP input boxes */}
              <View style={styles.otpContainer}>
                {otp.map((digit, index) => (
                  <TextInput
                    key={index}
                    ref={(ref) => { otpRefs.current[index] = ref; }}
                    style={[
                      styles.otpBox,
                      digit && styles.otpBoxFilled,
                      index === otp.findIndex((d) => !d) && styles.otpBoxActive,
                    ]}
                    value={digit}
                    onChangeText={(value) => handleOTPChange(value, index)}
                    onKeyPress={({ nativeEvent }) => handleOTPKeyPress(nativeEvent.key, index)}
                    keyboardType="numeric"
                    maxLength={1}
                    textAlign="center"
                    selectTextOnFocus
                  />
                ))}
              </View>

              <Button
                title="Verify OTP"
                onPress={handleVerifyOTP}
                loading={isLoading}
                disabled={isLoading || otp.join('').length < 6}
                fullWidth
                size="lg"
              />

              <TouchableOpacity style={styles.resendContainer}>
                <Text style={styles.resendText}>
                  Didn't receive the code?{' '}
                  <Text style={styles.resendLink}>Resend OTP</Text>
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.illustrationContainer}>
                <View style={styles.iconCircle}>
                  <Ionicons name="lock-closed-outline" size={48} color={Colors.primary} />
                </View>
                <Text style={styles.title}>New Password</Text>
                <Text style={styles.subtitle}>
                  Create a strong password for your account
                </Text>
              </View>

              {error ? (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={16} color={Colors.danger} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <Input
                label="New Password"
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="At least 6 characters"
                leftIcon="lock-closed-outline"
                secureTextEntry
                returnKeyType="next"
              />

              <Input
                label="Confirm Password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Repeat your password"
                leftIcon="lock-closed-outline"
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleResetPassword}
                error={confirmPassword && confirmPassword !== newPassword ? 'Passwords do not match' : undefined}
              />

              <Button
                title="Reset Password"
                onPress={handleResetPassword}
                loading={isLoading}
                disabled={isLoading}
                fullWidth
                size="lg"
                variant="success"
                icon="checkmark"
                iconPosition="right"
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.full,
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.semibold,
    color: Colors.textPrimary,
  },
  content: {
    padding: Spacing.lg,
    flexGrow: 1,
  },
  illustrationContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
    marginTop: Spacing.md,
  },
  iconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: Colors.primaryFaded,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  emailHighlight: {
    fontWeight: FontWeights.semibold,
    color: Colors.primary,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dangerFaded,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: 8,
  },
  errorText: {
    flex: 1,
    color: Colors.danger,
    fontSize: FontSizes.sm,
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: Spacing.xl,
  },
  otpBox: {
    width: 48,
    height: 56,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    backgroundColor: Colors.surface,
  },
  otpBoxFilled: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryFaded,
    color: Colors.primary,
  },
  otpBoxActive: {
    borderColor: Colors.primary,
    borderWidth: 2,
  },
  resendContainer: {
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  resendText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  resendLink: {
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  successIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.successFaded,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  successTitle: {
    fontSize: FontSizes.xxxl,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
  },
  successSubtitle: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.xl,
  },
});

export default OTPScreen;
