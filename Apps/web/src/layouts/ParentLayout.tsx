import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Languages, Menu, Moon, Sun } from 'lucide-react';
import ChildSelector from '../components/parent/ChildSelector';
import { useLanguage } from '../hooks/useLanguage';
import { useTheme } from '../hooks/useTheme';
import { useChildStore } from '../store/child.store';
import { useCurrentUser } from '../hooks/api/useCurrentUser';
import { useExportPdf } from '../hooks/api/useExportPdf';
import { logoutAuthSession } from '../lib/authSession';
import { LANGUAGES } from '../utils/constants';
import navStyles from '../components/NavBar/NavBar.module.css';
import '../styles/parent-portal.css';

interface NavItem {
  label: string;
  to: string;
}

const hasPinCookie = (): boolean => {
  if (typeof document === 'undefined') {
    return false;
  }

  return document.cookie.split('; ').some((entry) => entry.startsWith('pin_session=valid'));
};

const ParentLayout = () => {
  const { language, setLanguage, translations } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { activeChild } = useChildStore();
  const userQuery = useCurrentUser();
  const exportPdf = useExportPdf(activeChild?.child_id ?? null);

  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState<boolean>(false);
  const [isLanguageDropdownOpen, setIsLanguageDropdownOpen] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<string>('');
  const languageDropdownRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const mainNav: NavItem[] = [
    { label: translations.dashboard_page_title, to: '/parent/dashboard' },
    { label: translations.dashboard_settings_profile, to: '/parent/children' },
    { label: translations.dashboard_child_activity_title, to: '/parent/insights' },
  ];

  const accountNav: NavItem[] = [
    { label: translations.dashboard_settings_title, to: '/parent/settings' },
    { label: translations.settings_privacy, to: '/parent/subscription' },
  ];

  const pageTitle = useMemo(() => {
    if (/^\/parent\/dashboard/.test(location.pathname)) {
      return translations.dashboard_page_title;
    }

    if (/^\/parent\/children/.test(location.pathname)) {
      return translations.dashboard_settings_profile;
    }

    if (/^\/parent\/insights/.test(location.pathname)) {
      return translations.dashboard_child_activity_title;
    }

    if (/^\/parent\/settings/.test(location.pathname)) {
      return translations.dashboard_settings_title;
    }

    if (/^\/parent\/subscription/.test(location.pathname)) {
      return translations.settings_privacy;
    }

    return translations.dashboard_page_title;
  }, [
    location.pathname,
    translations.dashboard_child_activity_title,
    translations.dashboard_page_title,
    translations.dashboard_settings_profile,
    translations.dashboard_settings_title,
    translations.settings_privacy,
  ]);

  const pinIsActive = hasPinCookie();
  const pinStatusClassName = pinIsActive ? 'pp-pin-active' : 'pp-pin-locked';
  const pinStatusLabel = pinIsActive ? translations.success : translations.warning;

  const userInitial = useMemo(() => {
    const fallbackInitial = translations.nav_parent_profile.slice(0, 1) || translations.info.slice(0, 1);
    const username = userQuery.data?.username ?? userQuery.data?.email ?? fallbackInitial;
    return username.slice(0, 1).toUpperCase();
  }, [translations.info, translations.nav_parent_profile, userQuery.data]);

  const closeTopbarMenus = useCallback(() => {
    setIsLanguageDropdownOpen(false);
    setIsUserMenuOpen(false);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (languageDropdownRef.current && !languageDropdownRef.current.contains(event.target as Node)) {
        setIsLanguageDropdownOpen(false);
      }

      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeTopbarMenus();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [closeTopbarMenus]);

  useEffect(() => {
    closeTopbarMenus();
  }, [closeTopbarMenus, location.pathname]);

  const closeSidebarOnMobile = (): void => {
    setIsSidebarOpen(false);
  };

  const renderNavSection = (title: string, items: NavItem[]): React.ReactNode => {
    return (
      <section className="pp-nav-group" aria-label={title}>
        <p className="pp-nav-title">{title}</p>
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `pp-nav-link pp-touch pp-focusable ${isActive ? 'pp-nav-link-active' : ''}`}
            aria-label={item.label}
            onClick={closeSidebarOnMobile}
          >
            {item.label}
          </NavLink>
        ))}
      </section>
    );
  };

  return (
    <div className="pp-root pp-layout">
      <aside className={`pp-sidebar ${isSidebarOpen ? 'pp-sidebar-open' : ''}`}>
        <div className="pp-logo">
          <h1 className="pp-title">{translations.dashboard_page_title}</h1>
          <p>{translations.nav_parent_profile}</p>
        </div>

        <div className={`pp-pin-banner ${pinStatusClassName}`} role="status" aria-live="polite">
          {pinStatusLabel}
        </div>

        {renderNavSection(translations.info, mainNav)}
        {renderNavSection(translations.profile_edit, accountNav)}

        <div style={{ marginTop: 'auto' }}>
          <ChildSelector />
        </div>
      </aside>

      <div className="pp-main">
        <header className="pp-topbar">
          <div className="pp-topbar-left">
            <button
              type="button"
              className="pp-button pp-sidebar-drawer-toggle pp-touch pp-focusable"
              aria-label={translations.nav_menu_open}
              onClick={() => {
                setIsSidebarOpen((current) => !current);
              }}
            >
              <Menu size={18} strokeWidth={2.25} aria-hidden="true" />
            </button>
            <h2 className="pp-title">{pageTitle}</h2>
          </div>

          <div className="pp-topbar-actions">
            <div className="pp-topbar-switches">
              <div className={navStyles.langSelector} ref={languageDropdownRef}>
                <button
                  type="button"
                  className={`${navStyles.langButton} pp-focusable`}
                  aria-label={translations.nav_language_menu_open}
                  aria-haspopup="listbox"
                  aria-expanded={isLanguageDropdownOpen}
                  onClick={() => {
                    setIsLanguageDropdownOpen((current) => !current);
                    setIsUserMenuOpen(false);
                  }}
                >
                  <Languages size={18} strokeWidth={2} aria-hidden="true" />
                </button>

                {isLanguageDropdownOpen && (
                  <div className={navStyles.langDropdown} role="listbox" aria-label={translations.nav_language_menu_label}>
                    {LANGUAGES.map((languageOption) => (
                      <button
                        key={languageOption.code}
                        type="button"
                        role="option"
                        aria-selected={languageOption.code === language}
                        className={`${navStyles.langOption} ${languageOption.code === language ? navStyles.langOptionActive : ''}`}
                        onClick={() => {
                          setLanguage(languageOption.code);
                          setIsLanguageDropdownOpen(false);
                        }}
                      >
                        <span>{languageOption.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                className={`${navStyles.themeToggle} pp-focusable`}
                aria-label={translations.nav_change_theme}
                onClick={toggleTheme}
              >
                {theme === 'light' ? <Moon size={20} strokeWidth={2} aria-hidden="true" /> : <Sun size={20} strokeWidth={2} aria-hidden="true" />}
              </button>
            </div>

            <button
              type="button"
              className="pp-button pp-touch pp-focusable"
              aria-label={translations.profile_save}
              disabled={exportPdf.isPending}
              onClick={() => {
                exportPdf
                  .mutateAsync(undefined)
                  .then(() => {
                    setActionMessage(translations.success);
                  })
                  .catch(() => {
                    setActionMessage(exportPdf.error?.message ?? translations.error);
                  });
              }}
            >
              {exportPdf.isPending ? translations.loading : translations.profile_save}
            </button>

            <button
              type="button"
              className="pp-button pp-touch pp-focusable"
              aria-label={translations.dashboard_conversation_title}
              onClick={() => {
                navigate('/parent/insights?tab=progress');
              }}
            >
              {translations.dashboard_conversation_title}
            </button>

            <div className={`${navStyles.userMenuWrapper} pp-topbar-user-menu`} ref={userMenuRef}>
              <button
                type="button"
                className="pp-avatar-chip pp-touch pp-focusable"
                aria-label={translations.profile_edit}
                aria-haspopup="menu"
                aria-expanded={isUserMenuOpen}
                onClick={() => {
                  setIsLanguageDropdownOpen(false);
                  setIsUserMenuOpen((current) => !current);
                }}
              >
                {userQuery.isLoading ? '…' : userInitial}
              </button>

              {isUserMenuOpen && (
                <div className={`${navStyles.userDropdown} pp-topbar-user-dropdown`} role="menu" aria-label={translations.nav_user_menu_label}>
                  {userQuery.isLoading ? (
                    <p className="pp-topbar-user-loading">{translations.loading}</p>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={`${navStyles.userMenuItem} pp-focusable`}
                        aria-label={translations.profile_edit}
                        role="menuitem"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          navigate('/parent/settings?tab=profile');
                        }}
                      >
                        {translations.profile_edit}
                      </button>
                      <button
                        type="button"
                        className={`${navStyles.userMenuItem} pp-focusable`}
                        aria-label={translations.nav_logout}
                        role="menuitem"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          void logoutAuthSession();
                        }}
                      >
                        {translations.nav_logout}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        <Outlet />
      </div>

      {actionMessage && (
        <div className="pp-toast" role="status" aria-live="polite">
          <div className="pp-toast-card">{actionMessage}</div>
        </div>
      )}
    </div>
  );
};

export default ParentLayout;
