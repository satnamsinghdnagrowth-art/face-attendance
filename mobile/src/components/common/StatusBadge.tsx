import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { AttendanceStatus } from '@/types';
import { BorderRadius, FontSizes } from '@/constants/theme';

interface StatusBadgeProps {
  status: AttendanceStatus;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

const statusConfig: Record<AttendanceStatus, {
  label: string;
  bg: string;
  text: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = {
  present: {
    label: 'Present',
    bg: Colors.successFaded,
    text: Colors.success,
    icon: 'checkmark-circle',
  },
  absent: {
    label: 'Absent',
    bg: Colors.dangerFaded,
    text: Colors.danger,
    icon: 'close-circle',
  },
  late: {
    label: 'Late',
    bg: Colors.warningFaded,
    text: Colors.warning,
    icon: 'time',
  },
  leave: {
    label: 'Leave',
    bg: Colors.secondaryFaded,
    text: Colors.secondary,
    icon: 'calendar',
  },
  manual_override: {
    label: 'Manual',
    bg: Colors.infoFaded,
    text: Colors.info,
    icon: 'create',
  },
};

const sizeConfig = {
  sm: { padding: 4, px: 8, fontSize: FontSizes.xs, iconSize: 12 },
  md: { padding: 5, px: 10, fontSize: FontSizes.sm, iconSize: 14 },
  lg: { padding: 7, px: 14, fontSize: FontSizes.md, iconSize: 16 },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'md',
  showIcon = true,
}) => {
  const config = statusConfig[status];
  const sConfig = sizeConfig[size];

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: config.bg,
          paddingVertical: sConfig.padding,
          paddingHorizontal: sConfig.px,
        },
      ]}
    >
      {showIcon && (
        <Ionicons
          name={config.icon}
          size={sConfig.iconSize}
          color={config.text}
          style={styles.icon}
        />
      )}
      <Text style={[styles.text, { fontSize: sConfig.fontSize, color: config.text }]}>
        {config.label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.full,
    alignSelf: 'flex-start',
  },
  icon: {
    marginRight: 4,
  },
  text: {
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
