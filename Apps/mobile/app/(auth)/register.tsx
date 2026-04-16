import { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod/v4';
import { zodResolver } from '@hookform/resolvers/zod';
import { Colors, Spacing, Radii, Shadows, Typography } from '@/constants/theme';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { FormTextInput } from '@/components/ui/FormTextInput';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { useAuth } from '@/contexts/AuthContext';

const registerSchema = z
  .object({
    fullName: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.email('Please enter a valid email'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(8, 'Please confirm your password'),
    agreeToTerms: z.literal(true, {
      message: 'You must agree to the terms',
    }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

function getPasswordStrength(password: string): {
  label: string;
  color: string;
} {
  if (!password || password.length < 8) return { label: '', color: '' };
  let score = 0;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (password.length >= 12) score++;

  if (score <= 1) return { label: 'Weak', color: Colors.tertiary };
  if (score <= 2) return { label: 'Moderate', color: Colors.accentAmber };
  return { label: 'Strong', color: Colors.success };
}

export default function RegisterScreen() {
  const router = useRouter();
  const { register, loading, error } = useAuth();
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const passwordValue = watch('password');
  const strength = useMemo(() => getPasswordStrength(passwordValue), [passwordValue]);

  async function onSubmit(data: RegisterFormData) {
    setApiError(null);
    await register({
      fullName: data.fullName,
      email: data.email,
      password: data.password,
      confirmPassword: data.confirmPassword,
    });
  }

  const displayError = apiError || error;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Back + Brand */}
          <View style={styles.topRow}>
            <TouchableOpacity
              onPress={() => router.back()}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <MaterialCommunityIcons
                name="arrow-left"
                size={24}
                color={Colors.text}
              />
            </TouchableOpacity>
            <Text style={styles.brandName}>KidsMind</Text>
            <View style={{ width: 24 }} />
          </View>

          {/* Section header */}
          <View style={styles.sectionHeader}>
            <View style={styles.lockBadge}>
              <MaterialCommunityIcons
                name="lock-outline"
                size={24}
                color={Colors.primary}
              />
            </View>
            <Text style={styles.sectionTitle}>Create your parent account</Text>
            <Text style={styles.sectionSub}>
              Join our community of mindful educators and parents.
            </Text>
          </View>

          {/* Error banner */}
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

          {/* Form */}
          <View style={styles.form}>
            <Controller
              control={control}
              name="fullName"
              render={({ field: { onChange, onBlur, value } }) => (
                <FormTextInput
                  label="Full Name"
                  placeholder="Jane Doe"
                  autoCapitalize="words"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  error={errors.fullName?.message}
                  leftIcon={
                    <MaterialCommunityIcons
                      name="account-outline"
                      size={20}
                      color={Colors.placeholder}
                    />
                  }
                />
              )}
            />

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
                  onBlur={onBlur}
                  onChangeText={onChange}
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
                <View>
                  <PasswordInput
                    label="Password"
                    placeholder="At least 8 characters"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    error={errors.password?.message}
                  />
                  {strength.label ? (
                    <Text style={[styles.strengthText, { color: strength.color }]}>
                      Strength: {strength.label}
                    </Text>
                  ) : null}
                </View>
              )}
            />

            <Controller
              control={control}
              name="confirmPassword"
              render={({ field: { onChange, onBlur, value } }) => (
                <PasswordInput
                  label="Confirm Password"
                  placeholder="Re-enter your password"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  error={errors.confirmPassword?.message}
                />
              )}
            />

            {/* Terms checkbox */}
            <Controller
              control={control}
              name="agreeToTerms"
              render={({ field: { onChange, value } }) => (
                <TouchableOpacity
                  style={styles.termsRow}
                  onPress={() => onChange(!value)}
                  activeOpacity={0.7}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: !!value }}
                  accessibilityLabel="Agree to Privacy Policy and Terms of Service"
                >
                  <View
                    style={[
                      styles.checkbox,
                      !!value && styles.checkboxChecked,
                    ]}
                  >
                    {!!value && (
                      <MaterialCommunityIcons
                        name="check"
                        size={14}
                        color={Colors.white}
                      />
                    )}
                  </View>
                  <Text style={styles.termsText}>
                    I agree to the{' '}
                    <Text style={styles.termsLink}>Privacy Policy</Text> and{' '}
                    <Text style={styles.termsLink}>Terms of Service</Text>.
                  </Text>
                </TouchableOpacity>
              )}
            />
            {errors.agreeToTerms && (
              <Text style={styles.termsError}>{errors.agreeToTerms.message}</Text>
            )}
          </View>

          {/* CTA */}
          <PrimaryButton
            label="Create Account"
            onPress={handleSubmit(onSubmit)}
            loading={loading}
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
            <MaterialCommunityIcons
              name="google"
              size={20}
              color={Colors.text}
            />
            <Text style={styles.googleText}>Continue with Google</Text>
          </TouchableOpacity>

          {/* Sign in link */}
          <View style={styles.signInRow}>
            <Text style={styles.signInText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.replace('/(auth)/login' as never)}>
              <Text style={styles.signInLink}>Log In</Text>
            </TouchableOpacity>
          </View>
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
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  brandName: {
    ...Typography.headline,
    fontSize: 20,
    color: Colors.primary,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  sectionHeader: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  lockBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.title,
    textAlign: 'center',
    color: Colors.text,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  sectionSub: {
    ...Typography.caption,
    textAlign: 'center',
    color: Colors.textSecondary,
    fontFamily: 'Inter_400Regular',
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
  },
  strengthText: {
    ...Typography.caption,
    marginTop: -Spacing.sm,
    marginBottom: Spacing.md,
    fontFamily: 'Inter_500Medium',
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: Colors.outline,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  termsText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    flex: 1,
    fontFamily: 'Inter_400Regular',
  },
  termsLink: {
    color: Colors.primary,
    fontFamily: 'Inter_500Medium',
  },
  termsError: {
    ...Typography.caption,
    color: Colors.errorText,
    marginTop: Spacing.xs,
    fontFamily: 'Inter_400Regular',
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
    gap: Spacing.sm,
    height: 44,
    borderRadius: Radii.sm,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.white,
    marginBottom: Spacing.xl,
  },
  googleText: {
    ...Typography.captionMedium,
    color: Colors.text,
    fontFamily: 'Inter_500Medium',
  },
  signInRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  signInText: {
    ...Typography.caption,
    color: Colors.textTertiary,
    fontFamily: 'Inter_400Regular',
  },
  signInLink: {
    ...Typography.captionMedium,
    color: Colors.primary,
    fontFamily: 'Inter_500Medium',
  },
});
