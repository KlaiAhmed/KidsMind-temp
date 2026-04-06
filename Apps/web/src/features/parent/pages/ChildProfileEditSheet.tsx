import ModernSwitch from '../../../components/ui/ModernSwitch/ModernSwitch';
import type { EditChildFormState } from './childProfilesData';

interface ChildProfileEditSheetProps {
  editForm: EditChildFormState;
  languageOptions: readonly string[];
  avatarOptions: readonly string[];
  isSaving: boolean;
  saveLabel: string;
  cancelLabel: string;
  editLabel: string;
  onClose: () => void;
  onSave: () => void;
  onUpdateForm: (updater: (current: EditChildFormState) => EditChildFormState) => void;
}

const toggleTagValue = (values: string[], target: string): string[] => {
  return values.includes(target)
    ? values.filter((value) => value !== target)
    : [...values, target];
};

const ChildProfileEditSheet = ({
  editForm,
  languageOptions,
  avatarOptions,
  isSaving,
  saveLabel,
  cancelLabel,
  editLabel,
  onClose,
  onSave,
  onUpdateForm,
}: ChildProfileEditSheetProps) => {
  return (
    <div className="pp-sheet-backdrop" role="dialog" aria-modal="true" aria-label="Edit child profile" onClick={onClose}>
      <aside className="pp-sheet" onClick={(e) => e.stopPropagation()}>
        <h2 className="pp-title" style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>{editLabel}</h2>
        <p style={{ fontSize: '.875rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>Update your child profile details.</p>

        <form
          className="pp-form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
          style={{ marginTop: '1.5rem' }}
        >
          <div className="pp-form-row">
            <label htmlFor="edit-child-nickname" style={{ fontSize: '.875rem', fontWeight: 600 }}>Nickname</label>
            <input
              id="edit-child-nickname"
              value={editForm.nickname}
              placeholder="Enter nickname"
              aria-label="Nickname"
              onChange={(event) => {
                const nickname = event.currentTarget.value;
                onUpdateForm((current) => ({ ...current, nickname }));
              }}
            />
          </div>

          <div className="pp-form-row">
            <label htmlFor="edit-child-birth-date" style={{ fontSize: '.875rem', fontWeight: 600 }}>Birth date</label>
            <input
              id="edit-child-birth-date"
              type="date"
              value={editForm.birthDate}
              aria-label="Birth date"
              onChange={(event) => {
                const birthDate = event.currentTarget.value;
                onUpdateForm((current) => ({ ...current, birthDate }));
              }}
            />
          </div>

          <div className="pp-form-row">
            <label htmlFor="edit-child-education-stage" style={{ fontSize: '.875rem', fontWeight: 600 }}>Education stage</label>
            <select
              id="edit-child-education-stage"
              value={editForm.educationStage}
              aria-label="Education stage"
              onChange={(event) => {
                const educationStage = event.currentTarget.value;
                onUpdateForm((current) => ({ ...current, educationStage }));
              }}
            >
              <option value="KINDERGARTEN">Kindergarten</option>
              <option value="PRIMARY">Primary</option>
              <option value="SECONDARY">Secondary</option>
            </select>
          </div>

          <hr style={{ border: 'none', borderTop: '1px dashed var(--border-subtle)', margin: '1.25rem 0' }} />

          <fieldset className="pp-form-row" style={{ border: 'none', margin: 0, padding: 0 }}>
            <legend style={{ fontSize: '.875rem', fontWeight: 600, marginBottom: '.5rem' }}>Languages</legend>
            <div className="pp-tabs">
              {languageOptions.map((language) => {
                const selected = editForm.languages.includes(language);
                return (
                  <button
                    key={language}
                    type="button"
                    className={`pp-tab pp-touch pp-focusable ${selected ? 'pp-tab-active' : ''}`}
                    aria-label={`Toggle ${language}`}
                    onClick={() => {
                      onUpdateForm((current) => ({
                        ...current,
                        languages: toggleTagValue(current.languages, language),
                      }));
                    }}
                  >
                    {language.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="pp-form-row" style={{ border: 'none', margin: 0, padding: 0 }}>
            <legend style={{ fontSize: '.875rem', fontWeight: 600, marginBottom: '.5rem' }}>Avatar</legend>
            <div className="pp-tabs">
              {avatarOptions.map((avatar) => (
                <button
                  key={avatar}
                  type="button"
                  className={`pp-tab pp-touch pp-focusable ${editForm.avatar === avatar ? 'pp-tab-active' : ''}`}
                  aria-label={`Select avatar ${avatar}`}
                  onClick={() => {
                    onUpdateForm((current) => ({ ...current, avatar }));
                  }}
                >
                  {avatar}
                </button>
              ))}
            </div>
          </fieldset>

          <hr style={{ border: 'none', borderTop: '1px dashed var(--border-subtle)', margin: '1.25rem 0' }} />

          <div className="pp-form-row" style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '.875rem', fontWeight: 600 }}>Accelerated stage</span>
              <ModernSwitch
                checked={editForm.isAccelerated}
                onChange={() => {
                  onUpdateForm((current) => ({
                    ...current,
                    isAccelerated: !current.isAccelerated,
                    isBelowExpectedStage: false,
                  }));
                }}
                ariaLabel="Toggle accelerated stage"
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '.875rem', fontWeight: 600 }}>Below expected stage</span>
              <ModernSwitch
                checked={editForm.isBelowExpectedStage}
                onChange={() => {
                  onUpdateForm((current) => ({
                    ...current,
                    isBelowExpectedStage: !current.isBelowExpectedStage,
                    isAccelerated: false,
                  }));
                }}
                ariaLabel="Toggle below expected stage"
              />
            </div>
          </div>

          <div className="pp-topbar-actions" style={{ marginTop: '1.25rem' }}>
            <button
              type="button"
              className="pp-button pp-touch pp-focusable"
              aria-label={cancelLabel}
              onClick={onClose}
            >
              {cancelLabel}
            </button>
            <button
              type="submit"
              className="pp-button pp-button-primary pp-touch pp-focusable"
              aria-label={saveLabel}
              disabled={isSaving}
            >
              {isSaving ? `${saveLabel}...` : saveLabel}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
};

export default ChildProfileEditSheet;
