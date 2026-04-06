import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotionPreference } from '../../../hooks/useReducedMotionPreference';
import { apiClient } from '../../../lib/api';
import { cn } from '../../../utils/cn';
import '../../../styles/parent-portal.css';

const COPY = {
  title: 'Parent verification',
  subtitle: 'Enter your 4-digit PIN to continue.',
  mobileHint: 'Use Face ID or PIN',
  incorrectPin: 'Incorrect PIN',
  lockout: 'Too many attempts. Try again in {seconds}s.',
  verifying: 'Verifying...',
  unlock: 'Unlock parent portal',
  clear: 'Clear PIN',
  autoLocked: 'Session locked due to inactivity.',
} as const;

const PIN_LENGTH = 4;
const MAX_FAILURES = 5;
const LOCKOUT_SECONDS = 60;
const PIN_COOKIE_NAME = 'pin_session';
const PIN_COOKIE_MAX_AGE_SECONDS = 30 * 60;
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;

export interface VerifyParentPinResponse {
  is_valid?: boolean;
}

export interface PinGateProps {
  children: React.ReactNode;
}

const isMobileAgent = (): boolean => {
  if (typeof navigator === 'undefined') {
    return false;
  }

  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
};

const getCookie = (cookieName: string): string | null => {
  if (typeof document === 'undefined') {
    return null;
  }

  const cookie = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${cookieName}=`));

  if (!cookie) {
    return null;
  }

  const [, rawValue = ''] = cookie.split('=');
  return rawValue ? decodeURIComponent(rawValue) : null;
};

const setPinCookie = (): void => {
  if (typeof document === 'undefined') {
    return;
  }

  document.cookie = `${PIN_COOKIE_NAME}=valid; Max-Age=${PIN_COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
};

const clearPinCookie = (): void => {
  if (typeof document === 'undefined') {
    return;
  }

  document.cookie = `${PIN_COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax`;
};

const hasValidPinCookie = (): boolean => {
  return getCookie(PIN_COOKIE_NAME) === 'valid';
};

const createEmptyDigits = (): string[] => Array(PIN_LENGTH).fill('');

const PinGate = ({ children }: PinGateProps) => {
  const [pinDigits, setPinDigits] = useState<string[]>(createEmptyDigits);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => hasValidPinCookie());
  const [isShaking, setIsShaking] = useState<boolean>(false);
  const [lockUntil, setLockUntil] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const failedAttemptsRef = useRef<number>(0);
  const isReducedMotion = useReducedMotionPreference();

  const isMobile = useMemo(isMobileAgent, []);

  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const lockActive = lockUntil !== null && lockUntil > Date.now();

  const clearDigits = useCallback(() => {
    setPinDigits(createEmptyDigits());
    window.setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 0);
  }, []);

  const triggerFailure = useCallback(
    (message: string) => {
      setErrorMessage(message);
      setIsShaking(false);
      if (!isReducedMotion) {
        window.requestAnimationFrame(() => {
          setIsShaking(true);
        });
      }
      clearDigits();

      failedAttemptsRef.current += 1;
      const next = failedAttemptsRef.current;

      if (next >= MAX_FAILURES) {
        setLockUntil(Date.now() + LOCKOUT_SECONDS * 1000);
        setRemainingSeconds(LOCKOUT_SECONDS);
        failedAttemptsRef.current = 0;
      }
    },
    [clearDigits, isReducedMotion]
  );

  const submitPin = useCallback(async () => {
    if (isSubmitting || lockActive) {
      return;
    }

    const mergedPin = pinDigits.join('');
    if (!/^\d{4}$/.test(mergedPin)) {
      triggerFailure(COPY.incorrectPin);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const response = await apiClient.post<VerifyParentPinResponse>('/api/v1/safety-and-rules/verify-parent-pin', {
        body: {
          parentPin: mergedPin,
        },
      });

      const isValid = response.data.is_valid ?? true;
      if (!isValid) {
        triggerFailure(COPY.incorrectPin);
        return;
      }

      setPinCookie();
      setIsUnlocked(true);
      setIsShaking(false);
      setErrorMessage('');
      failedAttemptsRef.current = 0;
      clearDigits();
    } catch (requestError) {
      const fallbackMessage = typeof requestError === 'object' && requestError !== null && 'message' in requestError
        ? String((requestError as { message: string }).message)
        : COPY.incorrectPin;
      triggerFailure(fallbackMessage || COPY.incorrectPin);
    } finally {
      setIsSubmitting(false);
    }
  }, [clearDigits, isSubmitting, lockActive, pinDigits, triggerFailure]);

  const handleDigitChange = useCallback(
    (index: number, value: string) => {
      if (lockActive || isSubmitting) {
        return;
      }

      const digit = value.replace(/\D/g, '').slice(-1);

      setPinDigits((current) => {
        const next = [...current];
        next[index] = digit;
        return next;
      });

      if (errorMessage) {
        setErrorMessage('');
        setIsShaking(false);
      }

      if (digit && index < PIN_LENGTH - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    },
    [errorMessage, isSubmitting, lockActive]
  );

  const handleDigitKeyDown = useCallback(
    (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
      if (lockActive || isSubmitting) {
        return;
      }

      if (event.key === 'Backspace') {
        event.preventDefault();

        setPinDigits((current) => {
          const next = [...current];
          if (next[index]) {
            next[index] = '';
          } else if (index > 0) {
            next[index - 1] = '';
            window.setTimeout(() => {
              inputRefs.current[index - 1]?.focus();
            }, 0);
          }

          return next;
        });
      }

      if (event.key === 'ArrowLeft' && index > 0) {
        event.preventDefault();
        inputRefs.current[index - 1]?.focus();
      }

      if (event.key === 'ArrowRight' && index < PIN_LENGTH - 1) {
        event.preventDefault();
        inputRefs.current[index + 1]?.focus();
      }
    },
    [isSubmitting, lockActive]
  );

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLInputElement>) => {
      if (lockActive || isSubmitting) {
        return;
      }

      event.preventDefault();
      const rawDigits = event.clipboardData
        .getData('text')
        .replace(/\D/g, '')
        .slice(0, PIN_LENGTH)
        .split('');

      if (rawDigits.length === 0) {
        return;
      }

      const nextDigits = createEmptyDigits();
      rawDigits.forEach((digit, index) => {
        nextDigits[index] = digit;
      });

      setPinDigits(nextDigits);
      const focusIndex = Math.min(rawDigits.length, PIN_LENGTH - 1);
      inputRefs.current[focusIndex]?.focus();
      setErrorMessage('');
    },
    [isSubmitting, lockActive]
  );

  useEffect(() => {
    if (isUnlocked) {
      return;
    }

    if (lockActive || isSubmitting) {
      return;
    }

    const complete = pinDigits.every((digit) => /^\d$/.test(digit));
    if (!complete) {
      return;
    }

    void submitPin();
  }, [isSubmitting, isUnlocked, lockActive, pinDigits, submitPin]);

  useEffect(() => {
    if (!lockUntil) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const nextSeconds = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));
      setRemainingSeconds(nextSeconds);

      if (nextSeconds <= 0) {
        setLockUntil(null);
        setRemainingSeconds(0);
      }
    }, 250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [lockUntil]);

  useEffect(() => {
    if (!isUnlocked) {
      return;
    }

    let timeoutId: number | null = null;

    const resetTimer = (): void => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }

      timeoutId = window.setTimeout(() => {
        clearPinCookie();
        setIsUnlocked(false);
        setErrorMessage(COPY.autoLocked);
        clearDigits();
      }, INACTIVITY_TIMEOUT_MS);
    };

    resetTimer();
    window.addEventListener('pointermove', resetTimer);
    window.addEventListener('keydown', resetTimer);

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }

      window.removeEventListener('pointermove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
    };
  }, [clearDigits, isUnlocked]);

  useEffect(() => {
    if (isUnlocked && !hasValidPinCookie()) {
      setIsUnlocked(false);
      setErrorMessage(COPY.autoLocked);
    }
  }, [isUnlocked]);

  if (isUnlocked) {
    return <>{children}</>;
  }

  const subtitle = lockActive
    ? COPY.lockout.replace('{seconds}', String(remainingSeconds))
    : COPY.subtitle;

  return (
    <div className="pp-pin-overlay" role="dialog" aria-modal="true" aria-labelledby="pin-gate-title">
      <form
        className={cn('pp-pin-modal', isShaking && 'pp-shake')}
        onSubmit={(event) => {
          event.preventDefault();
          void submitPin();
        }}
      >
        <h1 id="pin-gate-title" className="pp-title">{COPY.title}</h1>
        <p>{subtitle}</p>
        {isMobile && <p className="pill-amber pp-pill">{COPY.mobileHint}</p>}

        <div className="pp-pin-row" aria-live="polite">
          {pinDigits.map((digit, index) => {
            const inputId = `pin-input-${index}`;

            return (
              <div key={inputId}>
                <label htmlFor={inputId} className="srOnly">
                  PIN digit {index + 1}
                </label>
                <input
                  id={inputId}
                  ref={(element) => {
                    inputRefs.current[index] = element;
                  }}
                  className="pp-pin-input pp-focusable"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  disabled={isSubmitting || lockActive}
                  aria-label={`PIN digit ${index + 1}`}
                  onChange={(event) => {
                    handleDigitChange(index, event.currentTarget.value);
                  }}
                  onKeyDown={(event) => {
                    handleDigitKeyDown(index, event);
                  }}
                  onPaste={handlePaste}
                />
              </div>
            );
          })}
        </div>

        {errorMessage && (
          <p className="pp-error" role="alert">
            {errorMessage}
          </p>
        )}

        <div className="pp-topbar-actions">
          <button
            type="button"
            className="pp-button pp-touch pp-focusable"
            aria-label={COPY.clear}
            onClick={() => {
              clearDigits();
              setErrorMessage('');
            }}
          >
            {COPY.clear}
          </button>
          <button
            type="submit"
            className="pp-button pp-button-primary pp-touch pp-focusable"
            aria-label={COPY.unlock}
            disabled={isSubmitting || lockActive}
          >
            {isSubmitting ? COPY.verifying : COPY.unlock}
          </button>
        </div>
      </form>
    </div>
  );
};

export default PinGate;
