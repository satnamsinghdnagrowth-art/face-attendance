import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { FontWeights } from '@/constants/theme';

interface AvatarProps {
  name?: string;
  photoUrl?: string;
  size?: number;
  onPress?: () => void;
  showEditButton?: boolean;
  backgroundColor?: string;
}

const getInitials = (name: string): string => {
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
};

const getColorFromName = (name: string): string => {
  const colors = [
    Colors.primary,
    Colors.secondary,
    Colors.success,
    Colors.warning,
    Colors.info,
    '#EC4899',
    '#06B6D4',
    '#8B5CF6',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

export const Avatar: React.FC<AvatarProps> = ({
  name = 'User',
  photoUrl,
  size = 48,
  onPress,
  showEditButton = false,
  backgroundColor,
}) => {
  const initials = getInitials(name);
  const bgColor = backgroundColor || getColorFromName(name);
  const fontSize = size * 0.38;
  const editSize = size * 0.35;

  const content = (
    <View style={{ position: 'relative', width: size, height: size }}>
      {photoUrl ? (
        <Image
          source={{ uri: photoUrl }}
          style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
        />
      ) : (
        <View
          style={[
            styles.placeholder,
            { width: size, height: size, borderRadius: size / 2, backgroundColor: bgColor },
          ]}
        >
          <Text style={[styles.initials, { fontSize }]}>{initials}</Text>
        </View>
      )}
      {showEditButton && (
        <View
          style={[
            styles.editBadge,
            {
              width: editSize,
              height: editSize,
              borderRadius: editSize / 2,
              right: 0,
              bottom: 0,
            },
          ]}
        >
          <Ionicons name="camera" size={editSize * 0.6} color={Colors.textInverse} />
        </View>
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
};

const styles = StyleSheet.create({
  image: {
    resizeMode: 'cover',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: Colors.textInverse,
    fontWeight: FontWeights.bold,
    letterSpacing: 0.5,
  },
  editBadge: {
    position: 'absolute',
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.surface,
  },
});
