import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import HomePage from '../pages/HomePage/HomePage';
import ErrorPage from '../pages/ErrorPage/ErrorPage';
import { ParentRoutes } from './ParentRoutes';

const LoginPage = React.lazy(() => import('../pages/LoginPage/LoginPage'));
const GetStartedPage = React.lazy(() => import('../pages/GetStartedPage/GetStartedPage'));
const ParentProfilePage = React.lazy(() => import('../pages/ParentProfilePage/ParentProfilePage'));
const NotFoundPage = React.lazy(() => import('../pages/NotFoundPage/NotFoundPage'));

interface AppRoutesProps {
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AppRoutes = ({ isAuthenticated, isLoading }: AppRoutesProps) => {
  return (
    <Routes>
      <Route path="/" element={<HomePage isAuthenticated={isAuthenticated} />} />
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route
        path="/get-started"
        element={isLoading ? null : isAuthenticated ? <Navigate to="/" replace /> : <GetStartedPage />}
      />
      <Route path="/dashboard" element={<Navigate to="/parent/dashboard" replace />} />
      <Route path="/parent-profile" element={<ParentProfilePage isAuthenticated={isAuthenticated} />} />
      {ParentRoutes}
      <Route path="/error" element={<ErrorPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

export default AppRoutes;