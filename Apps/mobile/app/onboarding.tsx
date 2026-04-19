import { useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Dimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, Sizing, Typography, Shadows } from '@/constants/theme';
import { PrimaryButton } from '@/components/ui/PrimaryButton';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface OnboardingSlide {
  id: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  iconBg: string;
  title: string;
  subtitle: string;
  stat?: string;
  statLabel?: string;
}

const SLIDES: OnboardingSlide[] = [
  {
    id: 'learn',
    icon: 'auto-fix',
    iconBg: Colors.accentPurple,
    title: 'Learning that grows\nwith your child',
    subtitle:
      'Personalized AI adventures that adapt to your child\'s unique curiosity and pace.',
  },
  {
    id: 'progress',
    icon: 'chart-line',
    iconBg: Colors.accentPurple,
    title: 'Progress you\ncan see',
    subtitle:
      'Real-time insights and customizable safety boundaries right at your fingertips.',
    stat: '92%',
    statLabel: 'Growth',
  },
  {
    id: 'safety',
    icon: 'shield-check',
    iconBg: Colors.accentPurple,
    title: 'You stay\nin control',
    subtitle:
      'COPPA-compliant AI that ensures every interaction is positive and educational.',
    stat: '100%',
    statLabel: 'Kid-Safe',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const isLast = activeIndex === SLIDES.length - 1;

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (index !== activeIndex) setActiveIndex(index);
  }

  function handleNext() {
    if (isLast) {
      router.replace('/(auth)/register' as never);
    } else {
      flatListRef.current?.scrollToIndex({
        index: activeIndex + 1,
        animated: true,
      });
    }
  }

  function handleSkip() {
    router.replace('/(auth)/register' as never);
  }

  function handleAlreadyHaveAccount() {
    router.replace('/(auth)/login' as never);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      {/* Skip button */}
      {!isLast && (
        <TouchableOpacity
          onPress={handleSkip}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.skipButton}
          accessibilityRole="button"
          accessibilityLabel="Skip onboarding"
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      )}

      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        renderItem={({ item }) => <SlideItem item={item} />}
        contentContainerStyle={styles.flatListContent}
      />

      {/* Pagination dots */}
      <View style={styles.dotsRow}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === activeIndex && styles.dotActive]}
          />
        ))}
      </View>

      {/* CTA */}
      <View style={styles.ctaContainer}>
        <PrimaryButton
          label={isLast ? 'Get Started' : 'Next'}
          onPress={handleNext}
          style={styles.ctaButton}
        />
        {isLast && (
          <TouchableOpacity onPress={handleAlreadyHaveAccount} style={styles.existingAccountLink}>
            <Text style={styles.existingAccountText}>
              I already have an account
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Footer pills */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Secure{'  '}•{'  '}Educational{'  '}•{'  '}AI-Powered
        </Text>
      </View>
    </SafeAreaView>
  );
}

// ─── Slide Item ──────────────────────────────────────────────────

function SlideItem({ item }: { item: OnboardingSlide }) {
  return (
    <View style={styles.slide}>
      {/* Icon badge */}
      <View style={[styles.iconBadge, { backgroundColor: item.iconBg }]}>
        <MaterialCommunityIcons
          name={item.icon}
          size={28}
          color={Colors.white}
        />
      </View>

      {/* Title */}
      <Text style={styles.slideTitle}>{item.title}</Text>

      {/* Stat (optional) */}
      {item.stat && (
        <View style={styles.statRow}>
          <Text style={styles.statValue}>{item.stat}</Text>
          <Text style={styles.statLabel}>{item.statLabel}</Text>
        </View>
      )}

      {/* Subtitle */}
      <Text style={styles.slideSubtitle}>{item.subtitle}</Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  skipButton: {
    position: 'absolute',
    top: Spacing.xxl,
    right: Spacing.lg,
    zIndex: 10,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  skipText: {
    ...Typography.captionMedium,
    color: Colors.primary,
  },
  flatListContent: {
    flexGrow: 1,
  },
  slide: {
    width: SCREEN_WIDTH,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xxxl,
    alignItems: 'center',
    gap: Spacing.lg,
  },
  iconBadge: {
    width: Sizing.iconBadge,
    height: Sizing.iconBadge,
    borderRadius: Sizing.iconBadge / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slideTitle: {
    ...Typography.headline,
    fontSize: 32,
    lineHeight: 40,
    textAlign: 'center',
    color: Colors.text,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  slideSubtitle: {
    ...Typography.body,
    textAlign: 'center',
    color: Colors.textSecondary,
    maxWidth: 320,
    fontFamily: 'Inter_400Regular',
  },
  statRow: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  statValue: {
    ...Typography.stat,
    fontSize: 48,
    color: Colors.primary,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
  },
  statLabel: {
    ...Typography.captionMedium,
    color: Colors.accentAmber,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.outline,
  },
  dotActive: {
    width: 24,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  ctaContainer: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  ctaButton: {
    ...Shadows.button,
  },
  existingAccountLink: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  existingAccountText: {
    ...Typography.caption,
    color: Colors.textTertiary,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
  },
  footerText: {
    ...Typography.caption,
    color: Colors.textTertiary,
    letterSpacing: 0.5,
  },
});
