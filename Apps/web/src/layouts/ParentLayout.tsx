import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
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
import { useMeSummaryQuery } from '../hooks/api/useMeSummaryQuery';
import { useChildrenQuery } from '../hooks/api/useChildrenQuery';
import { useActiveChild } from '../hooks/useActiveChild';
import { logout } from '../lib/logout';
import '../styles/parent-portal.css';

interface NavItem {
  label: string;
  to: string;
  icon: React.ReactNode;
}

const WINDOW_SIZE = 2;

const ParentLayout = () => {
  const { translations } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const { activeChild, setActiveChildId } = useActiveChild();
  const userQuery = useMeSummaryQuery();
  const childrenQuery = useChildrenQuery();
  const { isHiddenByScroll: isNavbarHidden } = useScrollPosition();

  // Sidebar state: 'expanded' | 'collapsed'
  const [sidebarState, setSidebarState] = useState<'expanded' | 'collapsed'>('expanded');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [collapsedAvatarOffset, setCollapsedAvatarOffset] = useState(0);
  const [collapsedAvatarMotionDirection, setCollapsedAvatarMotionDirection] = useState<'up' | 'down' | null>(null);
  const [collapsedAvatarAnimationKey, setCollapsedAvatarAnimationKey] = useState(0);
  const previousSidebarStateRef = useRef<'expanded' | 'collapsed'>(sidebarState);

  // Child selector dropup state
  const [isChildDropUpOpen, setIsChildDropUpOpen] = useState(false);
  const childSelectorRef = useRef<HTMLDivElement>(null);

  const isSidebarExpanded = sidebarState === 'expanded';
  const children = childrenQuery.data ?? [];
  const displayChild = activeChild ?? children[0];

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
  // Using `pointerdown` instead of `mousedown` so the handler fires before
  // the option button's `click` event, avoiding the race condition where the
  // dropdown unmounts during the mousedown → click sequence.
  useEffect(() => {
    const handlePointerDownOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (childSelectorRef.current && !childSelectorRef.current.contains(target)) {
        setIsChildDropUpOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDownOutside);
    return () => document.removeEventListener('pointerdown', handlePointerDownOutside);
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

  useEffect(() => {
    if (previousSidebarStateRef.current === 'collapsed' && sidebarState === 'expanded') {
      setCollapsedAvatarOffset(0);
    }
    previousSidebarStateRef.current = sidebarState;
  }, [sidebarState]);

  useEffect(() => {
    setCollapsedAvatarOffset((currentOffset) => {
      const maxOffset = Math.max(children.length - WINDOW_SIZE, 0);
      return Math.min(currentOffset, maxOffset);
    });
  }, [children.length]);

  useEffect(() => {
    if (!displayChild) {
      return;
    }

    const activeChildIndex = children.findIndex((child) => child.child_id === displayChild.child_id);
    if (activeChildIndex < 0) {
      return;
    }

    setCollapsedAvatarOffset((currentOffset) => {
      const maxOffset = Math.max(children.length - WINDOW_SIZE, 0);
      const normalizedOffset = Math.min(currentOffset, maxOffset);

      if (activeChildIndex < normalizedOffset) {
        return activeChildIndex;
      }

      if (activeChildIndex >= normalizedOffset + WINDOW_SIZE) {
        return Math.min(activeChildIndex - WINDOW_SIZE + 1, maxOffset);
      }

      return normalizedOffset;
    });
  }, [children, displayChild?.child_id]);

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
      await logout();
    } catch {
      // Logout should still clear local auth state if the network call fails.
    }
  }, [isLoggingOut]);

  const renderNavItems = (items: NavItem[]): React.ReactNode =>
    items.map((item) => (
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
        <span className="pp-nav-link-text">{item.label}</span>
      </NavLink>
    ));

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
      const isAuthError = Boolean(childrenQuery.error.isAuthError);

      return (
        <div className="pp-child-selector-error">
          <p className="pp-muted" style={{ fontSize: '0.75rem' }}>
            {isAuthError && childrenQuery.error.status === 403
              ? 'Access denied.'
              : childrenQuery.error.message}
          </p>
          {!isAuthError && (
            <button
              type="button"
              className="pp-button pp-button-ghost"
              onClick={() => {
                void childrenQuery.refetch();
              }}
              disabled={childrenQuery.isFetching}
              style={{ marginTop: '0.5rem', fontSize: '0.75rem', padding: '0.375rem 0.5rem' }}
            >
              {childrenQuery.isFetching ? translations.loading : translations.try_again}
            </button>
          )}
        </div>
      );
    }

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

    if (!displayChild) {
      return null;
    }

    // When sidebar is collapsed, show only child avatars
    if (!isSidebarExpanded) {
      const totalChildren = children.length;
      const maxOffset = Math.max(totalChildren - WINDOW_SIZE, 0);
      const currentOffset = Math.min(collapsedAvatarOffset, maxOffset);
      const visibleChildren = children.slice(currentOffset, currentOffset + WINDOW_SIZE);
      const overflowBefore = currentOffset;
      const overflowAfter = Math.max(totalChildren - (currentOffset + WINDOW_SIZE), 0);
      const canGoUp = currentOffset > 0;
      const canGoDown = currentOffset + WINDOW_SIZE < totalChildren;
      const hasOverflow = totalChildren > WINDOW_SIZE;
      const collapsedAvatarWindowClassName = [
        'pp-child-avatar-window',
        collapsedAvatarMotionDirection === 'up'
          ? 'pp-child-avatar-window-up'
          : collapsedAvatarMotionDirection === 'down'
            ? 'pp-child-avatar-window-down'
            : '',
      ]
        .filter(Boolean)
        .join(' ');

      return (
        <div className="pp-child-avatars-collapsed">
          {hasOverflow && (
            <button
              type="button"
              className="pp-child-nav-button pp-touch pp-focusable"
              onClick={() => {
                setCollapsedAvatarMotionDirection('up');
                setCollapsedAvatarAnimationKey((current) => current + 1);
                setCollapsedAvatarOffset((current) => Math.max(current - 1, 0));
              }}
              disabled={!canGoUp}
              aria-disabled={!canGoUp}
              aria-label="Show previous children"
              title="Show previous children"
            >
              {canGoUp ? (
                <>
                  <span className="pp-child-nav-icon pp-child-nav-icon-desktop" aria-hidden="true">
                    <ChevronUp size={14} />
                  </span>
                  <span className="pp-child-nav-icon pp-child-nav-icon-mobile" aria-hidden="true">
                    <ChevronLeft size={14} />
                  </span>
                </>
              ) : (
                <span className="pp-child-nav-icon-placeholder" aria-hidden="true" />
              )}
            </button>
          )}

          <div
            key={`pp-child-avatar-window-${collapsedAvatarAnimationKey}`}
            className={collapsedAvatarWindowClassName}
          >
            {hasOverflow && overflowBefore > 0 && (
              <span className="pp-child-count">+{overflowBefore}</span>
            )}

            {visibleChildren.map((child) => {
              const childAvatarMotionClassName = collapsedAvatarMotionDirection === 'up'
                ? 'pp-child-avatar-btn-motion-up'
                : collapsedAvatarMotionDirection === 'down'
                  ? 'pp-child-avatar-btn-motion-down'
                  : '';
              const isActive = child.child_id === displayChild.child_id;
              return (
                <button
                  key={child.child_id}
                  type="button"
                  className={`pp-child-avatar-btn pp-touch pp-focusable ${childAvatarMotionClassName} ${isActive ? 'pp-child-avatar-active' : ''}`}
                  style={{ animationDelay: `${visibleChildren.indexOf(child) * 40}ms` }}
                  onClick={() => setActiveChildId(child.child_id)}
                  aria-label={child.nickname}
                  title={child.nickname}
                >
                  <span className="pp-child-avatar-small">{child.avatar ?? '🧒'}</span>
                </button>
              );
            })}

            {hasOverflow && overflowAfter > 0 && (
              <span className="pp-child-count">+{overflowAfter}</span>
            )}
          </div>

          {hasOverflow && (
            <button
              type="button"
              className="pp-child-nav-button pp-touch pp-focusable"
              onClick={() => {
                setCollapsedAvatarMotionDirection('down');
                setCollapsedAvatarAnimationKey((current) => current + 1);
                setCollapsedAvatarOffset((current) => Math.min(current + 1, maxOffset));
              }}
              disabled={!canGoDown}
              aria-disabled={!canGoDown}
              aria-label="Show next children"
              title="Show next children"
            >
              {canGoDown ? (
                <>
                  <span className="pp-child-nav-icon pp-child-nav-icon-desktop" aria-hidden="true">
                    <ChevronDown size={14} />
                  </span>
                  <span className="pp-child-nav-icon pp-child-nav-icon-mobile" aria-hidden="true">
                    <ChevronRight size={14} />
                  </span>
                </>
              ) : (
                <span className="pp-child-nav-icon-placeholder" aria-hidden="true" />
              )}
            </button>
          )}

          {totalChildren < 5 && (
            <button
              type="button"
              className="pp-child-add-avatar pp-touch pp-focusable"
              onClick={() => navigate('/parent/children/new')}
              aria-label={translations.dashboard_add_child}
              title={translations.dashboard_add_child}
            >
              <Plus size={16} />
            </button>
          )}
        </div>
      );
    }

    return (
      <div className="pp-child-selector" ref={childSelectorRef}>
        <button
          type="button"
          className="pp-child-selector-trigger pp-touch pp-focusable"
          onClick={(event) => {
            event.stopPropagation();
            setIsChildDropUpOpen((current) => !current);
          }}
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
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    setActiveChildId(child.child_id);
                    setIsChildDropUpOpen(false);
                  }}
                >
                  <span aria-hidden="true">{child.avatar ?? '🧒'}</span>
                  <span>{child.nickname}</span>
                  {isActive && <span className="pp-sr-only">({translations.success})</span>}
                </button>
              );
            })}
            {children.length < 5 && (
              <button
                type="button"
                className="pp-child-option pp-child-option-add pp-touch pp-focusable"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  setIsChildDropUpOpen(false);
                  navigate('/parent/children/new');
                }}
              >
                <Plus size={16} aria-hidden="true" />
                <span>{translations.dashboard_add_child}</span>
              </button>
            )}
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
        isAuthenticated={userQuery.isAuthenticated}
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

          {/* Dynamic Title - container always rendered, text conditionally rendered */}
          <div className="pp-sidebar-header">
            {isSidebarExpanded && (
              <>
                <h1 className="pp-title pp-sidebar-header-title">{pageTitle}</h1>
                <p className="pp-muted pp-sidebar-header-subtitle">{translations.nav_parent_profile}</p>
              </>
            )}
          </div>

          {/* Navigation */}
          <nav className="pp-sidebar-nav">
            {renderNavItems(mainNav)}
            <button
              type="button"
              className="pp-nav-link pp-nav-link-logout pp-touch pp-focusable"
              onClick={handleLogout}
              disabled={isLoggingOut}
              aria-label={translations.nav_logout}
              title={translations.nav_logout}
            >
              <LogOut size={20} strokeWidth={2} />
              <span className="pp-nav-link-text">{translations.nav_logout}</span>
            </button>
          </nav>

          {/* Child Selector */}
          <div className="pp-sidebar-child-selector">{renderChildSelector()}</div>
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
            {renderNavItems(mainNav)}
            <button
              type="button"
              className="pp-nav-link pp-nav-link-logout pp-touch pp-focusable"
              onClick={handleLogout}
              disabled={isLoggingOut}
              aria-label={translations.nav_logout}
              title={translations.nav_logout}
            >
              <LogOut size={20} strokeWidth={2} />
              <span className="pp-nav-link-text">{translations.nav_logout}</span>
            </button>
          </nav>

          <div className="pp-sidebar-child-selector">{renderChildSelector()}</div>
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
