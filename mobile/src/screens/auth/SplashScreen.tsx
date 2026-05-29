import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { FontSizes, FontWeights, Spacing } from '@/constants/theme';

const { width, height } = Dimensions.get('window');

const SplashScreen: React.FC = () => {
  const logoScale = useRef(new Animated.Value(0.3)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const loaderOpacity = useRef(new Animated.Value(0)).current;
  const circleScale1 = useRef(new Animated.Value(0)).current;
  const circleScale2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          useNativeDriver: true,
          tension: 60,
          friction: 8,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(loaderOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    // Background circles animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(circleScale1, { toValue: 1.2, duration: 2000, useNativeDriver: true }),
        Animated.timing(circleScale1, { toValue: 1, duration: 2000, useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(circleScale2, { toValue: 1.15, duration: 2500, useNativeDriver: true }),
        Animated.timing(circleScale2, { toValue: 0.9, duration: 2500, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <LinearGradient
      colors={[Colors.primaryDark, Colors.primary, Colors.secondary]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      {/* Decorative background circles */}
      <Animated.View
        style={[
          styles.circle1,
          { transform: [{ scale: circleScale1 }] },
        ]}
      />
      <Animated.View
        style={[
          styles.circle2,
          { transform: [{ scale: circleScale2 }] },
        ]}
      />

      {/* Logo section */}
      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity: logoOpacity,
            transform: [{ scale: logoScale }],
          },
        ]}
      >
        <View style={styles.iconWrapper}>
          <Ionicons name="scan" size={52} color={Colors.primary} />
        </View>
      </Animated.View>

      {/* App name */}
      <Animated.View style={{ opacity: textOpacity, alignItems: 'center' }}>
        <Text style={styles.appName}>ExamGuard</Text>
        <Text style={styles.tagline}>Secure Exam Monitoring</Text>
        <Text style={styles.taglineSub}>Identity Verification & Anti-Proxy Detection</Text>

        <View style={styles.featuresRow}>
          {[
            { icon: 'shield-checkmark-outline', label: 'Anti-Proxy' },
            { icon: 'scan-outline',             label: 'Face ID'    },
            { icon: 'pulse-outline',            label: 'Live Monitor'},
          ].map(({ icon, label }) => (
            <View key={label} style={styles.featurePill}>
              <Ionicons name={icon as never} size={12} color="rgba(255,255,255,0.9)" />
              <Text style={styles.featureText}>{label}</Text>
            </View>
          ))}
        </View>
      </Animated.View>

      {/* Loading indicator */}
      <Animated.View style={[styles.loaderContainer, { opacity: loaderOpacity }]}>
        <ActivityIndicator size="small" color="rgba(255,255,255,0.8)" />
        <Text style={styles.loadingText}>Initializing secure session...</Text>
      </Animated.View>

      {/* Bottom version */}
      <Text style={styles.version}>Version 1.0.0</Text>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  circle1: {
    position: 'absolute',
    width: width * 1.2,
    height: width * 1.2,
    borderRadius: width * 0.6,
    backgroundColor: 'rgba(255,255,255,0.04)',
    top: -width * 0.4,
    right: -width * 0.3,
  },
  circle2: {
    position: 'absolute',
    width: width * 0.9,
    height: width * 0.9,
    borderRadius: width * 0.45,
    backgroundColor: 'rgba(255,255,255,0.06)',
    bottom: -width * 0.2,
    left: -width * 0.2,
  },
  logoContainer: {
    marginBottom: Spacing.xl,
  },
  iconWrapper: {
    width: 100,
    height: 100,
    borderRadius: 28,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 16,
  },
  appName: {
    fontSize: FontSizes.display,
    fontWeight: FontWeights.extrabold,
    color: 'white',
    letterSpacing: 1.5,
    marginBottom: 6,
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  tagline: {
    fontSize: FontSizes.lg,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: FontWeights.semibold,
    marginBottom: 4,
    letterSpacing: 0.4,
  },
  taglineSub: {
    fontSize: FontSizes.sm,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: FontWeights.regular,
    marginBottom: Spacing.lg,
    letterSpacing: 0.2,
  },
  featuresRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: Spacing.xs,
  },
  featurePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  featureText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    letterSpacing: 0.3,
  },
  loaderContainer: {
    position: 'absolute',
    bottom: 80,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: FontSizes.sm,
  },
  version: {
    position: 'absolute',
    bottom: 40,
    color: 'rgba(255,255,255,0.4)',
    fontSize: FontSizes.xs,
  },
});

export default SplashScreen;
