import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LineChart, BarChart } from 'react-native-chart-kit';
import { Colors } from '@/constants/colors';
import { BorderRadius, FontSizes, FontWeights, Spacing } from '@/constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface AttendanceChartProps {
  data: Array<{ label: string; value: number }>;
  title?: string;
  type?: 'line' | 'bar';
  height?: number;
  color?: string;
  showGrid?: boolean;
}

export const AttendanceChart: React.FC<AttendanceChartProps> = ({
  data,
  title,
  type = 'line',
  height = 200,
  color = Colors.primary,
  showGrid = true,
}) => {
  if (!data || data.length === 0) {
    return (
      <View style={[styles.emptyContainer, { height }]}>
        <Text style={styles.emptyText}>No data available</Text>
      </View>
    );
  }

  const chartWidth = SCREEN_WIDTH - 48;
  const labels = data.map((d) => d.label);
  const values = data.map((d) => d.value);

  const chartConfig = {
    backgroundColor: Colors.surface,
    backgroundGradientFrom: Colors.surface,
    backgroundGradientTo: Colors.surface,
    decimalPlaces: 0,
    color: (opacity = 1) => `${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`,
    labelColor: () => Colors.textSecondary,
    style: { borderRadius: BorderRadius.md },
    propsForDots: {
      r: '5',
      strokeWidth: '2',
      stroke: color,
    },
    propsForBackgroundLines: {
      strokeDasharray: '',
      stroke: showGrid ? Colors.border : 'transparent',
      strokeWidth: 1,
    },
    fillShadowGradient: color,
    fillShadowGradientOpacity: 0.15,
  };

  const chartData = {
    labels,
    datasets: [
      {
        data: values,
        color: (opacity = 1) =>
          `${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`,
        strokeWidth: 2.5,
      },
    ],
  };

  return (
    <View style={styles.container}>
      {title && <Text style={styles.title}>{title}</Text>}
      {type === 'line' ? (
        <LineChart
          data={chartData}
          width={chartWidth}
          height={height}
          chartConfig={chartConfig}
          bezier
          style={styles.chart}
          withInnerLines={showGrid}
          withOuterLines={false}
          withShadow
          fromZero
          yAxisSuffix="%"
        />
      ) : (
        <BarChart
          data={chartData}
          width={chartWidth}
          height={height}
          chartConfig={chartConfig}
          style={styles.chart}
          withInnerLines={showGrid}
          fromZero
          showValuesOnTopOfBars
          yAxisSuffix="%"
          yAxisLabel=""
        />
      )}
    </View>
  );
};

interface MiniStatProps {
  label: string;
  value: string | number;
  color?: string;
  percentage?: number;
}

export const MiniStat: React.FC<MiniStatProps> = ({ label, value, color = Colors.primary, percentage }) => {
  return (
    <View style={styles.miniStat}>
      <View style={[styles.miniStatIndicator, { backgroundColor: color }]} />
      <View style={styles.miniStatContent}>
        <Text style={styles.miniStatLabel}>{label}</Text>
        <Text style={[styles.miniStatValue, { color }]}>{value}</Text>
        {percentage !== undefined && (
          <View style={styles.progressBarContainer}>
            <View
              style={[
                styles.progressBar,
                { width: `${Math.min(percentage, 100)}%`, backgroundColor: color },
              ]}
            />
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-start',
  },
  title: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  chart: {
    borderRadius: BorderRadius.md,
    marginVertical: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceVariant,
    borderRadius: BorderRadius.md,
  },
  emptyText: {
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  miniStat: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: Spacing.sm,
  },
  miniStatIndicator: {
    width: 4,
    height: '100%',
    borderRadius: 2,
    marginTop: 2,
  },
  miniStatContent: {
    flex: 1,
  },
  miniStatLabel: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  miniStatValue: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
  progressBarContainer: {
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    marginTop: 6,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
});
