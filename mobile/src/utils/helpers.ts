import { AttendanceStatus } from '@/types';
import { Colors } from '@/constants/colors';

export const formatDate = (date: string | Date): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return 'Invalid date';
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

export const formatDateShort = (date: string | Date): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return 'Invalid';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const formatTime = (date: string | Date): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
};

export const formatDateTime = (date: string | Date): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return `${formatDateShort(d)} at ${formatTime(d)}`;
};

export const getRelativeTime = (date: string | Date): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';

  const now = Date.now();
  const diff = now - d.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return formatDateShort(d);
};

export const getAttendanceColor = (status: AttendanceStatus): string => {
  switch (status) {
    case 'present':
      return Colors.success;
    case 'absent':
      return Colors.danger;
    case 'late':
      return Colors.warning;
    case 'leave':
      return Colors.secondary;
    case 'manual_override':
      return Colors.info;
    default:
      return Colors.textMuted;
  }
};

export const getAttendanceBgColor = (status: AttendanceStatus): string => {
  switch (status) {
    case 'present':
      return Colors.successFaded;
    case 'absent':
      return Colors.dangerFaded;
    case 'late':
      return Colors.warningFaded;
    case 'leave':
      return Colors.secondaryFaded;
    case 'manual_override':
      return Colors.infoFaded;
    default:
      return Colors.surfaceVariant;
  }
};

export const getInitials = (name: string): string => {
  if (!name || !name.trim()) return 'U';
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
};

export const truncate = (str: string, length: number): string => {
  if (!str) return '';
  if (str.length <= length) return str;
  return str.slice(0, length - 3) + '...';
};

export const formatPercentage = (value: number, decimals = 1): string => {
  if (isNaN(value)) return '0%';
  return `${value.toFixed(decimals)}%`;
};

export const getAttendanceGrade = (percentage: number): { grade: string; color: string } => {
  if (percentage >= 90) return { grade: 'Excellent', color: Colors.success };
  if (percentage >= 75) return { grade: 'Good', color: Colors.primaryLight };
  if (percentage >= 60) return { grade: 'Average', color: Colors.warning };
  return { grade: 'At Risk', color: Colors.danger };
};

export const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

export const formatDuration = (startTime: string, endTime?: string): string => {
  const start = new Date(startTime);
  const end = endTime ? new Date(endTime) : new Date();
  const diffMs = end.getTime() - start.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
};

export const formatSessionTimer = (startTime: string): string => {
  const start = new Date(startTime);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const hours = Math.floor(diffSecs / 3600);
  const mins = Math.floor((diffSecs % 3600) / 60);
  const secs = diffSecs % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');
  if (hours > 0) return `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
  return `${pad(mins)}:${pad(secs)}`;
};

export const isValidEmail = (email: string): boolean => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

export const isValidPhone = (phone: string): boolean => {
  const re = /^\+?[\d\s\-()]{10,15}$/;
  return re.test(phone);
};

export const capitalize = (str: string): string => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
