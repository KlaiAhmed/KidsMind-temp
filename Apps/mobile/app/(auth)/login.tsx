import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod/v4';
import { zodResolver } from '@hookform/resolvers/zod';
import { Colors, Spacing, Radii, Shadows, Typography } from '@/constants/theme';
import type { LoginRequest } from '@/auth/types';
import { useAuth } from '@/contexts/AuthContext';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { FormTextInput } from '@/components/ui/FormTextInput';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { useEffect, useRef } from 'react';
import { triggerHaptic } from '@/src/utils/haptics';

const googleIcon = require('@/assets/icons/google-48.png');

const loginSchema = z.object({
  email: z.email('Please enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type LoginFormData = LoginRequest & z.infer<typeof loginSchema>;

export default function LoginScreen() {
  const router = useRouter();
  const { login, loading, error, clearError } = useAuth();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  // --- Haptic: wrong password ---
  const prevLoginErrorRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    // Fire only when error transitions from null/undefined to a new message.
    // Prevents firing on mount (prevLoginErrorRef starts as undefined sentinel).
    if (
      prevLoginErrorRef.current !== undefined &&
      error !== null &&
      error !== undefined &&
      error !== prevLoginErrorRef.current
    ) {
      triggerHaptic('wrongPassword');
    }
    prevLoginErrorRef.current = error;
  }, [error]);
  // --- end haptic ---

  async function onSubmit(data: LoginFormData) {
    clearError();
    await login(data);
    // AuthContext will update — navigation is handled by root layout
  }

  const displayError = error;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoid}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
      <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
        {/* Brand header */}
        <View style={styles.topRow}>
          <View style={{ width: 24 }} />
          <Text style={styles.brandName}>KidsMind</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Main content area - centered */}
        <View>
            {/* Welcome */}
            <View style={styles.welcome}>
              <Text style={styles.welcomeTitle}>Welcome Back !</Text>
              <Text style={styles.welcomeSub}>
                Ready to see what they&apos;re learning today ?
              </Text>
            </View>

            {/* Error banner */}
            <View style={{ minHeight: 70 }}>
            {displayError && (
              <View style={styles.errorBanner}>
                <MaterialCommunityIcons
                  name="alert-circle-outline"
                  size={20}
                  color={Colors.errorText}
                />
                <Text style={styles.errorText}>{displayError}</Text>
              </View>
            )}
            </View>
            {/* Form */}
            <View style={styles.form}>
              <Controller
                control={control}
                name="email"
                render={({ field: { onChange, onBlur, value } }) => (
                  <FormTextInput
                    label="Email Address"
                    placeholder="you@example.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!loading}
                    onBlur={onBlur}
                    onChangeText={(text) => {
                      onChange(text);
                      if (displayError) {
                        clearError();
                      }
                    }}
                    value={value}
                    error={errors.email?.message}
                    leftIcon={
                      <MaterialCommunityIcons
                        name="email-outline"
                        size={20}
                        color={Colors.placeholder}
                      />
                    }
                  />
                )}
              />

              <Controller
                control={control}
                name="password"
                render={({ field: { onChange, onBlur, value } }) => (
                  <PasswordInput
                    label="Password"
                    placeholder="Enter your password"
                    editable={!loading}
                    autoCapitalize="none"
                    autoCorrect={false}
                    onBlur={onBlur}
                    onChangeText={(text) => {
                      onChange(text);
                      if (displayError) {
                        clearError();
                      }
                    }}
                    value={value}
                    error={errors.password?.message}
                  />
                )}
              />

              <TouchableOpacity
                disabled={loading}
                onPress={() => {
                  // TODO: Navigate to forgot password
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.forgotPassword}>Forgot password?</Text>
              </TouchableOpacity>
            </View>

            {/* CTA */}
            <PrimaryButton
              label="Log In"
              onPress={handleSubmit(onSubmit)}
              loading={loading}
              disabled={loading}
              style={styles.ctaButton}
            />

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>Or continue with</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Google */}
            <TouchableOpacity style={styles.googleButton} activeOpacity={0.7}>
              <Image source={googleIcon} style={styles.googleIcon} resizeMode="contain" />
              <Text style={styles.googleText}>Sign in with Google</Text>
            </TouchableOpacity>

            {/* Sign up link */}
            <View style={styles.signUpRow}>
              <Text style={styles.signUpText}>Don&apos;t have an account? </Text>
              <TouchableOpacity
                disabled={loading}
                onPress={() => router.push('/(auth)/register' as never)}
              >
                <Text style={styles.signUpLink}>Sign up</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Footer - at bottom */}
          <Text style={styles.footer}>
            All rights reserved{' '}©{' '}KidsMind
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
    flexGrow: 1,
    justifyContent: 'space-between',
    minHeight: '100%',
  },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  brandName: {
    ...Typography.headline,
    fontSize: 20,
    color: Colors.primary,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  welcome: {
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  welcomeTitle: {
    ...Typography.display,
    fontSize: 28,
    color: Colors.text,
    fontFamily: 'PlusJakartaSans_700Bold',
    marginBottom: Spacing.xs,
    textAlign: 'center',
    letterSpacing: -0.8,
    includeFontPadding: false,
    textShadowColor: 'rgba(59, 47, 204, 0.12)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 6,
  },
  welcomeSub: {
    ...Typography.body,
    fontSize: 15,
    lineHeight: 22,
    color: Colors.textSecondary,
    textAlign: 'center',
    fontFamily: 'Inter_400Regular',
    width: '100%',
    maxWidth: 320,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.errorContainer,
    borderRadius: Radii.sm,
    padding: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  errorText: {
    ...Typography.caption,
    color: Colors.errorText,
    flex: 1,
    fontFamily: 'Inter_400Regular',
  },
  form: {
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
    width: '100%',
    maxWidth: 320,
    alignSelf: 'center',
  },
  forgotPassword: {
    ...Typography.caption,
    color: Colors.primary,
    textAlign: 'right',
    marginTop: -Spacing.sm,
    fontFamily: 'Inter_500Medium',
  },
  ctaButton: {
    ...Shadows.button,
    marginBottom: Spacing.xl,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.outline,
  },
  dividerText: {
    ...Typography.caption,
    color: Colors.textTertiary,
    fontFamily: 'Inter_400Regular',
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    height: 60,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.white,
    marginBottom: Spacing.md,
  },
  googleIcon: {
    width: 24,
    height: 24,
  },
  googleText: {
    ...Typography.bodyMedium,
    color: Colors.text,
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
  },
  signUpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  signUpText: {
    ...Typography.caption,
    color: Colors.textTertiary,
    fontFamily: 'Inter_400Regular',
  },
  signUpLink: {
    ...Typography.captionMedium,
    color: Colors.primary,
    fontFamily: 'Inter_500Medium',
  },
  footer: {
    ...Typography.caption,
    fontSize: 12,
    color: Colors.textTertiary,
    textAlign: 'center',
    fontFamily: 'Inter_400Regular',
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
});
