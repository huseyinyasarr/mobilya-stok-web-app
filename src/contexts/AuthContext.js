// Güvenli kullanıcı kimlik doğrulama Context'i
import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';

// Güvenli domain listesi (environment'dan alınabilir)
const ALLOWED_EMAIL_DOMAINS = process.env.REACT_APP_ALLOWED_DOMAINS 
  ? process.env.REACT_APP_ALLOWED_DOMAINS.split(',')
  : ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com']; // Fallback domains

// Email domain kontrolü
const isEmailDomainAllowed = (email) => {
  if (!email) return false;
  const domain = email.split('@')[1]?.toLowerCase();
  return ALLOWED_EMAIL_DOMAINS.some(allowedDomain => 
    domain === allowedDomain.toLowerCase().trim()
  );
};

// Context oluştur
const AuthContext = createContext();

// Context'i kullanmak için custom hook
export function useAuth() {
  return useContext(AuthContext);
}

// Güvenli AuthProvider component'i
export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  // Güvenli Google ile giriş yapma fonksiyonu
  const signInWithGoogle = async () => {
    try {
      setAuthError(null);
      
      // Popup ile giriş yap
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      // Email domain kontrolü
      if (!isEmailDomainAllowed(user.email)) {
        await signOut(auth); // Kullanıcıyı çıkart
        throw new Error(`Bu email domain'i (${user.email.split('@')[1]}) ile giriş yapılamaz. İzin verilen domain'ler: ${ALLOWED_EMAIL_DOMAINS.join(', ')}`);
      }
      
      // Email doğrulama kontrolü (opsiyonel uyarı)
      if (!user.emailVerified) {
        console.warn('Email doğrulanmamış kullanıcı girişi:', user.email);
        // Burada kullanıcıya email doğrulama mesajı gösterilebilir
      }
      
      // Başarılı giriş logları
      console.log('Güvenli giriş başarılı:', {
        email: user.email,
        uid: user.uid,
        emailVerified: user.emailVerified,
        domain: user.email.split('@')[1]
      });
      
      return result;
      
    } catch (error) {
      console.error('Güvenli giriş hatası:', error);
      setAuthError(error.message);
      throw error;
    }
  };

  // Güvenli çıkış yapma fonksiyonu
  const logout = async () => {
    try {
      setAuthError(null);
      
      // Kullanıcı session temizleme
      if (currentUser) {
        console.log('Kullanıcı çıkış yapıyor:', currentUser.email);
        
        // Local storage temizleme (rate limiting verilerini koru)
        const rateLimit = {};
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('rate_limit_')) {
            rateLimit[key] = localStorage.getItem(key);
          }
        }
        
        localStorage.clear();
        
        // Rate limit verilerini geri yükle
        Object.keys(rateLimit).forEach(key => {
          localStorage.setItem(key, rateLimit[key]);
        });
      }
      
      return await signOut(auth);
      
    } catch (error) {
      console.error('Çıkış hatası:', error);
      setAuthError(error.message);
      throw error;
    }
  };

  // Güvenli kullanıcı durumu dinleyicisi
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        if (user) {
          // Email domain kontrolü (her auth state değişiminde)
          if (!isEmailDomainAllowed(user.email)) {
            console.warn('İzin verilmeyen domain ile giriş tespit edildi:', user.email);
            await signOut(auth);
            setAuthError('Bu email domain\'i ile giriş yapılamaz');
            setCurrentUser(null);
            setLoading(false);
            return;
          }
          
          // Güvenlik logları
          console.log('Auth state değişti - kullanıcı giriş yaptı:', {
            email: user.email,
            uid: user.uid,
            emailVerified: user.emailVerified
          });
        } else {
          console.log('Auth state değişti - kullanıcı çıkış yaptı');
        }
        
      setCurrentUser(user);
      setLoading(false);
        
      } catch (error) {
        console.error('Auth state değişiklik hatası:', error);
        setAuthError(error.message);
        setCurrentUser(null);
        setLoading(false);
      }
    });

    // Cleanup function
    return unsubscribe;
  }, []);

  // Güvenli Context value
  const value = {
    currentUser,
    signInWithGoogle,
    logout,
    loading,
    authError,
    isEmailDomainAllowed // Domain kontrolü için utility
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
} 