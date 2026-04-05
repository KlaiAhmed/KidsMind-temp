import { useEffect, useMemo, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useChildrenQuery } from '../../hooks/api/useChildrenQuery';
import type { ChildRecord } from '../../hooks/api/useChildrenQuery';
import { apiClient } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';
import { useActiveChild } from '../../hooks/useActiveChild';
import { AddChildModal } from '../../components/parent/AddChildModal';
import ModernSwitch from '../../components/shared/ModernSwitch/ModernSwitch';
import '../../styles/parent-portal.css';

const COPY = {
  title: 'Child profiles',
  tabAll: 'All profiles',
  tabSafety: 'Safety & rules',
  addChild: 'Add child',
  addFirstChild: 'Add your first child',
  maxReached: 'Max 5 profiles reached',
  edit: 'Edit',
  setLimits: 'Set limits',
  remove: 'Remove',
  noChildren: 'No child profiles yet.',
  loading: 'Loading child profiles...',
  save: 'Save',
  cancel: 'Cancel',
  deleteTitle: 'Remove child profile?',
  deleteDescription: 'This action cannot be undone.',
  deleteConfirm: 'Yes, remove profile',
  deleteFailed: 'Could not remove this profile.',
  saveSuccess: 'Saved successfully',
  saveFailed: 'Could not save changes.',
  dailyLimit: 'Daily limit (minutes)',
  allowedSubjects: 'Allowed subjects',
  allowedWeekdays: 'Allowed weekdays',
  voiceEnabled: 'Voice enabled',
  storeAudio: 'Store audio history',
  noActiveChild: 'Select a child profile to edit safety rules.',
  retry: 'Retry',
} as const;

const SUBJECT_OPTIONS = ['math', 'english', 'french', 'science', 'history', 'art'] as const;
const WEEKDAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const AVATAR_OPTIONS = ['🦁', '🐼', '🦊', '🐯', '🐬', '🦄', '🐻', '🐙', '🦉', '🦖', '🐢', '🐝'] as const;
const LANGUAGE_OPTIONS = ['en', 'fr', 'es', 'it', 'ar', 'ch'] as const;
const PRESET_MINUTES = [15, 30, 45, 60] as const;
const SLIDER_MIN = 15;
const SLIDER_MAX = 120;
const SLIDER_STEP = 15;
const SUBJECT_META: Record<string, { emoji: string; label: string }> = {
  math:    { emoji: '\uD83D\uDD22', label: 'Math' },
  french:  { emoji: '\uD83D\uDCD6', label: 'French' },
  english: { emoji: '\uD83D\uDDE3\uFE0F', label: 'English' },
  science: { emoji: '\uD83D\uDD2C', label: 'Science' },
  history: { emoji: '\uD83C\uDFDB\uFE0F', label: 'History' },
  art:     { emoji: '\uD83C\uDFA8', label: 'Art' },
};

type ChildProfilesTab = 'all' | 'safety';

interface ChildPatchPayload {
  nickname: string;
  birth_date: string;
  education_stage: string;
  languages: string[];
  avatar: string;
  is_accelerated: boolean;
  is_below_expected_stage: boolean;
}

interface EditChildFormState {
  childId: number;
  nickname: string;
  birthDate: string;
  educationStage: string;
  languages: string[];
  avatar: string;
  isAccelerated: boolean;
  isBelowExpectedStage: boolean;
}

interface SafetyFormState {
  dailyLimitMinutes: number;
  allowedSubjects: string[];
  allowedWeekdays: string[];
  enableVoice: boolean;
  storeAudioHistory: boolean;
}

const toAge = (birthDate?: string): number | null => {
  if (!birthDate) {
    return null;
  }

  const parsed = new Date(birthDate);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const now = new Date();
  let age = now.getFullYear() - parsed.getFullYear();
  const monthDelta = now.getMonth() - parsed.getMonth();

  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < parsed.getDate())) {
    age -= 1;
  }

  return age;
};

const normalizeSafetyForm = (child: ChildRecord | null): SafetyFormState => {
  const settings = child?.settings_json;

  return {
    dailyLimitMinutes: Number(settings?.daily_limit_minutes ?? settings?.dailyLimitMinutes ?? 60),
    allowedSubjects: [...(settings?.allowed_subjects ?? settings?.allowedSubjects ?? SUBJECT_OPTIONS)],
    allowedWeekdays: [...(settings?.allowed_weekdays ?? settings?.allowedWeekdays ?? WEEKDAY_KEYS)],
    enableVoice: Boolean(settings?.enable_voice ?? settings?.enableVoice ?? true),
    storeAudioHistory: Boolean(settings?.store_audio_history ?? settings?.storeAudioHistory ?? false),
  };
};

const ChildProfilesPage = () => {
  const queryClient = useQueryClient();
  const childrenQuery = useChildrenQuery();
  const { activeChild, setActiveChildId } = useActiveChild();

  const [activeTab, setActiveTab] = useState<ChildProfilesTab>('all');
  const [editForm, setEditForm] = useState<EditChildFormState | null>(null);
  const [removeCandidate, setRemoveCandidate] = useState<ChildRecord | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string>('');
  const [safetyForm, setSafetyForm] = useState<SafetyFormState>(normalizeSafetyForm(activeChild));
  const [toastMessage, setToastMessage] = useState<string>('');
  const [isAddChildModalOpen, setIsAddChildModalOpen] = useState<boolean>(false);

  const children = useMemo(() => childrenQuery.data ?? [], [childrenQuery.data]);
  const maxProfilesReached = children.length >= 5;

  useEffect(() => {
    setSafetyForm(normalizeSafetyForm(activeChild));
  }, [activeChild]);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setToastMessage('');
    }, 3000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [toastMessage]);

  const selectedChild = useMemo(() => {
    return children.find((child) => child.child_id === activeChild?.child_id) ?? activeChild;
  }, [activeChild, children]);

  const handleEditOpen = (child: ChildRecord): void => {
    setEditForm({
      childId: child.child_id,
      nickname: child.nickname,
      birthDate: child.birth_date ?? '',
      educationStage: child.education_stage ?? 'PRIMARY',
      languages: child.languages ?? ['en'],
      avatar: child.avatar ?? '🧒',
      isAccelerated: Boolean(child.is_accelerated),
      isBelowExpectedStage: Boolean(child.is_below_expected_stage),
    });
  };

  const toggleTagValue = (values: string[], target: string): string[] => {
    return values.includes(target)
      ? values.filter((value) => value !== target)
      : [...values, target];
  };

  const saveChildEdit = async (): Promise<void> => {
    if (!editForm) {
      return;
    }

    setIsSaving(true);

    try {
      const payload: ChildPatchPayload = {
        nickname: editForm.nickname,
        birth_date: editForm.birthDate,
        education_stage: editForm.educationStage,
        languages: editForm.languages,
        avatar: editForm.avatar,
        is_accelerated: editForm.isAccelerated,
        is_below_expected_stage: editForm.isBelowExpectedStage,
      };

      await apiClient.patch(`/api/v1/children/${editForm.childId}`, {
        body: payload,
      });

      await queryClient.invalidateQueries({ queryKey: queryKeys.children() });
      setEditForm(null);
      setToastMessage(COPY.saveSuccess);
    } catch {
      setToastMessage(COPY.saveFailed);
    } finally {
      setIsSaving(false);
    }
  };

  const removeChild = async (): Promise<void> => {
    if (!removeCandidate) {
      return;
    }

    setIsSaving(true);

    try {
      await apiClient.delete(`/api/v1/children/${removeCandidate.child_id}`);
      await queryClient.invalidateQueries({ queryKey: queryKeys.children() });
      setRemoveCandidate(null);
      setToastMessage(COPY.saveSuccess);
    } catch {
      setToastMessage(COPY.deleteFailed);
    } finally {
      setIsSaving(false);
    }
  };

  /* ─── Safety tab handlers ──────────────────────────────────────────────── */

  const handlePresetClick = useCallback(
    (minutes: number) => {
      setSafetyForm((current) => ({ ...current, dailyLimitMinutes: minutes }));
    },
    []
  );

  const handleSubjectToggle = useCallback(
    (subjectId: string) => {
      setSafetyForm((current) => ({
        ...current,
        allowedSubjects: current.allowedSubjects.includes(subjectId)
          ? current.allowedSubjects.filter((s) => s !== subjectId)
          : [...current.allowedSubjects, subjectId],
      }));
    },
    []
  );

  const handleWeekdayToggle = useCallback(
    (weekday: string) => {
      setSafetyForm((current) => ({
        ...current,
        allowedWeekdays: current.allowedWeekdays.includes(weekday)
          ? current.allowedWeekdays.filter((d) => d !== weekday)
          : [...current.allowedWeekdays, weekday],
      }));
    },
    []
  );

  const saveSafetySettings = async (): Promise<void> => {
    if (!selectedChild) {
      setToastMessage(COPY.noActiveChild);
      return;
    }

    setIsSaving(true);
    setSubmitError('');

    try {
      await apiClient.patch('/api/v1/safety-and-rules', {
        body: {
          childSettings: {
            dailyLimitMinutes: safetyForm.dailyLimitMinutes,
            allowedSubjects: safetyForm.allowedSubjects,
            allowedWeekdays: safetyForm.allowedWeekdays,
            enableVoice: safetyForm.enableVoice,
            storeAudioHistory: safetyForm.storeAudioHistory,
          },
        },
      });

      await queryClient.invalidateQueries({ queryKey: queryKeys.children() });
      setToastMessage(COPY.saveSuccess);
    } catch (err) {
      setToastMessage(COPY.saveFailed);
      setSubmitError(err instanceof Error ? err.message : 'Failed to save safety settings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="pp-content" aria-labelledby="child-profiles-title">
      <article className="pp-card">
        <h1 id="child-profiles-title" className="pp-title">{COPY.title}</h1>

      <div className="pp-tabs">
        <button
          type="button"
          className={`pp-tab pp-touch pp-focusable ${activeTab === 'all' ? 'pp-tab-active' : ''}`}
          aria-label={COPY.tabAll}
          onClick={() => {
            setActiveTab('all');
          }}
        >
          {COPY.tabAll}
        </button>
        <button
          type="button"
          className={`pp-tab pp-touch pp-focusable ${activeTab === 'safety' ? 'pp-tab-active' : ''}`}
          aria-label={COPY.tabSafety}
          onClick={() => {
            setActiveTab('safety');
          }}
        >
          {COPY.tabSafety}
        </button>
      </div>

      {childrenQuery.isLoading ? (
        <div className="pp-skeleton" style={{ marginTop: '0.8rem', height: 220 }} aria-label={COPY.loading} />
      ) : childrenQuery.error ? (
        <div role="alert" style={{ marginTop: '0.8rem' }}>
          <p className="pp-error">
            {childrenQuery.error.isAuthError && childrenQuery.error.status === 403
              ? 'Access denied.'
              : childrenQuery.error.message}
          </p>
          {!childrenQuery.error.isAuthError && (
            <button
              type="button"
              className="pp-button pp-touch pp-focusable"
              aria-label={COPY.retry}
              disabled={childrenQuery.isFetching}
              onClick={() => {
                void childrenQuery.refetch();
              }}
            >
              {childrenQuery.isFetching ? `${COPY.retry}...` : COPY.retry}
            </button>
          )}
        </div>
      ) : activeTab === 'all' ? (
        <div className="pp-grid-two">
          {children.length === 0 ? (
            <article className="pp-empty">{COPY.noChildren}</article>
          ) : (
            children.map((child) => {
              const childAge = child.age ?? toAge(child.birth_date);
              const dailyLimit = child.settings_json?.daily_limit_minutes ?? child.settings_json?.dailyLimitMinutes ?? 60;
              const voiceEnabled = child.settings_json?.enable_voice ?? child.settings_json?.enableVoice ?? false;
              const subjectCount = (child.settings_json?.allowed_subjects ?? child.settings_json?.allowedSubjects ?? []).length;

              return (
                <div key={child.child_id} className="pp-card pp-profile-card">
                  <header className="pp-profile-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span className="pp-avatar-lg" aria-hidden="true">{child.avatar ?? '🧒'}</span>
                      <div>
                        <p style={{ fontWeight: 700 }}>{child.nickname}</p>
                        <p style={{ color: 'var(--pp-muted)' }}>
                          {childAge ?? '—'} yrs • {child.education_stage ?? 'Unknown stage'}
                        </p>
                      </div>
                    </div>
                    <span className={`pp-pill ${child.is_active ? 'pill-green' : 'pill-gray'}`}>
                      {child.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </header>

                  <div className="pp-limit-pills">
                    <span className="pp-pill pill-gray">{dailyLimit} min/day</span>
                    <span className="pp-pill pill-gray">Voice {voiceEnabled ? 'On' : 'Off'}</span>
                    <span className="pp-pill pill-gray">{subjectCount} subjects</span>
                  </div>

                  <div className="pp-profile-actions">
                    <button
                      type="button"
                      className="pp-button pp-touch pp-focusable"
                      aria-label={`${COPY.edit} ${child.nickname}`}
                      onClick={() => {
                        handleEditOpen(child);
                      }}
                    >
                      {COPY.edit}
                    </button>
                    <button
                      type="button"
                      className="pp-button pp-touch pp-focusable"
                      aria-label={`${COPY.setLimits} ${child.nickname}`}
                      onClick={() => {
                        setActiveChildId(child.child_id);
                        setActiveTab('safety');
                      }}
                    >
                      {COPY.setLimits}
                    </button>
                    <button
                      type="button"
                      className="pp-button pp-touch pp-focusable"
                      aria-label={`${COPY.remove} ${child.nickname}`}
                      onClick={() => {
                        setRemoveCandidate(child);
                      }}
                    >
                      {COPY.remove}
                    </button>
                  </div>
                </div>
              );
            })
          )}

          <div className="pp-card pp-profile-card" title={maxProfilesReached ? COPY.maxReached : COPY.addChild}>
            <h2 className="pp-title">{COPY.addChild}</h2>
            <p style={{ color: 'var(--pp-muted)' }}>
              {maxProfilesReached ? COPY.maxReached : COPY.addFirstChild}
            </p>
            {maxProfilesReached ? (
              <button
                type="button"
                className="pp-button pp-touch"
                disabled
                aria-label={COPY.maxReached}
              >
                {COPY.maxReached}
              </button>
            ) : (
              <button
                type="button"
                className="pp-button pp-button-primary pp-touch pp-focusable"
                aria-label={COPY.addChild}
                onClick={() => setIsAddChildModalOpen(true)}
              >
                {COPY.addChild}
              </button>
            )}
          </div>
        </div>
      ) : !selectedChild ? (
        <p className="pp-empty">{COPY.noActiveChild}</p>
      ) : (
        <form
          className="pp-safety-form"
          onSubmit={(event) => {
            event.preventDefault();
            void saveSafetySettings();
          }}
        >
          {/* Daily Limit Section */}
          <div className="pp-safety-section">
            <span className="pp-safety-section-label">{COPY.dailyLimit}</span>
            <div className="pp-safety-slider" style={{ '--safety-slider-fill': `${((safetyForm.dailyLimitMinutes - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100}%` } as React.CSSProperties}>
              <input
                id="daily-limit-slider"
                type="range"
                min={SLIDER_MIN}
                max={SLIDER_MAX}
                step={SLIDER_STEP}
                aria-label={COPY.dailyLimit}
                aria-valuetext={`${safetyForm.dailyLimitMinutes} min`}
                value={safetyForm.dailyLimitMinutes}
                onChange={(event) => {
                  const value = Number(event.currentTarget.value);
                  setSafetyForm((current) => ({
                    ...current,
                    dailyLimitMinutes: value,
                  }));
                }}
              />
              <span className="pp-safety-slider-value">{safetyForm.dailyLimitMinutes} min</span>
            </div>
            <div className="pp-safety-presets">
              {PRESET_MINUTES.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  className={`pp-safety-preset pp-touch pp-focusable ${safetyForm.dailyLimitMinutes === minutes ? 'pp-safety-preset-active' : ''}`}
                  aria-pressed={safetyForm.dailyLimitMinutes === minutes}
                  onClick={() => handlePresetClick(minutes)}
                >
                  {minutes} min
                </button>
              ))}
            </div>

            <span className="pp-safety-section-label" style={{ marginTop: '0.75rem' }}>{COPY.allowedWeekdays}</span>
            <div className="pp-safety-chips" role="group" aria-label={COPY.allowedWeekdays}>
              {WEEKDAY_LABELS.map((dayLabel, index) => {
                const weekdayKey = WEEKDAY_KEYS[index];
                const isActive = safetyForm.allowedWeekdays.includes(weekdayKey);
                return (
                  <button
                    key={weekdayKey}
                    type="button"
                    className={`pp-safety-chip pp-touch pp-focusable ${isActive ? 'pp-safety-chip-active' : ''}`}
                    aria-pressed={isActive}
                    onClick={() => handleWeekdayToggle(weekdayKey)}
                  >
                    {dayLabel}
                  </button>
                );
              })}
            </div>
          </div>

          <hr className="pp-safety-divider" />

          {/* Subjects Section */}
          <div className="pp-safety-section">
            <span className="pp-safety-section-label">{COPY.allowedSubjects}</span>
            <div className="pp-safety-chips" role="group" aria-label={COPY.allowedSubjects}>
              {SUBJECT_OPTIONS.map((subjectId) => {
                const meta = SUBJECT_META[subjectId];
                const isActive = safetyForm.allowedSubjects.includes(subjectId);
                return (
                  <button
                    key={subjectId}
                    type="button"
                    className={`pp-safety-chip pp-touch pp-focusable ${isActive ? 'pp-safety-chip-active' : ''}`}
                    aria-pressed={isActive}
                    onClick={() => handleSubjectToggle(subjectId)}
                  >
                    <span aria-hidden="true">{meta?.emoji}</span>
                    <span>{meta?.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <hr className="pp-safety-divider" />

          {/* Voice Section */}
          <div className="pp-safety-section">
            <div className="pp-safety-toggle">
              <div className="pp-safety-toggle-label">
                <span className="pp-safety-toggle-text">{COPY.voiceEnabled}</span>
              </div>
              <ModernSwitch
                checked={safetyForm.enableVoice}
                onChange={() => {
                  setSafetyForm((current) => {
                    const next = !current.enableVoice;
                    return { ...current, enableVoice: next, storeAudioHistory: next ? current.storeAudioHistory : false };
                  });
                }}
                ariaLabel={COPY.voiceEnabled}
              />
            </div>

            {safetyForm.enableVoice && (
              <div className="pp-safety-toggle">
                <div className="pp-safety-toggle-label">
                  <span className="pp-safety-toggle-text">{COPY.storeAudio}</span>
                </div>
                <ModernSwitch
                  checked={safetyForm.storeAudioHistory}
                  onChange={() => {
                    setSafetyForm((current) => ({ ...current, storeAudioHistory: !current.storeAudioHistory }));
                  }}
                  ariaLabel={COPY.storeAudio}
                />
              </div>
            )}
          </div>

          <hr className="pp-safety-divider" />

          {submitError && (
            <p className="pp-safety-error" role="alert">{submitError}</p>
          )}

          <button
            type="submit"
            className="pp-button pp-button-primary pp-touch pp-focusable pp-safety-save"
            aria-label={COPY.save}
            disabled={isSaving}
          >
            {isSaving ? `${COPY.save}...` : COPY.save}
          </button>
        </form>
      )}

      {editForm && (
        <div className="pp-sheet-backdrop" role="dialog" aria-modal="true" aria-label="Edit child profile" onClick={() => { setEditForm(null); }}>
          <aside className="pp-sheet" onClick={(e) => e.stopPropagation()}>
            <h2 className="pp-title" style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>{COPY.edit}</h2>
            <p style={{ fontSize: '.875rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>Update your child profile details.</p>

            <form
              className="pp-form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                void saveChildEdit();
              }}
              style={{ marginTop: '1.5rem' }}
            >
              {/* Nickname */}
              <div className="pp-form-row">
                <label htmlFor="edit-child-nickname" style={{ fontSize: '.875rem', fontWeight: 600 }}>Nickname</label>
                <input
                  id="edit-child-nickname"
                  value={editForm.nickname}
                  placeholder="Enter nickname"
                  aria-label="Nickname"
                  onChange={(event) => {
                    const nickname = event.currentTarget.value;
                    setEditForm((current) => current ? { ...current, nickname } : current);
                  }}
                />
              </div>

              {/* Birth date */}
              <div className="pp-form-row">
                <label htmlFor="edit-child-birth-date" style={{ fontSize: '.875rem', fontWeight: 600 }}>Birth date</label>
                <input
                  id="edit-child-birth-date"
                  type="date"
                  value={editForm.birthDate}
                  aria-label="Birth date"
                  onChange={(event) => {
                    const birthDate = event.currentTarget.value;
                    setEditForm((current) => current ? { ...current, birthDate } : current);
                  }}
                />
              </div>

              {/* Education stage */}
              <div className="pp-form-row">
                <label htmlFor="edit-child-education-stage" style={{ fontSize: '.875rem', fontWeight: 600 }}>Education stage</label>
                <select
                  id="edit-child-education-stage"
                  value={editForm.educationStage}
                  aria-label="Education stage"
                  onChange={(event) => {
                    const educationStage = event.currentTarget.value;
                    setEditForm((current) => current ? { ...current, educationStage } : current);
                  }}
                >
                  <option value="KINDERGARTEN">Kindergarten</option>
                  <option value="PRIMARY">Primary</option>
                  <option value="SECONDARY">Secondary</option>
                </select>
              </div>

              {/* Divider */}
              <hr style={{ border: 'none', borderTop: '1px dashed var(--border-subtle)', margin: '1.25rem 0' }} />

              {/* Languages */}
              <fieldset className="pp-form-row" style={{ border: 'none', margin: 0, padding: 0 }}>
                <legend style={{ fontSize: '.875rem', fontWeight: 600, marginBottom: '.5rem' }}>Languages</legend>
                <div className="pp-tabs">
                  {LANGUAGE_OPTIONS.map((language) => {
                    const selected = editForm.languages.includes(language);
                    return (
                      <button
                        key={language}
                        type="button"
                        className={`pp-tab pp-touch pp-focusable ${selected ? 'pp-tab-active' : ''}`}
                        aria-label={`Toggle ${language}`}
                        onClick={() => {
                          setEditForm((current) => current ? { ...current, languages: toggleTagValue(current.languages, language) } : current);
                        }}
                      >
                        {language.toUpperCase()}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {/* Avatar */}
              <fieldset className="pp-form-row" style={{ border: 'none', margin: 0, padding: 0 }}>
                <legend style={{ fontSize: '.875rem', fontWeight: 600, marginBottom: '.5rem' }}>Avatar</legend>
                <div className="pp-tabs">
                  {AVATAR_OPTIONS.map((avatar) => (
                    <button
                      key={avatar}
                      type="button"
                      className={`pp-tab pp-touch pp-focusable ${editForm.avatar === avatar ? 'pp-tab-active' : ''}`}
                      aria-label={`Select avatar ${avatar}`}
                      onClick={() => {
                        setEditForm((current) => current ? { ...current, avatar } : current);
                      }}
                    >
                      {avatar}
                    </button>
                  ))}
                </div>
              </fieldset>

              {/* Divider */}
              <hr style={{ border: 'none', borderTop: '1px dashed var(--border-subtle)', margin: '1.25rem 0' }} />

              {/* Stage toggles — mutually exclusive */}
              <div className="pp-form-row" style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '.875rem', fontWeight: 600 }}>Accelerated stage</span>
                  <ModernSwitch
                    checked={editForm.isAccelerated}
                    onChange={() => {
                      setEditForm((current) => current ? {
                        ...current,
                        isAccelerated: !current.isAccelerated,
                        isBelowExpectedStage: false,
                      } : current);
                    }}
                    ariaLabel="Toggle accelerated stage"
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '.875rem', fontWeight: 600 }}>Below expected stage</span>
                  <ModernSwitch
                    checked={editForm.isBelowExpectedStage}
                    onChange={() => {
                      setEditForm((current) => current ? {
                        ...current,
                        isBelowExpectedStage: !current.isBelowExpectedStage,
                        isAccelerated: false,
                      } : current);
                    }}
                    ariaLabel="Toggle below expected stage"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="pp-topbar-actions" style={{ marginTop: '1.25rem' }}>
                <button
                  type="button"
                  className="pp-button pp-touch pp-focusable"
                  aria-label={COPY.cancel}
                  onClick={() => {
                    setEditForm(null);
                  }}
                >
                  {COPY.cancel}
                </button>
                <button
                  type="submit"
                  className="pp-button pp-button-primary pp-touch pp-focusable"
                  aria-label={COPY.save}
                  disabled={isSaving}
                >
                  {isSaving ? `${COPY.save}...` : COPY.save}
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}

      {removeCandidate && (
        <div className="pp-dialog-backdrop" role="dialog" aria-modal="true" aria-label={COPY.deleteTitle}>
          <div className="pp-dialog">
            <h2 className="pp-title">{COPY.deleteTitle}</h2>
            <p>{COPY.deleteDescription}</p>
            <p><strong>{removeCandidate.nickname}</strong></p>
            <div className="pp-topbar-actions">
              <button
                type="button"
                className="pp-button pp-touch pp-focusable"
                aria-label={COPY.cancel}
                onClick={() => {
                  setRemoveCandidate(null);
                }}
              >
                {COPY.cancel}
              </button>
              <button
                type="button"
                className="pp-button pp-button-primary pp-touch pp-focusable"
                aria-label={COPY.deleteConfirm}
                disabled={isSaving}
                onClick={() => {
                  void removeChild();
                }}
              >
                {isSaving ? `${COPY.deleteConfirm}...` : COPY.deleteConfirm}
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="pp-toast" role="status" aria-live="polite">
          <div className="pp-toast-card">{toastMessage}</div>
        </div>
      )}

      <AddChildModal
        isOpen={isAddChildModalOpen}
        onClose={() => setIsAddChildModalOpen(false)}
        onSuccess={() => {
          setToastMessage('Child profile created successfully');
        }}
      />
      </article>
    </main>
  );
};

export default ChildProfilesPage;
