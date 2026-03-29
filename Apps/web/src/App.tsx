import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import HomePage from './pages/HomePage/HomePage';
import { useAuthStatus } from './hooks/useAuthStatus';
import AppErrorBoundary from './components/shared/AppErrorBoundary/AppErrorBoundary';
import ErrorPage from './pages/ErrorPage/ErrorPage';

const LoginPage = React.lazy(() => import('./pages/LoginPage/LoginPage'));
const GetStartedPage = React.lazy(() => import('./pages/GetStartedPage/GetStartedPage'));
const ParentProfilePage = React.lazy(() => import('./pages/ParentProfilePage/ParentProfilePage'));
const NotFoundPage = React.lazy(() => import('./pages/NotFoundPage/NotFoundPage'));

const App = () => {
  const { isAuthenticated } = useAuthStatus();

  return (
    <BrowserRouter>
      <AppErrorBoundary>
        <Suspense
          fallback={
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100vh',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-body)',
              }}
              aria-label="Loading page"
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  border: '3px solid var(--border-subtle)',
                  borderTopColor: 'var(--accent-main)',
                  borderRadius: '50%',
                  animation: 'spinRing 0.8s linear infinite',
                }}
              />
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<HomePage isAuthenticated={isAuthenticated} />} />
            <Route
              path="/login"
              element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
            />
            <Route path="/get-started" element={<GetStartedPage />} />
            <Route path="/parent-profile" element={<ParentProfilePage isAuthenticated={isAuthenticated} />} />
            <Route path="/error" element={<ErrorPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </AppErrorBoundary>
    </BrowserRouter>
  );
};

export default App;
