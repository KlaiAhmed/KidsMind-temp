import { useState } from 'react';
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

const loginSchema = z.object({
  email: z.email('Please enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginScreen() {
  const router = useRouter();
  const { login, loading, error, clearError } = useAuth();
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(data: LoginFormData) {
    setApiError(null);
    await login(data);
    // AuthContext will update — navigation is handled by root layout
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
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.brandName}>KidsMind</Text>
            <Text style={styles.brandSub}>KidsMind Parental Portal</Text>
          </View>

          {/* Welcome */}
          <View style={styles.welcome}>
            <Text style={styles.welcomeTitle}>Welcome back</Text>
            <Text style={styles.welcomeSub}>
              Continue managing your child&apos;s learning journey
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
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <FormTextInput
                  label="Email Address"
                  placeholder="you@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onBlur={onBlur}
                  onChangeText={(text) => {
                    onChange(text);
                    if (displayError) {
                      setApiError(null);
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
                  onBlur={onBlur}
                  onChangeText={(text) => {
                    onChange(text);
                    if (displayError) {
                      setApiError(null);
                      clearError();
                    }
                  }}
                  value={value}
                  error={errors.password?.message}
                />
              )}
            />

            <TouchableOpacity
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
            <Text style={styles.googleText}>Google Account</Text>
          </TouchableOpacity>

          {/* Sign up link */}
          <View style={styles.signUpRow}>
            <Text style={styles.signUpText}>Don&apos;t have an account? </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/register' as never)}>
              <Text style={styles.signUpLink}>Sign up</Text>
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <Text style={styles.footer}>
            Secure Parental Access{'  '}©{'  '}KidsMind
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.surfaceContainerLow,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  brandName: {
    ...Typography.headline,
    fontSize: 24,
    color: Colors.primary,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  brandSub: {
    ...Typography.caption,
    color: Colors.textTertiary,
    fontFamily: 'Inter_400Regular',
  },
  welcome: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  welcomeTitle: {
    ...Typography.title,
    color: Colors.text,
    fontFamily: 'PlusJakartaSans_700Bold',
    marginBottom: Spacing.xs,
  },
  welcomeSub: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
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
    gap: Spacing.sm,
    height: 44,
    borderRadius: Radii.sm,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.white,
    marginBottom: Spacing.lg,
  },
  googleText: {
    ...Typography.captionMedium,
    color: Colors.text,
    fontFamily: 'Inter_500Medium',
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
    color: Colors.textTertiary,
    textAlign: 'center',
    fontFamily: 'Inter_400Regular',
  },
});
