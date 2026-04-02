import { useEffect, useMemo, useRef, useState } from 'react';
import { useCurrentUser } from '../../hooks/api/useCurrentUser';
import { usePatchSettings } from '../../hooks/api/usePatchSettings';
import { getCountryOptions } from '../../utils/countries';
import '../../styles/parent-portal.css';

const COPY = {
  title: 'Profile',
  cancel: 'Cancel',
  save: 'Save changes',
  loading: 'Loading profile...',
  saved: 'Profile updated',
  saveFailed: 'Could not update profile.',
  changeEmail: 'Change email',
  profileUnsaved: 'You have unsaved profile changes.',
  countryLabel: 'Country',
  countrySearchPlaceholder: 'Search country...',
  countrySearchHint: 'Type to search, then select from the list',
  defaultLanguage: 'Default language',
} as const;

interface ProfileFormState {
  username: string;
  email: string;
  country: string;
  defaultLanguage: string;
}

const ProfilePage = () => {
  const userQuery = useCurrentUser();
  const patchSettings = usePatchSettings();

  const [toastMessage, setToastMessage] = useState<string>('');
  const [profileDraft, setProfileDraft] = useState<ProfileFormState | null>(null);

  // Country selector state
  const [countrySearch, setCountrySearch] = useState<string>('');
  const [isCountryListOpen, setIsCountryListOpen] = useState<boolean>(false);
  const countrySelectorRef = useRef<HTMLDivElement | null>(null);

  const countryOptions = useMemo(() => getCountryOptions('en'), []);

  const baseProfileForm = useMemo<ProfileFormState>(() => {
    return {
      username: userQuery.data?.username ?? '',
      email: userQuery.data?.email ?? '',
      country: userQuery.data?.settings?.country ?? '',
      defaultLanguage: userQuery.data?.settings?.default_language ?? userQuery.data?.settings?.defaultLanguage ?? 'en',
    };
  }, [userQuery.data]);

  const profileForm = profileDraft ?? baseProfileForm;
  const initialProfileSnapshot = useMemo(() => JSON.stringify(baseProfileForm), [baseProfileForm]);

  const updateProfileForm = (updater: (current: ProfileFormState) => ProfileFormState): void => {
    setProfileDraft((current) => {
      const source = current ?? baseProfileForm;
      return updater(source);
    });
  };

  // Filter country options based on search
  const filteredCountryOptions = useMemo(() => {
    const normalizedSearch = countrySearch.trim().toUpperCase();
    if (!normalizedSearch) {
      return countryOptions;
    }
    return countryOptions.filter(
      (country) =>
        country.value.includes(normalizedSearch) ||
        country.label.toUpperCase().includes(normalizedSearch)
    );
  }, [countryOptions, countrySearch]);

  // Close country dropdown on outside click
  useEffect(() => {
    const onDocumentMouseDown = (event: MouseEvent): void => {
      if (countrySelectorRef.current && !countrySelectorRef.current.contains(event.target as Node)) {
        setIsCountryListOpen(false);
      }
    };

    document.addEventListener('mousedown', onDocumentMouseDown);
    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown);
    };
  }, []);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setToastMessage('');
    }, 2800);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [toastMessage]);

  const isProfileDirty = useMemo(() => {
    return initialProfileSnapshot !== '' && JSON.stringify(profileForm) !== initialProfileSnapshot;
  }, [initialProfileSnapshot, profileForm]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (!isProfileDirty) {
        return;
      }

      event.preventDefault();
      event.returnValue = COPY.profileUnsaved;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isProfileDirty]);

  const saveProfile = async (): Promise<void> => {
    try {
      await patchSettings.mutateAsync({
        username: profileForm.username,
        country: profileForm.country,
        default_language: profileForm.defaultLanguage,
      });

      await userQuery.refetch();
      setProfileDraft(null);
      setToastMessage(COPY.saved);
    } catch {
      setToastMessage(patchSettings.error?.message ?? COPY.saveFailed);
    }
  };

  // Country selector handlers
  const openCountryList = (): void => {
    setCountrySearch('');
    setIsCountryListOpen(true);
  };

  const handleCountrySearchChange = (value: string): void => {
    setCountrySearch(value);
    setIsCountryListOpen(true);
  };

  const handleCountryInputFocus = (): void => {
    openCountryList();
  };

  const handleCountryOptionSelect = (countryCode: string): void => {
    updateProfileForm((current) => ({ ...current, country: countryCode }));
    setCountrySearch('');
    setIsCountryListOpen(false);
  };

  const handleCountryInputBlur = (): void => {
    setIsCountryListOpen(false);
  };

  const selectedCountryLabel = useMemo(() => {
    if (!profileForm.country) {
      return '';
    }
    const selectedCountry = countryOptions.find((c) => c.value === profileForm.country);
    return selectedCountry?.label ?? '';
  }, [countryOptions, profileForm.country]);

  const countryInputValue = isCountryListOpen
    ? countrySearch
    : (selectedCountryLabel || countrySearch);

  if (userQuery.isLoading) {
    return (
      <main className="pp-content" aria-label={COPY.loading}>
        <article className="pp-card">
          <div className="pp-skeleton" style={{ height: 220 }} />
        </article>
      </main>
    );
  }

  if (userQuery.error || !userQuery.data) {
    return (
      <main className="pp-content">
        <article className="pp-card">
          <h1 className="pp-title">{COPY.title}</h1>
          <p className="pp-error" role="alert">{userQuery.error?.message ?? COPY.saveFailed}</p>
        </article>
      </main>
    );
  }

  return (
    <main className="pp-content" aria-labelledby="profile-page-title">
      <article className="pp-card">
        <h1 id="profile-page-title" className="pp-title">{COPY.title}</h1>

        <form
          className="pp-form-grid"
          style={{ marginTop: '1.25rem' }}
          onSubmit={(event) => {
            event.preventDefault();
            void saveProfile();
          }}
        >
          <div className="pp-form-row">
            <label htmlFor="settings-username">Username</label>
            <input
              id="settings-username"
              aria-label="Username"
              value={profileForm.username}
              onChange={(event) => updateProfileForm((current) => ({ ...current, username: event.currentTarget.value }))}
            />
          </div>

          <div className="pp-form-row">
            <label htmlFor="settings-email">Email</label>
            <input id="settings-email" aria-label="Email" value={profileForm.email} readOnly />
            <button type="button" className="pp-button pp-touch pp-focusable" aria-label={COPY.changeEmail}>
              {COPY.changeEmail}
            </button>
          </div>

          <div className="pp-grid-two">
            {/* Country Selector - Dropdown style */}
            <div className="pp-form-row">
              <label htmlFor="settings-country">{COPY.countryLabel}</label>
              <div className="pp-country-group" ref={countrySelectorRef}>
                <div className="pp-country-input-wrapper">
                  <input
                    id="settings-country"
                    type="text"
                    className="pp-country-input"
                    value={countryInputValue}
                    placeholder={COPY.countrySearchPlaceholder}
                    autoComplete="off"
                    onChange={(event) => handleCountrySearchChange(event.target.value)}
                    onFocus={handleCountryInputFocus}
                    onBlur={handleCountryInputBlur}
                    aria-label={COPY.countryLabel}
                    aria-expanded={isCountryListOpen}
                    aria-haspopup="listbox"
                  />
                  {isCountryListOpen && (
                    <div className="pp-country-dropdown" role="listbox" aria-label={COPY.countryLabel}>
                      {filteredCountryOptions.length === 0 ? (
                        <p className="pp-country-hint" style={{ padding: '0.75rem' }}>No matching countries</p>
                      ) : (
                        filteredCountryOptions.map((country) => {
                          const isSelected = country.value === profileForm.country;
                          return (
                            <button
                              key={country.value}
                              type="button"
                              className={`pp-country-option ${isSelected ? 'pp-country-option-selected' : ''}`}
                              onMouseDown={(event) => {
                                event.preventDefault();
                                handleCountryOptionSelect(country.value);
                              }}
                              role="option"
                              aria-selected={isSelected}
                            >
                              {country.label}
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
                <span className="pp-country-hint">{COPY.countrySearchHint}</span>
              </div>
            </div>

            <div className="pp-form-row">
              <label htmlFor="settings-default-language">{COPY.defaultLanguage}</label>
              <select
                id="settings-default-language"
                aria-label={COPY.defaultLanguage}
                value={profileForm.defaultLanguage}
                onChange={(event) => updateProfileForm((current) => ({ ...current, defaultLanguage: event.currentTarget.value }))}
              >
                <option value="en">English</option>
                <option value="fr">French</option>
                <option value="es">Spanish</option>
                <option value="it">Italian</option>
                <option value="ar">Arabic</option>
                <option value="ch">Chinese</option>
              </select>
            </div>
          </div>

          {isProfileDirty && <p className="pill-amber pp-pill">{COPY.profileUnsaved}</p>}

          <button
            type="submit"
            className="pp-button pp-button-primary pp-touch pp-focusable"
            aria-label={COPY.save}
            disabled={patchSettings.isPending}
          >
            {patchSettings.isPending ? `${COPY.save}...` : COPY.save}
          </button>
        </form>
      </article>

      {toastMessage && (
        <div className="pp-toast" role="status" aria-live="polite">
          <div className="pp-toast-card">{toastMessage}</div>
        </div>
      )}
    </main>
  );
};

export default ProfilePage;
