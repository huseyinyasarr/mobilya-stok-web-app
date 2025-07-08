// Firebase konfigürasyon dosyası
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getAnalytics } from 'firebase/analytics';
import productionFirebaseConfig from './firebase-config-production';

// Firebase projesi ayarları - Akıllı Config Selection
let firebaseConfig;

// Environment variables mevcut mu kontrol et
const hasEnvVars = process.env.REACT_APP_FIREBASE_API_KEY;

if (hasEnvVars) {
  // Geliştirme Modu: Environment Variables (Güvenli)
  firebaseConfig = {
    apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
    authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
    storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.REACT_APP_FIREBASE_APP_ID,
    measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
  };
  console.log('🔧 Geliştirme Modu: Environment variables kullanılıyor');
} else {
  // Production Modu: Hardcoded Config (GitHub Pages için)
  firebaseConfig = productionFirebaseConfig;
  console.log('🚀 Production Modu: Hardcoded config kullanılıyor');
}

// Konfigürasyon doğrulama
if (!firebaseConfig.apiKey) {
  console.error('❌ Firebase konfigürasyonu eksik!');
  throw new Error('Firebase konfigürasyonu bulunamadı');
}

console.log('✅ Firebase başarıyla yapılandırıldı');

// Firebase uygulamasını başlat
const app = initializeApp(firebaseConfig);

// Firebase servislerini export et
export const auth = getAuth(app);
export const db = getDatabase(app); // Realtime Database
export const analytics = getAnalytics(app);
export const googleProvider = new GoogleAuthProvider();

export default app; 