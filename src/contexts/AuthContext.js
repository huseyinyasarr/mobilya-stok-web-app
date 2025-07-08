// Kullanıcı kimlik doğrulama durumunu yöneten Context
import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';

// Context oluştur
const AuthContext = createContext();

// Context'i kullanmak için custom hook
export function useAuth() {
  return useContext(AuthContext);
}

// AuthProvider component'i
export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Google ile giriş yapma fonksiyonu
  const signInWithGoogle = () => {
    return signInWithPopup(auth, googleProvider);
  };

  // Çıkış yapma fonksiyonu
  const logout = () => {
    return signOut(auth);
  };

  // Kullanıcı durumu değişikliklerini dinle
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      // Herhangi bir Google hesabı ile giriş yapılabilir
      setCurrentUser(user);
      setLoading(false);
    });

    // Cleanup function
    return unsubscribe;
  }, []);

  // Context value
  const value = {
    currentUser,
    signInWithGoogle,
    logout,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
} 