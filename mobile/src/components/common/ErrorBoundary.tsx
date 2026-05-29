import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { BorderRadius, FontSizes, FontWeights, Spacing } from '@/constants/theme';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary] Uncaught error:', error);
    console.error('[ErrorBoundary] Component stack:', info.componentStack);
    this.setState({ componentStack: info.componentStack ?? null });
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null, componentStack: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <SafeAreaView style={styles.container}>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.iconWrapper}>
              <Ionicons name="alert-circle-outline" size={64} color={Colors.danger} />
            </View>

            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.description}>
              The app encountered an unexpected error. Your session data is safe.
            </Text>

            {__DEV__ && this.state.error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorTitle}>Error (dev only):</Text>
                <Text style={styles.errorMessage}>{this.state.error.message}</Text>
                {this.state.componentStack && (
                  <Text style={styles.errorStack} numberOfLines={8}>
                    {this.state.componentStack}
                  </Text>
                )}
              </View>
            )}

            <TouchableOpacity style={styles.retryBtn} onPress={this.handleRetry}>
              <Ionicons name="refresh-outline" size={20} color="white" />
              <Text style={styles.retryText}>Try Again</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: {
    flexGrow: 1, alignItems: 'center', justifyContent: 'center',
    padding: Spacing.xl, gap: Spacing.md,
  },
  iconWrapper: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: Colors.dangerFaded,
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm,
  },
  title: {
    fontSize: FontSizes.xxl, fontWeight: FontWeights.bold,
    color: Colors.textPrimary, textAlign: 'center',
  },
  description: {
    fontSize: FontSizes.md, color: Colors.textSecondary,
    textAlign: 'center', lineHeight: 22,
  },
  errorBox: {
    width: '100%', backgroundColor: Colors.surfaceVariant,
    borderRadius: BorderRadius.md, padding: Spacing.md, marginTop: Spacing.sm,
  },
  errorTitle: { fontSize: FontSizes.xs, fontWeight: FontWeights.bold, color: Colors.danger, marginBottom: 4 },
  errorMessage: { fontSize: FontSizes.sm, color: Colors.textPrimary, fontFamily: 'monospace' },
  errorStack: { fontSize: FontSizes.xs, color: Colors.textMuted, marginTop: 8 },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.primary, paddingHorizontal: 32, paddingVertical: 14,
    borderRadius: BorderRadius.full, marginTop: Spacing.md,
  },
  retryText: { color: 'white', fontSize: FontSizes.md, fontWeight: FontWeights.bold },
});
