import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Modal } from 'react-native';
import { Colors } from '@/constants/colors';
import { BorderRadius, FontSizes, Spacing } from '@/constants/theme';

interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
  transparent?: boolean;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  visible,
  message,
  transparent = false,
}) => {
  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible={visible}>
      <View style={[styles.overlay, transparent && styles.overlayTransparent]}>
        <View style={styles.container}>
          <ActivityIndicator size="large" color={Colors.primary} />
          {message && <Text style={styles.message}>{message}</Text>}
        </View>
      </View>
    </Modal>
  );
};

interface InlineLoaderProps {
  message?: string;
  size?: 'small' | 'large';
  color?: string;
}

export const InlineLoader: React.FC<InlineLoaderProps> = ({
  message,
  size = 'large',
  color = Colors.primary,
}) => {
  return (
    <View style={styles.inlineContainer}>
      <ActivityIndicator size={size} color={color} />
      {message && <Text style={styles.inlineMessage}>{message}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlayDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayTransparent: {
    backgroundColor: Colors.overlayLight,
  },
  container: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    minWidth: 140,
    gap: Spacing.md,
  },
  message: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  inlineContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  inlineMessage: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
});
