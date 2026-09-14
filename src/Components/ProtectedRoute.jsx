import { Navigate } from 'react-router-dom';
import { authService } from '../services/auth';

export default function ProtectedRoute({ children, requiredRole }) {
  const isAuth = authService.isAuthenticated();
  const userRole = authService.getRole();

  if (!isAuth) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && userRole !== requiredRole) {
    // Redirect to an unauthorized page or dashboard if role doesn't match
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}