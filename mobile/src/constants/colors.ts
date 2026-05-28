export const Colors = {
  // Primary brand colors
  primary: '#2563EB',       // blue-600
  primaryDark: '#1D4ED8',   // blue-700
  primaryLight: '#3B82F6',  // blue-500
  primaryFaded: '#EFF6FF',  // blue-50

  // Secondary
  secondary: '#7C3AED',     // violet-600
  secondaryDark: '#6D28D9', // violet-700
  secondaryLight: '#8B5CF6',// violet-500
  secondaryFaded: '#F5F3FF',// violet-50

  // Status colors
  success: '#16A34A',       // green-600
  successDark: '#15803D',   // green-700
  successLight: '#22C55E',  // green-500
  successFaded: '#F0FDF4',  // green-50

  warning: '#D97706',       // amber-600
  warningDark: '#B45309',   // amber-700
  warningLight: '#F59E0B',  // amber-500
  warningFaded: '#FFFBEB',  // amber-50

  danger: '#DC2626',        // red-600
  dangerDark: '#B91C1C',    // red-700
  dangerLight: '#EF4444',   // red-500
  dangerFaded: '#FEF2F2',   // red-50

  info: '#0891B2',          // cyan-600
  infoFaded: '#ECFEFF',     // cyan-50

  // Neutrals
  background: '#F8FAFC',    // slate-50
  surface: '#FFFFFF',
  surfaceVariant: '#F1F5F9',// slate-100
  border: '#E2E8F0',        // slate-200
  borderDark: '#CBD5E1',    // slate-300
  divider: '#F1F5F9',

  // Text
  textPrimary: '#0F172A',   // slate-900
  textSecondary: '#64748B', // slate-500
  textMuted: '#94A3B8',     // slate-400
  textInverse: '#FFFFFF',
  textDisabled: '#CBD5E1',  // slate-300

  // Attendance status colors
  present: '#16A34A',
  absent: '#DC2626',
  late: '#D97706',
  leave: '#7C3AED',
  manual_override: '#0891B2',

  // Chart colors
  chartBlue: '#2563EB',
  chartViolet: '#7C3AED',
  chartGreen: '#16A34A',
  chartOrange: '#EA580C',
  chartPink: '#DB2777',
  chartCyan: '#0891B2',

  // Dark mode (for future use)
  darkBackground: '#0F172A',
  darkSurface: '#1E293B',
  darkBorder: '#334155',

  // Overlay
  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayLight: 'rgba(0, 0, 0, 0.2)',
  overlayDark: 'rgba(0, 0, 0, 0.7)',

  // Camera overlay
  cameraOverlay: 'rgba(0, 0, 0, 0.6)',
  faceGuideColor: '#2563EB',
  faceGuideSuccess: '#16A34A',
  faceGuideError: '#DC2626',

  // Gradients
  gradientPrimary: ['#2563EB', '#7C3AED'] as string[],
  gradientSuccess: ['#16A34A', '#0891B2'] as string[],
  gradientWarm: ['#D97706', '#DC2626'] as string[],
  gradientCool: ['#0891B2', '#2563EB'] as string[],

  // Transparent
  transparent: 'transparent',
};

export type ColorName = keyof typeof Colors;
