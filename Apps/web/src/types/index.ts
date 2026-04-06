/** Global shared TypeScript type definitions for the KidsMind web app. */

export type Nullable<T> = T | null;

export type ThemeMode = 'light' | 'dark';
export type AccessibilityFontSize = 'small' | 'medium' | 'large';

export interface ApiError {
  message: string;
  status: number;
}

export interface ApiResponse<TData> {
  data: TData;
  headers: Headers;
  status: number;
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  skipAuthRecovery?: boolean;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export interface ScrollRevealOptions {
  threshold?: number;
  rootMargin?: string;
  once?: boolean;
}

export type FormErrors = Record<string, string>;

export interface FormFieldState {
  value: string;
  error: string;
  touched: boolean;
  isDirty: boolean;
}

export interface UseFormReturn<T extends object = Record<string, unknown>> {
  values: T;
  errors: FormErrors;
  isDirty: boolean;
  isValid: boolean;
  isSubmitting: boolean;
  handleChange: (field: keyof T, value: unknown) => void;
  handleBlur: (field: keyof T) => void;
  handleSubmit: (onSubmit: (values: T) => Promise<void>) => Promise<void>;
  reset: () => void;
}

export interface FormFieldProps {
  id: string;
  label: string;
  type?: 'text' | 'email' | 'number' | 'date' | 'select' | 'checkbox';
  value: string;
  error?: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  autoComplete?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  children?: React.ReactNode;
}

export interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  error?: string;
  placeholder?: string;
  hint?: string;
  hintTone?: 'neutral' | 'danger';
  showStrengthMeter?: boolean;
  autoComplete?: 'current-password' | 'new-password';
  describedBy?: string;
  required?: boolean;
  onChange: (value: string) => void;
  onBlur?: () => void;
}

export interface AvatarPickerProps {
  selectedEmoji: string;
  onSelect: (emoji: string) => void;
  label: string;
}

export interface ProgressBarProps {
  percent: number;
  label?: string;
  animated?: boolean;
}
