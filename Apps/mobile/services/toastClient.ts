import type { ComponentType } from 'react';

interface ToastPayload {
  type: 'info' | 'success' | 'error';
  text1: string;
  text2?: string;
  visibilityTime?: number;
  autoHide?: boolean;
}

const ToastModule = require('react-native-toast-message').default as {
  show: (payload: ToastPayload) => void;
};

export const ToastHost = ToastModule as ComponentType;

export function showToast(payload: ToastPayload): void {
  ToastModule.show(payload);
}
