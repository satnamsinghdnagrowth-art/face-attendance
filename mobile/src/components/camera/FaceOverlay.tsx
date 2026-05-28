import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, Animated } from 'react-native';
import Svg, { Ellipse, Path, Defs, Mask, Rect, Circle } from 'react-native-svg';
import { Colors } from '@/constants/colors';
import { FontSizes, FontWeights } from '@/constants/theme';

interface FaceOverlayProps {
  width: number;
  height: number;
  faceDetected: boolean;
  captureCount: number;
  totalCaptures: number;
  guidance?: string;
  isCapturing?: boolean;
  isSuccess?: boolean;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const FaceOverlay: React.FC<FaceOverlayProps> = ({
  width,
  height,
  faceDetected,
  captureCount,
  totalCaptures,
  guidance,
  isCapturing = false,
  isSuccess = false,
}) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const flashAnim = useRef(new Animated.Value(0)).current;

  const ovalWidth = Math.min(width * 0.62, 240);
  const ovalHeight = ovalWidth * 1.3;
  const centerX = width / 2;
  const centerY = height * 0.42;

  useEffect(() => {
    // Pulse animation when face detected
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.03, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    if (faceDetected) {
      pulse.start();
    } else {
      pulseAnim.setValue(1);
      pulse.stop();
    }
    return () => pulse.stop();
  }, [faceDetected, pulseAnim]);

  useEffect(() => {
    // Scan line animation
    const scanLine = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(scanLineAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    );
    if (faceDetected && !isSuccess) {
      scanLine.start();
    } else {
      scanLine.stop();
    }
    return () => scanLine.stop();
  }, [faceDetected, isSuccess, scanLineAnim]);

  useEffect(() => {
    if (isCapturing) {
      Animated.sequence([
        Animated.timing(flashAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
        Animated.timing(flashAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [isCapturing, flashAnim]);

  const ovalColor = isSuccess
    ? Colors.success
    : faceDetected
    ? Colors.primaryLight
    : Colors.textMuted;

  const scanLineY = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [centerY - ovalHeight / 2, centerY + ovalHeight / 2],
  });

  return (
    <View style={[StyleSheet.absoluteFillObject, styles.container]}>
      {/* SVG dark overlay with oval cutout */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <Mask id="mask" x="0" y="0" width={width} height={height}>
            <Rect x="0" y="0" width={width} height={height} fill="white" />
            <Ellipse
              cx={centerX}
              cy={centerY}
              rx={ovalWidth / 2}
              ry={ovalHeight / 2}
              fill="black"
            />
          </Mask>
        </Defs>
        <Rect
          x="0"
          y="0"
          width={width}
          height={height}
          fill="rgba(0,0,0,0.62)"
          mask="url(#mask)"
        />
        {/* Oval border */}
        <Ellipse
          cx={centerX}
          cy={centerY}
          rx={ovalWidth / 2}
          ry={ovalHeight / 2}
          fill="transparent"
          stroke={ovalColor}
          strokeWidth={faceDetected ? 3 : 2}
          strokeDasharray={isSuccess ? '0' : faceDetected ? '0' : '12,6'}
        />
        {/* Corner accent marks */}
        {[
          { x: centerX - ovalWidth / 2 + 10, y: centerY - ovalHeight / 2 + 10 },
          { x: centerX + ovalWidth / 2 - 10, y: centerY - ovalHeight / 2 + 10 },
          { x: centerX - ovalWidth / 2 + 10, y: centerY + ovalHeight / 2 - 10 },
          { x: centerX + ovalWidth / 2 - 10, y: centerY + ovalHeight / 2 - 10 },
        ].map((point, i) => (
          <Circle
            key={i}
            cx={point.x}
            cy={point.y}
            r={4}
            fill={ovalColor}
            opacity={0.8}
          />
        ))}
      </Svg>

      {/* Scan line */}
      {faceDetected && !isSuccess && (
        <Animated.View
          style={[
            styles.scanLine,
            {
              width: ovalWidth - 20,
              left: centerX - (ovalWidth - 20) / 2,
              backgroundColor: Colors.primaryLight,
              transform: [{ translateY: scanLineY }],
            },
          ]}
        />
      )}

      {/* Flash overlay on capture */}
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          styles.flashOverlay,
          { opacity: flashAnim },
        ]}
      />

      {/* Progress dots */}
      <View
        style={[
          styles.progressContainer,
          { top: centerY - ovalHeight / 2 - 48 },
        ]}
      >
        {Array.from({ length: totalCaptures }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.progressDot,
              i < captureCount && styles.progressDotFilled,
              i === captureCount && faceDetected && styles.progressDotActive,
            ]}
          />
        ))}
      </View>

      {/* Guidance text */}
      <View
        style={[
          styles.guidanceContainer,
          { top: centerY + ovalHeight / 2 + 20 },
        ]}
      >
        {isSuccess ? (
          <View style={styles.successBadge}>
            <Text style={styles.successText}>Enrollment Complete!</Text>
          </View>
        ) : guidance ? (
          <View style={[styles.guidanceBadge, faceDetected && styles.guidanceBadgeActive]}>
            <Text style={styles.guidanceText}>{guidance}</Text>
          </View>
        ) : (
          <View style={styles.guidanceBadge}>
            <Text style={styles.guidanceText}>Position your face in the oval</Text>
          </View>
        )}
      </View>

      {/* Top status bar */}
      <View style={styles.statusBar}>
        <View style={[styles.statusIndicator, faceDetected && styles.statusIndicatorActive]} />
        <Text style={styles.statusText}>
          {isSuccess
            ? 'All captures complete'
            : faceDetected
            ? `Face detected — ${captureCount}/${totalCaptures} captured`
            : 'Looking for face...'}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    zIndex: 10,
  },
  scanLine: {
    position: 'absolute',
    height: 2,
    opacity: 0.7,
    borderRadius: 1,
  },
  flashOverlay: {
    backgroundColor: 'white',
    zIndex: 20,
  },
  progressContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  progressDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  progressDotFilled: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  progressDotActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primaryLight,
    transform: [{ scale: 1.2 }],
  },
  guidanceContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  guidanceBadge: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  guidanceBadgeActive: {
    backgroundColor: 'rgba(37,99,235,0.8)',
    borderColor: Colors.primaryLight,
  },
  guidanceText: {
    color: 'white',
    fontSize: FontSizes.md,
    fontWeight: FontWeights.medium,
    textAlign: 'center',
  },
  successBadge: {
    backgroundColor: 'rgba(22,163,74,0.9)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
  },
  successText: {
    color: 'white',
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
  statusBar: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  statusIndicatorActive: {
    backgroundColor: Colors.successLight,
  },
  statusText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
  },
});
