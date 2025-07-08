// Google ile giriş yapma ekranı
import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './Login.css';

function Login() {
  const { signInWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  // Google ile giriş yapma
  const handleGoogleSignIn = async () => {
    try {
      setError('');
      setIsSuccess(false);

      setLoading(true);
      
      await signInWithGoogle();
      setIsSuccess(true);
      setError('Giriş başarılı! Yönlendiriliyor...');
      
    } catch (error) {
      console.error('Giriş hatası:', error);
      
      if (error.code === 'auth/popup-closed-by-user') {
        setError('Giriş penceresi kapatıldı. Lütfen tekrar deneyin.');
      } else if (error.code === 'auth/popup-blocked') {
        setError('Pop-up engellendi. Lütfen pop-up engelleyiciyi kapatın.');
      } else {
        setError('Giriş yaparken bir hata oluştu. Lütfen tekrar deneyin.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>🪑 Mobilya Stok Takip</h1>
          <p>Dükkanınızın stok yönetimi için güvenli giriş yapın</p>
        </div>

        {/* Hatalar ve başarı mesajları */}
        {error && (
          <div className={isSuccess ? "success-message" : "error-message"}>
            {error}
          </div>
        )}

        <button 
          className="google-signin-btn"
          onClick={handleGoogleSignIn}
          disabled={loading}
        >
          {loading ? (
            <span>Giriş yapılıyor...</span>
          ) : (
            <>
              <img 
                src="https://png.pngtree.com/png-vector/20230817/ourmid/pngtree-google-internet-icon-vector-png-image_9183287.png" 
                alt="Google" 
                className="google-icon"
              />
              Google ile Giriş Yap
            </>
          )}
        </button>

        <div className="login-info">
          
        </div>
      </div>
    </div>
  );
}

export default Login; 