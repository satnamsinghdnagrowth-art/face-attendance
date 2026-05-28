import React, { useCallback, useRef } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  Animated,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { BorderRadius, FontSizes, FontWeights, Spacing } from '@/constants/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'success' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: 'left' | 'right';
  style?: ViewStyle;
  textStyle?: TextStyle;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, { bg: string; text: string; border?: string }> = {
  primary: { bg: Colors.primary, text: Colors.textInverse },
  secondary: { bg: Colors.secondary, text: Colors.textInverse },
  outline: { bg: 'transparent', text: Colors.primary, border: Colors.primary },
  danger: { bg: Colors.danger, text: Colors.textInverse },
  success: { bg: Colors.success, text: Colors.textInverse },
  ghost: { bg: 'transparent', text: Colors.textSecondary },
};

const sizeStyles: Record<ButtonSize, { height: number; px: number; fontSize: number; iconSize: number }> = {
  sm: { height: 36, px: 14, fontSize: FontSizes.sm, iconSize: 16 },
  md: { height: 48, px: 20, fontSize: FontSizes.md, iconSize: 20 },
  lg: { height: 56, px: 28, fontSize: FontSizes.lg, iconSize: 22 },
};

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  iconPosition = 'left',
  style,
  textStyle,
  fullWidth = false,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const vStyle = variantStyles[variant];
  const sStyle = sizeStyles[size];

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 50,
      bounciness: 0,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, [scaleAnim]);

  const isDisabled = disabled || loading;

  return (
    <Animated.View
      style={[
        styles.animatedWrapper,
        fullWidth && styles.fullWidth,
        { transform: [{ scale: scaleAnim }] },
      ]}
    >
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isDisabled}
        activeOpacity={0.9}
        style={[
          styles.button,
          {
            backgroundColor: isDisabled ? Colors.border : vStyle.bg,
            height: sStyle.height,
            paddingHorizontal: sStyle.px,
            borderWidth: vStyle.border ? 1.5 : 0,
            borderColor: vStyle.border,
          },
          fullWidth && styles.fullWidth,
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator
            color={variant === 'outline' || variant === 'ghost' ? Colors.primary : Colors.textInverse}
            size="small"
          />
        ) : (
          <View style={styles.content}>
            {icon && iconPosition === 'left' && (
              <Ionicons
                name={icon}
                size={sStyle.iconSize}
                color={isDisabled ? Colors.textMuted : vStyle.text}
                style={styles.iconLeft}
              />
            )}
            <Text
              style={[
                styles.text,
                {
                  fontSize: sStyle.fontSize,
                  color: isDisabled ? Colors.textMuted : vStyle.text,
                },
                textStyle,
              ]}
            >
              {title}
            </Text>
            {icon && iconPosition === 'right' && (
              <Ionicons
                name={icon}
                size={sStyle.iconSize}
                color={isDisabled ? Colors.textMuted : vStyle.text}
                style={styles.iconRight}
              />
            )}
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  animatedWrapper: {
    alignSelf: 'flex-start',
  },
  fullWidth: {
    alignSelf: 'stretch',
    width: '100%',
  },
  button: {
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontWeight: FontWeights.semibold,
    letterSpacing: 0.3,
  },
  iconLeft: {
    marginRight: Spacing.sm,
  },
  iconRight: {
    marginLeft: Spacing.sm,
  },
});
