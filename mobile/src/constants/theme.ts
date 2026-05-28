import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper';
import { Colors } from './colors';

export const paperTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: Colors.primary,
    onPrimary: Colors.textInverse,
    primaryContainer: Colors.primaryFaded,
    onPrimaryContainer: Colors.primaryDark,
    secondary: Colors.secondary,
    onSecondary: Colors.textInverse,
    secondaryContainer: Colors.secondaryFaded,
    onSecondaryContainer: Colors.secondaryDark,
    tertiary: Colors.success,
    onTertiary: Colors.textInverse,
    tertiaryContainer: Colors.successFaded,
    onTertiaryContainer: Colors.successDark,
    error: Colors.danger,
    onError: Colors.textInverse,
    errorContainer: Colors.dangerFaded,
    onErrorContainer: Colors.dangerDark,
    background: Colors.background,
    onBackground: Colors.textPrimary,
    surface: Colors.surface,
    onSurface: Colors.textPrimary,
    surfaceVariant: Colors.surfaceVariant,
    onSurfaceVariant: Colors.textSecondary,
    outline: Colors.border,
    outlineVariant: Colors.borderDark,
    shadow: Colors.textPrimary,
    scrim: Colors.overlayDark,
    inverseSurface: Colors.darkSurface,
    inverseOnSurface: Colors.textInverse,
    inversePrimary: Colors.primaryLight,
    elevation: {
      level0: 'transparent',
      level1: Colors.surface,
      level2: Colors.surface,
      level3: Colors.surface,
      level4: Colors.surface,
      level5: Colors.surface,
    },
    surfaceDisabled: Colors.surfaceVariant,
    onSurfaceDisabled: Colors.textDisabled,
    backdrop: Colors.overlayDark,
  },
  roundness: 12,
};

export const paperDarkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: Colors.primaryLight,
    secondary: Colors.secondaryLight,
    background: Colors.darkBackground,
    surface: Colors.darkSurface,
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const FontSizes = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 30,
  display: 36,
};

export const FontWeights = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
};

export const BorderRadius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 9999,
};

export const Shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 12,
  },
};
