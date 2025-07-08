// Sadece giriş yapmış kullanıcıların görebileceği sayfaları koruma sistemi
import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import Login from './Login';

function ProtectedRoute({ children }) {
  const { currentUser } = useAuth();

  // Eğer kullanıcı giriş yapmamışsa Login ekranını göster
  if (!currentUser) {
    return <Login />;
  }

  // Kullanıcı giriş yapmışsa, istenen sayfayı göster
  return children;
}

export default ProtectedRoute; 