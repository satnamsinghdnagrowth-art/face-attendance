import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Animated,
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Colors } from '@/constants/colors';
import { BorderRadius, FontSizes, FontWeights, Spacing } from '@/constants/theme';
import { AuthStackParamList } from '@/navigation/types';
import { isValidEmail } from '@/utils/helpers';

const { width, height } = Dimensions.get('window');

type NavigationProp = NativeStackNavigationProp<AuthStackParamList, 'Login'>;

const LoginScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { login, isLoading, error, clearAuthError } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const passwordRef = useRef<TextInput>(null);

  const shake = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 80, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 80, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 80, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 80, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 80, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  const validate = useCallback((): boolean => {
    let valid = true;
    if (!email.trim()) {
      setEmailError('Email is required');
      valid = false;
    } else if (!isValidEmail(email.trim())) {
      setEmailError('Enter a valid email address');
      valid = false;
    } else {
      setEmailError('');
    }

    if (!password) {
      setPasswordError('Password is required');
      valid = false;
    } else if (password.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      valid = false;
    } else {
      setPasswordError('');
    }

    return valid;
  }, [email, password]);

  const handleLogin = useCallback(async () => {
    clearAuthError();
    if (!validate()) {
      shake();
      return;
    }
    try {
      await login(email.trim().toLowerCase(), password);
    } catch {
      shake();
    }
  }, [email, password, validate, login, shake, clearAuthError]);

  return (
    <View style={styles.container}>
      {/* Header gradient */}
      <LinearGradient
        colors={['#0F172A', Colors.primaryDark, '#4C1D95']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.headerGradient}
      >
        <SafeAreaView edges={['top']}>
          <View style={styles.headerContent}>
            <View style={styles.logoContainer}>
              <Ionicons name="shield-checkmark" size={36} color={Colors.primary} />
            </View>
            <Text style={styles.appName}>ExamGuard</Text>
            <Text style={styles.welcomeText}>Secure Sign In</Text>
            <Text style={styles.headerSubtext}>Identity verification & exam monitoring</Text>
          </View>
        </SafeAreaView>

        {/* Wave shape */}
        <View style={styles.waveCutout} />
      </LinearGradient>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={[styles.formCard, { transform: [{ translateX: shakeAnim }] }]}
          >
            {/* Error banner */}
            {error && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={18} color={Colors.danger} />
                <Text style={styles.errorBannerText}>{error}</Text>
              </View>
            )}

            <Text style={styles.formTitle}>Sign In</Text>
            <Text style={styles.formSubtitle}>Enter your credentials to access your account</Text>

            <Input
              label="Email Address"
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                setEmailError('');
              }}
              placeholder="you@institution.edu"
              leftIcon="mail-outline"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              error={emailError}
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />

            <Input
              label="Password"
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                setPasswordError('');
              }}
              placeholder="Enter your password"
              leftIcon="lock-closed-outline"
              secureTextEntry
              error={passwordError}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />

            {/* Forgot password */}
            <TouchableOpacity
              onPress={() => navigation.navigate('ForgotPassword')}
              style={styles.forgotContainer}
            >
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </TouchableOpacity>

            <Button
              title={isLoading ? 'Signing in...' : 'Sign In'}
              onPress={handleLogin}
              loading={isLoading}
              disabled={isLoading}
              fullWidth
              size="lg"
              icon="arrow-forward"
              iconPosition="right"
            />

            {/* Role hint */}
            <View style={styles.hintsContainer}>
              <Text style={styles.hintsTitle}>Default test accounts</Text>
              {[
                { role: 'Student',     email: 'alice@student.com', password: 'password123', icon: 'school-outline' },
                { role: 'Invigilator', email: 'invig.a@exam.com',  password: 'password123', icon: 'person-outline' },
                { role: 'Admin',       email: 'admin@school.com',  password: 'Admin@123',   icon: 'shield-outline' },
              ].map(({ role, email: hintEmail, password: hintPassword, icon }) => (
                <TouchableOpacity
                  key={role}
                  style={styles.hintItem}
                  onPress={() => {
                    setEmail(hintEmail);
                    setPassword(hintPassword);
                    setEmailError('');
                    setPasswordError('');
                  }}
                >
                  <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={14} color={Colors.textMuted} />
                  <Text style={styles.hintText}>
                    {role}: {hintEmail}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const HEADER_HEIGHT = height * 0.34;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerGradient: {
    height: HEADER_HEIGHT,
    paddingBottom: 30,
  },
  headerContent: {
    alignItems: 'center',
    paddingTop: Spacing.xl,
  },
  logoContainer: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  appName: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.extrabold,
    color: 'white',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  welcomeText: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.semibold,
    color: 'rgba(255,255,255,0.9)',
  },
  headerSubtext: {
    fontSize: FontSizes.md,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  waveCutout: {
    position: 'absolute',
    bottom: -1,
    left: 0,
    right: 0,
    height: 30,
    backgroundColor: Colors.background,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
  },
  keyboardView: {
    flex: 1,
    marginTop: -20,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
    flexGrow: 1,
  },
  formCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
    marginTop: Spacing.sm,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dangerFaded,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.danger + '30',
  },
  errorBannerText: {
    flex: 1,
    color: Colors.danger,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
  },
  formTitle: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  formSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
  },
  forgotContainer: {
    alignSelf: 'flex-end',
    marginBottom: Spacing.lg,
    marginTop: -Spacing.sm,
  },
  forgotText: {
    fontSize: FontSizes.sm,
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
  },
  hintsContainer: {
    marginTop: Spacing.xl,
    padding: Spacing.md,
    backgroundColor: Colors.surfaceVariant,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  hintsTitle: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    color: Colors.textMuted,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  hintItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  hintText: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
});

export default LoginScreen;
