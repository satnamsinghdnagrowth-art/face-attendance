import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { FontSizes, FontWeights, BorderRadius } from '@/constants/theme';
import { ScanResult } from '@/types';

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ScanResultOverlayProps {
  result: ScanResult | null;
  isScanning: boolean;
  boundingBox?: BoundingBox;
  cameraWidth: number;
  cameraHeight: number;
}

export const ScanResultOverlay: React.FC<ScanResultOverlayProps> = ({
  result,
  isScanning,
  boundingBox,
  cameraWidth,
  cameraHeight,
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scanAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (result) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, speed: 20 }),
      ]).start();

      // Auto-hide after 4 seconds
      const timer = setTimeout(() => {
        Animated.timing(fadeAnim, { toValue: 0, duration: 400, useNativeDriver: true }).start();
      }, 4000);
      return () => clearTimeout(timer);
    } else {
      fadeAnim.setValue(0);
      slideAnim.setValue(20);
    }
  }, [result, fadeAnim, slideAnim]);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    const scan = Animated.loop(
      Animated.timing(scanAnim, { toValue: 1, duration: 1500, useNativeDriver: true })
    );

    if (isScanning) {
      pulse.start();
      scan.start();
    } else {
      pulse.stop();
      scan.stop();
      pulseAnim.setValue(1);
    }
    return () => {
      pulse.stop();
      scan.stop();
    };
  }, [isScanning, pulseAnim, scanAnim]);

  const isSuccess = result?.status === 'present' || result?.status === 'late';
  const resultColor = isSuccess ? Colors.success : Colors.danger;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Bounding box around detected face */}
      {boundingBox && (
        <Animated.View
          style={[
            styles.boundingBox,
            {
              left: boundingBox.x,
              top: boundingBox.y,
              width: boundingBox.width,
              height: boundingBox.height,
              borderColor: isScanning
                ? Colors.primaryLight
                : result
                ? resultColor
                : Colors.textMuted,
              transform: [{ scale: pulseAnim }],
            },
          ]}
        >
          {/* Corner marks */}
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />

          {/* Scanning indicator inside bounding box */}
          {isScanning && (
            <View style={styles.scanningBadge}>
              <Text style={styles.scanningText}>Scanning...</Text>
            </View>
          )}
        </Animated.View>
      )}

      {/* Result card */}
      {result && (
        <Animated.View
          style={[
            styles.resultCard,
            {
              backgroundColor: `${resultColor}F0`,
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View style={styles.resultHeader}>
            <Ionicons
              name={isSuccess ? 'checkmark-circle' : 'close-circle'}
              size={28}
              color="white"
            />
            <View style={styles.resultTextContainer}>
              <Text style={styles.resultName} numberOfLines={1}>
                {result.student.name}
              </Text>
              <Text style={styles.resultConfidence}>
                {Math.round(result.confidence * 100)}% confidence
              </Text>
            </View>
            <View
              style={[
                styles.statusPill,
                { backgroundColor: 'rgba(255,255,255,0.2)' },
              ]}
            >
              <Text style={styles.statusPillText}>
                {result.status.charAt(0).toUpperCase() + result.status.slice(1)}
              </Text>
            </View>
          </View>
        </Animated.View>
      )}
    </View>
  );
};

const CORNER_SIZE = 16;
const CORNER_WIDTH = 3;

const styles = StyleSheet.create({
  boundingBox: {
    position: 'absolute',
    borderWidth: 2.5,
    borderRadius: BorderRadius.sm,
  },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
  },
  cornerTL: {
    top: -CORNER_WIDTH,
    left: -CORNER_WIDTH,
    borderTopWidth: CORNER_WIDTH * 2,
    borderLeftWidth: CORNER_WIDTH * 2,
    borderColor: 'white',
    borderRadius: 2,
  },
  cornerTR: {
    top: -CORNER_WIDTH,
    right: -CORNER_WIDTH,
    borderTopWidth: CORNER_WIDTH * 2,
    borderRightWidth: CORNER_WIDTH * 2,
    borderColor: 'white',
    borderRadius: 2,
  },
  cornerBL: {
    bottom: -CORNER_WIDTH,
    left: -CORNER_WIDTH,
    borderBottomWidth: CORNER_WIDTH * 2,
    borderLeftWidth: CORNER_WIDTH * 2,
    borderColor: 'white',
    borderRadius: 2,
  },
  cornerBR: {
    bottom: -CORNER_WIDTH,
    right: -CORNER_WIDTH,
    borderBottomWidth: CORNER_WIDTH * 2,
    borderRightWidth: CORNER_WIDTH * 2,
    borderColor: 'white',
    borderRadius: 2,
  },
  scanningBadge: {
    position: 'absolute',
    bottom: -32,
    alignSelf: 'center',
    backgroundColor: 'rgba(37,99,235,0.9)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  scanningText: {
    color: 'white',
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },
  resultCard: {
    position: 'absolute',
    bottom: 120,
    left: 16,
    right: 16,
    borderRadius: BorderRadius.lg,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  resultHeader: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  resultTextContainer: {
    flex: 1,
  },
  resultName: {
    color: 'white',
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
  resultConfidence: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: FontSizes.sm,
    marginTop: 2,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  statusPillText: {
    color: 'white',
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
  },
});
