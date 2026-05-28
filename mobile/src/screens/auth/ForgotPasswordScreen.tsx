import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Colors } from '@/constants/colors';
import { BorderRadius, FontSizes, FontWeights, Spacing } from '@/constants/theme';
import { AuthStackParamList } from '@/navigation/types';
import { authApi } from '@/api/auth.api';
import { isValidEmail } from '@/utils/helpers';

type NavigationProp = NativeStackNavigationProp<AuthStackParamList, 'ForgotPassword'>;

type Step = 'email' | 'sent';

const ForgotPasswordScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSendOTP = useCallback(async () => {
    if (!email.trim()) {
      setEmailError('Email is required');
      return;
    }
    if (!isValidEmail(email.trim())) {
      setEmailError('Enter a valid email address');
      return;
    }
    setEmailError('');
    setError('');
    setIsLoading(true);

    try {
      await authApi.forgotPassword(email.trim().toLowerCase());
      setStep('sent');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e?.response?.data?.message || 'Failed to send OTP. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [email]);

  const handleNavigateToOTP = useCallback(() => {
    navigation.navigate('OTP', { email: email.trim().toLowerCase() });
  }, [navigation, email]);

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
          <Text style={styles.headerTitle}>Reset Password</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === 'email' ? (
            <>
              {/* Illustration */}
              <View style={styles.illustrationContainer}>
                <View style={styles.iconCircle}>
                  <Ionicons name="lock-open-outline" size={48} color={Colors.primary} />
                </View>
                <Text style={styles.title}>Forgot your password?</Text>
                <Text style={styles.subtitle}>
                  Enter your email address and we'll send you a one-time password (OTP) to reset it.
                </Text>
              </View>

              {error ? (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={16} color={Colors.danger} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <Input
                label="Email Address"
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  setEmailError('');
                }}
                placeholder="your@email.com"
                leftIcon="mail-outline"
                keyboardType="email-address"
                autoCapitalize="none"
                error={emailError}
                returnKeyType="done"
                onSubmitEditing={handleSendOTP}
              />

              <Button
                title="Send OTP"
                onPress={handleSendOTP}
                loading={isLoading}
                disabled={isLoading}
                fullWidth
                size="lg"
                icon="send-outline"
                iconPosition="right"
              />
            </>
          ) : (
            // Sent state
            <View style={styles.sentContainer}>
              <View style={styles.successIconCircle}>
                <Ionicons name="checkmark-circle" size={64} color={Colors.success} />
              </View>
              <Text style={styles.sentTitle}>OTP Sent!</Text>
              <Text style={styles.sentSubtitle}>
                We've sent a 6-digit verification code to:
              </Text>
              <View style={styles.emailPill}>
                <Ionicons name="mail" size={16} color={Colors.primary} />
                <Text style={styles.emailText}>{email}</Text>
              </View>
              <Text style={styles.sentNote}>
                Check your inbox and spam folder. The OTP expires in 10 minutes.
              </Text>

              <Button
                title="Enter OTP"
                onPress={handleNavigateToOTP}
                fullWidth
                size="lg"
                variant="primary"
                icon="keypad-outline"
              />

              <Button
                title="Resend OTP"
                onPress={() => setStep('email')}
                fullWidth
                size="md"
                variant="outline"
                style={styles.resendButton}
              />
            </View>
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
    marginTop: Spacing.lg,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.primaryFaded,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
    borderWidth: 2,
    borderColor: Colors.primary + '30',
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
  sentContainer: {
    flex: 1,
    alignItems: 'center',
    paddingTop: Spacing.xl,
    gap: Spacing.md,
  },
  successIconCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: Colors.successFaded,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  sentTitle: {
    fontSize: FontSizes.xxxl,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
  },
  sentSubtitle: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  emailPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryFaded,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: BorderRadius.full,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
  emailText: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.primary,
  },
  sentNote: {
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
  },
  resendButton: {
    marginTop: Spacing.sm,
  },
});

export default ForgotPasswordScreen;
