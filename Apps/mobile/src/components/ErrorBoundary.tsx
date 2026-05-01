import React, { Component, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { Colors, Radii, Shadows, Sizing, Spacing, Typography } from '@/constants/theme';

interface ErrorBoundaryProps {
  children: ReactNode;
  resetKey?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  retryKey: number;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    retryKey: 0,
  };

  static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidUpdate(previousProps: ErrorBoundaryProps) {
    if (this.state.hasError && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  private handleRetry = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    this.setState((current) => ({
      hasError: false,
      retryKey: current.retryKey + 1,
    }));
  };

  render() {
    if (!this.state.hasError) {
      return <React.Fragment key={this.state.retryKey}>{this.props.children}</React.Fragment>;
    }

    return (
      <View style={styles.screen}>
        <View style={styles.card}>
          <View style={styles.iconBadge}>
            <MaterialCommunityIcons color={Colors.primary} name="heart-flash" size={30} />
          </View>
          <Text accessibilityRole="header" style={styles.title}>
            Oops! Something went wrong.
          </Text>
          <Text style={styles.body}>Tap to try again.</Text>
          {/* a11y: Retry button announces the child-safe recovery action. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Oops! Something went wrong. Tap to try again."
            onPress={this.handleRetry}
            style={({ pressed }) => [styles.retryButton, pressed ? styles.retryButtonPressed : null]}
          >
            <MaterialCommunityIcons color={Colors.white} name="refresh" size={18} />
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: Sizing.containerMaxWidth,
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: Radii.xl,
    backgroundColor: Colors.surfaceContainerLowest,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xl,
    shadowColor: Shadows.card.shadowColor,
    shadowOffset: Shadows.card.shadowOffset,
    shadowOpacity: Shadows.card.shadowOpacity,
    shadowRadius: Shadows.card.shadowRadius,
    elevation: Shadows.card.elevation,
  },
  iconBadge: {
    width: Sizing.iconBadge,
    height: Sizing.iconBadge,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.full,
    backgroundColor: Colors.primaryFixed,
  },
  title: {
    ...Typography.title,
    color: Colors.text,
    textAlign: 'center',
  },
  body: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  retryButton: {
    minHeight: Sizing.buttonHeightSm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    borderRadius: Radii.full,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
  },
  retryButtonPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.9,
  },
  retryText: {
    ...Typography.bodySemiBold,
    color: Colors.white,
  },
});
