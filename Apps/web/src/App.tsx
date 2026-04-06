import { Suspense } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { useMeSummaryQuery } from './features/auth';
import { useReducedMotionPreference } from './hooks/useReducedMotionPreference';
import AppErrorBoundary from './components/layout/AppErrorBoundary/AppErrorBoundary';
import { AppRoutes } from './routes';

const App = () => {
  const { isAuthenticated, isLoading } = useMeSummaryQuery();
  const isReducedMotion = useReducedMotionPreference();

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
                  animation: isReducedMotion ? 'none' : 'spinRing 0.8s linear infinite',
                }}
              />
            </div>
          }
        >
          <AppRoutes isAuthenticated={isAuthenticated} isLoading={isLoading} />
        </Suspense>
      </AppErrorBoundary>
    </BrowserRouter>
  );
};

export default App;
