import { Navigate } from 'react-router-dom';
import { hasParentProfileAccess } from '../../utils/parentProfileAccess';

interface ParentProfilePageProps {
  isAuthenticated: boolean;
}

const ParentProfilePage = ({ isAuthenticated }: ParentProfilePageProps) => {
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!hasParentProfileAccess()) {
    return <Navigate to="/" replace />;
  }

  return <Navigate to="/parent/profile" replace />;
};

export default ParentProfilePage;