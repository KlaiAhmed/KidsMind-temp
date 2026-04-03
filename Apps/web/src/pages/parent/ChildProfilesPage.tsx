import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useChildrenQuery } from '../../hooks/api/useChildrenQuery';
import type { ChildRecord } from '../../hooks/api/useChildrenQuery';
import { apiClient } from '../../lib/api';
import { queryKeys } from '../../lib/queryKeys';
import { useActiveChild } from '../../hooks/useActiveChild';
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
  parentPin: 'Parent PIN',
  changePinHint: 'Change PIN (4 digits)',
  noActiveChild: 'Select a child profile to edit safety rules.',
  retry: 'Retry',
} as const;

const SUBJECT_OPTIONS = ['math', 'english', 'french', 'science', 'history', 'art'] as const;
const WEEKDAY_OPTIONS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const WEEKDAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const AVATAR_OPTIONS = ['🦁', '🐼', '🦊', '🐯', '🐬', '🦄', '🐻', '🐙', '🦉', '🦖', '🐢', '🐝'] as const;
const LANGUAGE_OPTIONS = ['en', 'fr', 'es', 'it', 'ar', 'ch'] as const;

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
  parentPin: string;
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
    parentPin: '',
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
  const [safetyForm, setSafetyForm] = useState<SafetyFormState>(normalizeSafetyForm(activeChild));
  const [toastMessage, setToastMessage] = useState<string>('');

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

  const saveSafetySettings = async (): Promise<void> => {
    if (!selectedChild) {
      setToastMessage(COPY.noActiveChild);
      return;
    }

    setIsSaving(true);

    try {
      await apiClient.patch('/api/v1/safety-and-rules', {
        body: {
          child_id: selectedChild.child_id,
          childSettings: {
            dailyLimitMinutes: safetyForm.dailyLimitMinutes,
            allowedSubjects: safetyForm.allowedSubjects,
            allowedWeekdays: safetyForm.allowedWeekdays,
            enableVoice: safetyForm.enableVoice,
            storeAudioHistory: safetyForm.storeAudioHistory,
          },
          parentPin: safetyForm.parentPin || undefined,
        },
      });

      await queryClient.invalidateQueries({ queryKey: queryKeys.children() });
      setToastMessage(COPY.saveSuccess);
    } catch {
      setToastMessage(COPY.saveFailed);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="pp-content" aria-labelledby="child-profiles-title">
      <article className="pp-card">
        <h1 id="child-profiles-title" className="pp-title">{COPY.title}</h1>

        <div className="pp-tabs" style={{ marginTop: '0.75rem' }}>
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
          <div className="pp-grid-two" style={{ marginTop: '0.8rem' }}>
            {children.length === 0 ? (
              <article className="pp-empty">{COPY.noChildren}</article>
            ) : (
              children.map((child) => {
                const childAge = child.age ?? toAge(child.birth_date);
                const dailyLimit = child.settings_json?.daily_limit_minutes ?? child.settings_json?.dailyLimitMinutes ?? 60;
                const voiceEnabled = child.settings_json?.enable_voice ?? child.settings_json?.enableVoice ?? false;
                const subjectCount = (child.settings_json?.allowed_subjects ?? child.settings_json?.allowedSubjects ?? []).length;

                return (
                  <article key={child.child_id} className="pp-card pp-profile-card">
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
                  </article>
                );
              })
            )}

            <article className="pp-card pp-profile-card" title={maxProfilesReached ? COPY.maxReached : COPY.addChild}>
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
                <Link
                  to="/parent/children/new"
                  className="pp-button pp-button-primary pp-touch pp-focusable"
                  aria-label={COPY.addChild}
                >
                  {COPY.addChild}
                </Link>
              )}
            </article>
          </div>
        ) : !selectedChild ? (
          <p className="pp-empty" style={{ marginTop: '0.8rem' }}>{COPY.noActiveChild}</p>
        ) : (
          <form
            className="pp-form-grid"
            style={{ marginTop: '0.8rem' }}
            onSubmit={(event) => {
              event.preventDefault();
              void saveSafetySettings();
            }}
          >
            <div className="pp-form-row">
              <label htmlFor="daily-limit-slider">{COPY.dailyLimit}</label>
              <input
                id="daily-limit-slider"
                type="range"
                min={15}
                max={120}
                step={15}
                aria-label={COPY.dailyLimit}
                value={safetyForm.dailyLimitMinutes}
                onChange={(event) => {
                  setSafetyForm((current) => ({
                    ...current,
                    dailyLimitMinutes: Number(event.currentTarget.value),
                  }));
                }}
              />
              <p>{safetyForm.dailyLimitMinutes} min</p>
            </div>

            <fieldset className="pp-form-row">
              <legend>{COPY.allowedSubjects}</legend>
              <div className="pp-checkbox-grid">
                {SUBJECT_OPTIONS.map((subject) => (
                  <label key={subject} className="pp-button pp-touch pp-focusable">
                    <input
                      type="checkbox"
                      checked={safetyForm.allowedSubjects.includes(subject)}
                      aria-label={`Allow ${subject}`}
                      onChange={() => {
                        setSafetyForm((current) => ({
                          ...current,
                          allowedSubjects: toggleTagValue(current.allowedSubjects, subject),
                        }));
                      }}
                    />
                    <span style={{ marginLeft: '0.4rem' }}>{subject}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="pp-form-row">
              <legend>{COPY.allowedWeekdays}</legend>
              <div className="pp-tabs">
                {WEEKDAY_OPTIONS.map((dayLabel, index) => {
                  const weekdayKey = WEEKDAY_KEYS[index];
                  const isSelected = safetyForm.allowedWeekdays.includes(weekdayKey);

                  return (
                    <button
                      key={weekdayKey}
                      type="button"
                      className={`pp-tab pp-touch pp-focusable ${isSelected ? 'pp-tab-active' : ''}`}
                      aria-label={`Toggle ${dayLabel}`}
                      onClick={() => {
                        setSafetyForm((current) => ({
                          ...current,
                          allowedWeekdays: toggleTagValue(current.allowedWeekdays, weekdayKey),
                        }));
                      }}
                    >
                      {dayLabel}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="pp-toggle-row">
              <span>{COPY.voiceEnabled}</span>
              <button
                type="button"
                className={`pp-switch pp-touch pp-focusable ${safetyForm.enableVoice ? 'pp-switch-on' : ''}`}
                aria-label={COPY.voiceEnabled}
                onClick={() => {
                  setSafetyForm((current) => ({
                    ...current,
                    enableVoice: !current.enableVoice,
                  }));
                }}
              />
            </div>

            <div className="pp-toggle-row">
              <span>{COPY.storeAudio}</span>
              <button
                type="button"
                className={`pp-switch pp-touch pp-focusable ${safetyForm.storeAudioHistory ? 'pp-switch-on' : ''}`}
                aria-label={COPY.storeAudio}
                onClick={() => {
                  setSafetyForm((current) => ({
                    ...current,
                    storeAudioHistory: !current.storeAudioHistory,
                  }));
                }}
              />
            </div>

            <div className="pp-form-row">
              <label htmlFor="parent-pin-input">{COPY.parentPin}</label>
              <input
                id="parent-pin-input"
                type="password"
                maxLength={4}
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder={COPY.changePinHint}
                aria-label={COPY.parentPin}
                value={safetyForm.parentPin}
                onChange={(event) => {
                  setSafetyForm((current) => ({
                    ...current,
                    parentPin: event.currentTarget.value.replace(/\D/g, '').slice(0, 4),
                  }));
                }}
              />
            </div>

            <button
              type="submit"
              className="pp-button pp-button-primary pp-touch pp-focusable"
              aria-label={COPY.save}
              disabled={isSaving}
            >
              {isSaving ? `${COPY.save}...` : COPY.save}
            </button>
          </form>
        )}
      </article>

      {editForm && (
        <div className="pp-sheet-backdrop" role="dialog" aria-modal="true" aria-label="Edit child profile">
          <aside className="pp-sheet">
            <h2 className="pp-title">{COPY.edit}</h2>

            <form
              className="pp-form-grid"
              onSubmit={(event) => {
                event.preventDefault();
                void saveChildEdit();
              }}
            >
              <div className="pp-form-row">
                <label htmlFor="edit-child-nickname">Nickname</label>
                <input
                  id="edit-child-nickname"
                  value={editForm.nickname}
                  aria-label="Nickname"
                  onChange={(event) => {
                    setEditForm((current) => current ? {
                      ...current,
                      nickname: event.currentTarget.value,
                    } : current);
                  }}
                />
              </div>

              <div className="pp-form-row">
                <label htmlFor="edit-child-birth-date">Birth date</label>
                <input
                  id="edit-child-birth-date"
                  type="date"
                  value={editForm.birthDate}
                  aria-label="Birth date"
                  onChange={(event) => {
                    setEditForm((current) => current ? {
                      ...current,
                      birthDate: event.currentTarget.value,
                    } : current);
                  }}
                />
              </div>

              <div className="pp-form-row">
                <label htmlFor="edit-child-education-stage">Education stage</label>
                <select
                  id="edit-child-education-stage"
                  value={editForm.educationStage}
                  aria-label="Education stage"
                  onChange={(event) => {
                    setEditForm((current) => current ? {
                      ...current,
                      educationStage: event.currentTarget.value,
                    } : current);
                  }}
                >
                  <option value="KINDERGARTEN">Kindergarten</option>
                  <option value="PRIMARY">Primary</option>
                  <option value="SECONDARY">Secondary</option>
                </select>
              </div>

              <fieldset className="pp-form-row">
                <legend>Languages</legend>
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
                          setEditForm((current) => current ? {
                            ...current,
                            languages: toggleTagValue(current.languages, language),
                          } : current);
                        }}
                      >
                        {language.toUpperCase()}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset className="pp-form-row">
                <legend>Avatar</legend>
                <div className="pp-tabs">
                  {AVATAR_OPTIONS.map((avatar) => (
                    <button
                      key={avatar}
                      type="button"
                      className={`pp-tab pp-touch pp-focusable ${editForm.avatar === avatar ? 'pp-tab-active' : ''}`}
                      aria-label={`Select avatar ${avatar}`}
                      onClick={() => {
                        setEditForm((current) => current ? {
                          ...current,
                          avatar,
                        } : current);
                      }}
                    >
                      {avatar}
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="pp-toggle-row">
                <span>Accelerated stage</span>
                <button
                  type="button"
                  className={`pp-switch pp-touch pp-focusable ${editForm.isAccelerated ? 'pp-switch-on' : ''}`}
                  aria-label="Toggle accelerated"
                  onClick={() => {
                    setEditForm((current) => current ? {
                      ...current,
                      isAccelerated: !current.isAccelerated,
                    } : current);
                  }}
                />
              </div>

              <div className="pp-toggle-row">
                <span>Below expected stage</span>
                <button
                  type="button"
                  className={`pp-switch pp-touch pp-focusable ${editForm.isBelowExpectedStage ? 'pp-switch-on' : ''}`}
                  aria-label="Toggle below expected stage"
                  onClick={() => {
                    setEditForm((current) => current ? {
                      ...current,
                      isBelowExpectedStage: !current.isBelowExpectedStage,
                    } : current);
                  }}
                />
              </div>

              <div className="pp-topbar-actions">
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
    </main>
  );
};

export default ChildProfilesPage;
