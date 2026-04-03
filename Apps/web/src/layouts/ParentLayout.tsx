import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ClipboardList,
  Home,
  LogOut,
  Menu,
  Plus,
  Settings,
  Shield,
  User,
  UserCircle,
  X,
} from 'lucide-react';
import NavBar from '../components/NavBar/NavBar';
import { useLanguage } from '../hooks/useLanguage';
import { useTheme } from '../hooks/useTheme';
import { useScrollPosition } from '../hooks/useScrollPosition';
import { childStore, useChildStore } from '../store/child.store';
import { useCurrentUser } from '../hooks/api/useCurrentUser';
import { useChildren } from '../hooks/api/useChildren';
import { logoutAuthSession } from '../lib/authSession';
import '../styles/parent-portal.css';

interface NavItem {
  label: string;
  to: string;
  icon: React.ReactNode;
}

const ParentLayout = () => {
  const { translations } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const { activeChild } = useChildStore();
  const userQuery = useCurrentUser();
  const childrenQuery = useChildren();
  const { isHiddenByScroll: isNavbarHidden } = useScrollPosition();

  // Sidebar state: 'expanded' | 'collapsed'
  const [sidebarState, setSidebarState] = useState<'expanded' | 'collapsed'>('expanded');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Child selector dropup state
  const [isChildDropUpOpen, setIsChildDropUpOpen] = useState(false);
  const childSelectorRef = useRef<HTMLDivElement>(null);

  const isSidebarExpanded = sidebarState === 'expanded';

  const mainNav: NavItem[] = [
    { label: translations.nav_profile, to: '/parent/profile', icon: <UserCircle size={20} strokeWidth={2} /> },
    { label: translations.dashboard_page_title, to: '/parent/dashboard', icon: <Home size={20} strokeWidth={2} /> },
    { label: translations.dashboard_settings_profile, to: '/parent/children', icon: <User size={20} strokeWidth={2} /> },
    { label: translations.dashboard_child_activity_title, to: '/parent/insights', icon: <ClipboardList size={20} strokeWidth={2} /> },
    { label: translations.dashboard_settings_title, to: '/parent/settings', icon: <Settings size={20} strokeWidth={2} /> },
    { label: translations.settings_privacy, to: '/parent/subscription', icon: <Shield size={20} strokeWidth={2} /> },
  ];

  // Dynamic page title based on current route
  const pageTitle = useMemo(() => {
    if (/^\/parent\/profile/.test(location.pathname)) return translations.nav_profile;
    if (/^\/parent\/dashboard/.test(location.pathname)) return translations.dashboard_page_title;
    if (/^\/parent\/children/.test(location.pathname)) return translations.dashboard_settings_profile;
    if (/^\/parent\/insights/.test(location.pathname)) return translations.dashboard_child_activity_title;
    if (/^\/parent\/settings/.test(location.pathname)) return translations.dashboard_settings_title;
    if (/^\/parent\/subscription/.test(location.pathname)) return translations.settings_privacy;
    return translations.dashboard_page_title;
  }, [location.pathname, translations]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (childSelectorRef.current && !childSelectorRef.current.contains(event.target as Node)) {
        setIsChildDropUpOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close menus on Escape
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsChildDropUpOpen(false);
        setIsMobileSidebarOpen(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);


  const handleToggleSidebar = useCallback(() => {
    setSidebarState((current) => (current === 'expanded' ? 'collapsed' : 'expanded'));
  }, []);

  const handleToggleMobileSidebar = useCallback(() => {
    setIsMobileSidebarOpen((current) => !current);
  }, []);

  const handleLogout = useCallback(async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logoutAuthSession();
    } catch {
      // Logout should still clear local auth state if the network call fails.
    }
  }, [isLoggingOut]);

  const renderNavSection = (items: NavItem[]): React.ReactNode => (
    <section className="pp-nav-group">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `pp-nav-link pp-touch pp-focusable ${isActive ? 'pp-nav-link-active' : ''}`
          }
          aria-label={item.label}
          title={item.label}
          onClick={() => setIsMobileSidebarOpen(false)}
        >
          {item.icon}
          {isSidebarExpanded && <span>{item.label}</span>}
        </NavLink>
      ))}
    </section>
  );

  // Child selector dropup
  const renderChildSelector = () => {
    if (childrenQuery.isLoading) {
      return (
        <div className="pp-child-selector-loading">
          <div className="pp-skeleton" style={{ height: 36 }} />
        </div>
      );
    }

    if (childrenQuery.error) {
      return (
        <div className="pp-child-selector-error">
          <p className="pp-muted" style={{ fontSize: '0.75rem' }}>{translations.error}</p>
        </div>
      );
    }

    const children = childrenQuery.data ?? [];

    // When sidebar is collapsed and no children exist, show only a + button
    if (children.length === 0) {
      if (!isSidebarExpanded) {
        return (
          <button
            type="button"
            className="pp-child-add-collapsed pp-touch pp-focusable"
            onClick={() => navigate('/parent/children/new')}
            aria-label={translations.dashboard_add_child}
            title={translations.dashboard_add_child}
          >
            <Plus size={20} />
          </button>
        );
      }

      return (
        <div className="pp-child-selector-empty">
          <p className="pp-muted" style={{ fontSize: '0.75rem' }}>{translations.dashboard_no_child_description}</p>
          <button
            type="button"
            className="pp-button pp-button-ghost"
            onClick={() => navigate('/parent/children/new')}
            style={{ marginTop: '0.5rem', fontSize: '0.75rem', padding: '0.375rem 0.5rem' }}
          >
            <Plus size={14} />
            {translations.dashboard_add_child}
          </button>
        </div>
      );
    }

    const displayChild = activeChild ?? children[0];

    // When sidebar is collapsed, show only child avatars
    if (!isSidebarExpanded) {
      return (
        <div className="pp-child-avatars-collapsed">
          {children.slice(0, 3).map((child) => {
            const isActive = child.child_id === displayChild.child_id;
            return (
              <button
                key={child.child_id}
                type="button"
                className={`pp-child-avatar-btn pp-touch pp-focusable ${isActive ? 'pp-child-avatar-active' : ''}`}
                onClick={() => childStore.setActiveChild(child)}
                aria-label={child.nickname}
                title={child.nickname}
              >
                <span className="pp-child-avatar-small">{child.avatar ?? '🧒'}</span>
              </button>
            );
          })}
          {children.length > 3 && (
            <span className="pp-child-count">+{children.length - 3}</span>
          )}
          <button
            type="button"
            className="pp-child-add-avatar pp-touch pp-focusable"
            onClick={() => navigate('/parent/children/new')}
            aria-label={translations.dashboard_add_child}
            title={translations.dashboard_add_child}
          >
            <Plus size={16} />
          </button>
        </div>
      );
    }

    return (
      <div className="pp-child-selector" ref={childSelectorRef}>
        <button
          type="button"
          className="pp-child-selector-trigger pp-touch pp-focusable"
          onClick={() => setIsChildDropUpOpen((current) => !current)}
          aria-expanded={isChildDropUpOpen}
          aria-haspopup="listbox"
          aria-label={`${translations.dashboard_settings_profile}: ${displayChild.nickname}`}
        >
          <span className="pp-child-avatar" aria-hidden="true">
            {displayChild.avatar ?? '🧒'}
          </span>
          <>
            <span className="pp-child-name">{displayChild.nickname}</span>
            <ChevronsUpDown size={14} className="pp-child-chevron" aria-hidden="true" />
          </>
        </button>

        {isChildDropUpOpen && (
          <div className="pp-child-dropup" role="listbox" aria-label={translations.dashboard_settings_profile}>
            {children.map((child) => {
              const isActive = child.child_id === displayChild.child_id;
              return (
                <button
                  key={child.child_id}
                  type="button"
                  className={`pp-child-option pp-touch pp-focusable ${isActive ? 'pp-child-option-active' : ''}`}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => {
                    childStore.setActiveChild(child);
                    setIsChildDropUpOpen(false);
                  }}
                >
                  <span aria-hidden="true">{child.avatar ?? '🧒'}</span>
                  <span>{child.nickname}</span>
                  {isActive && <span className="pp-sr-only">({translations.success})</span>}
                </button>
              );
            })}
            <button
              type="button"
              className="pp-child-option pp-child-option-add pp-touch pp-focusable"
              onClick={() => {
                setIsChildDropUpOpen(false);
                navigate('/parent/children/new');
              }}
            >
              <Plus size={16} aria-hidden="true" />
              <span>{translations.dashboard_add_child}</span>
            </button>
          </div>
        )}
      </div>
    );
  };

  // Layout class based on sidebar state
  const layoutClassName = `pp-layout pp-has-navbar ${!isSidebarExpanded ? 'pp-layout-collapsed' : ''} ${isNavbarHidden ? 'pp-navbar-hidden' : ''}`;

  return (
    <div className="pp-root" data-theme={theme} dir={translations.dir} lang={language}>
      <NavBar
        theme={theme}
        onToggleTheme={toggleTheme}
        language={language}
        onLanguageChange={setLanguage}
        translations={translations}
        isAuthenticated={!!userQuery.data}
      />

      <div className={layoutClassName}>
        {/* Desktop Sidebar */}
        <aside
          className={`pp-sidebar ${isSidebarExpanded ? 'pp-sidebar-expanded' : 'pp-sidebar-collapsed'}`}
          aria-label={translations.nav_menu_label}
        >
          {/* Sidebar Toggle Button */}
          <button
            type="button"
            className="pp-sidebar-toggle pp-touch pp-focusable"
            onClick={handleToggleSidebar}
            aria-label={isSidebarExpanded ? translations.nav_menu_close : translations.nav_menu_open}
          >
            {isSidebarExpanded ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          </button>

          {/* Dynamic Title */}
          <div className="pp-sidebar-header">
            {isSidebarExpanded && (
              <>
                <h1 className="pp-title">{pageTitle}</h1>
                <p className="pp-muted">{translations.nav_parent_profile}</p>
              </>
            )}
          </div>

          {/* Navigation */}
          <nav className="pp-sidebar-nav">
            {renderNavSection(mainNav)}
          </nav>

          {/* Child Selector */}
          <div className="pp-sidebar-child-selector">{renderChildSelector()}</div>

          {/* Logout Button */}
          <div className="pp-sidebar-footer">
            <button
              type="button"
              className="pp-logout-button pp-touch pp-focusable"
              onClick={handleLogout}
              disabled={isLoggingOut}
              aria-label={translations.nav_logout}
              title={translations.nav_logout}
            >
              <LogOut size={18} />
              {isSidebarExpanded && <span>{translations.nav_logout}</span>}
            </button>
          </div>
        </aside>

        {/* Mobile Sidebar Overlay */}
        {isMobileSidebarOpen && (
          <div
            className="pp-sidebar-backdrop"
            onClick={handleToggleMobileSidebar}
            aria-hidden="true"
          />
        )}

        {/* Mobile Sidebar */}
        <aside
          className={`pp-sidebar pp-sidebar-mobile ${isMobileSidebarOpen ? 'pp-sidebar-mobile-open' : ''}`}
          aria-label={translations.nav_menu_label}
        >
          <div className="pp-mobile-sidebar-header">
            <h1 className="pp-title">{pageTitle}</h1>
            <button
              type="button"
              className="pp-button pp-button-ghost pp-touch pp-focusable"
              onClick={handleToggleMobileSidebar}
              aria-label={translations.nav_menu_close}
            >
              <X size={20} />
            </button>
          </div>

          <nav className="pp-sidebar-nav">
            {renderNavSection(mainNav)}
          </nav>

          <div className="pp-sidebar-child-selector">{renderChildSelector()}</div>

          {/* Mobile Logout Button */}
          <div className="pp-sidebar-footer">
            <button
              type="button"
              className="pp-logout-button pp-touch pp-focusable"
              onClick={handleLogout}
              disabled={isLoggingOut}
              aria-label={translations.nav_logout}
            >
              <LogOut size={18} />
              <span>{translations.nav_logout}</span>
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="pp-main">
          {/* Mobile Top Bar */}
          <header className="pp-mobile-topbar">
            <button
              type="button"
              className="pp-hamburger pp-touch pp-focusable"
              onClick={handleToggleMobileSidebar}
              aria-label={translations.nav_menu_open}
              aria-expanded={isMobileSidebarOpen}
              aria-controls="mobile-sidebar"
            >
              <Menu size={20} />
            </button>
            <h2 className="pp-title">{pageTitle}</h2>
            <div style={{ width: 44 }} /> {/* Spacer for centering */}
          </header>

          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default ParentLayout;
