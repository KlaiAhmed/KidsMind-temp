import { useEffect, useMemo, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useChildrenQuery, type ChildRecord } from '../api';
import { AddChildModal } from '../components';
import { useActiveChild } from '../hooks';
import { apiClient } from '../../../lib/api';
import { queryKeys } from '../../../lib/queryKeys';
import ModernSwitch from '../../../components/ui/ModernSwitch/ModernSwitch';
import ChildProfileEditSheet from './ChildProfileEditSheet';
import RemoveChildDialog from './RemoveChildDialog';
import { COPY, SUBJECT_OPTIONS, WEEKDAY_KEYS, WEEKDAY_LABELS, AVATAR_OPTIONS, LANGUAGE_OPTIONS, PRESET_MINUTES, SLIDER_MIN, SLIDER_MAX, SLIDER_STEP, SUBJECT_META, type ChildProfilesTab, type ChildPatchPayload, type EditChildFormState, type SafetyFormState, toAge, normalizeSafetyForm } from './childProfilesData';
import '../../../styles/parent-portal.css';
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
        <ChildProfileEditSheet
          editForm={editForm}
          languageOptions={LANGUAGE_OPTIONS}
          avatarOptions={AVATAR_OPTIONS}
          isSaving={isSaving}
          saveLabel={COPY.save}
          cancelLabel={COPY.cancel}
          editLabel={COPY.edit}
          onClose={() => {
            setEditForm(null);
          }}
          onSave={() => {
            void saveChildEdit();
          }}
          onUpdateForm={(updater) => {
            setEditForm((current) => {
              if (!current) {
                return current;
              }
              return updater(current);
            });
          }}
        />
      )}
      {removeCandidate && (
        <RemoveChildDialog
          title={COPY.deleteTitle}
          description={COPY.deleteDescription}
          candidateName={removeCandidate.nickname}
          cancelLabel={COPY.cancel}
          confirmLabel={COPY.deleteConfirm}
          isSaving={isSaving}
          onCancel={() => {
            setRemoveCandidate(null);
          }}
          onConfirm={() => {
            void removeChild();
          }}
        />
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
