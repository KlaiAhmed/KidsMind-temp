import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import HomePage from './pages/HomePage/HomePage';
import { useAuthStatus } from './hooks/useAuthStatus';

const LoginPage = React.lazy(() => import('./pages/LoginPage/LoginPage'));
const GetStartedPage = React.lazy(() => import('./pages/GetStartedPage/GetStartedPage'));

interface GuestOnlyRouteProps {
  isAuthenticated: boolean;
  isLoading: boolean;
  children: React.ReactElement;
}

const GuestOnlyRoute = ({ isAuthenticated, isLoading, children }: GuestOnlyRouteProps) => {
  if (isLoading) {
    return null;
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return children;
};

const App = () => {
  const { isAuthenticated, isLoading } = useAuthStatus();

  return (
    <BrowserRouter>
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
            element={(
              <GuestOnlyRoute isAuthenticated={isAuthenticated} isLoading={isLoading}>
                <LoginPage />
              </GuestOnlyRoute>
            )}
          />
          <Route
            path="/get-started"
            element={(
              <GuestOnlyRoute isAuthenticated={isAuthenticated} isLoading={isLoading}>
                <GetStartedPage />
              </GuestOnlyRoute>
            )}
          />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};

export default App;
