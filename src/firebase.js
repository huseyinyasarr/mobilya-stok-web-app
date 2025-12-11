// Firebase konfigürasyon dosyası
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getAnalytics } from 'firebase/analytics';

// Firebase projesi ayarları - Environment Variables'dan alınır
// .env dosyasında tanımlı olmalıdır
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
};

// Environment variables kontrolü
if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId || !firebaseConfig.databaseURL) {
  console.error('Firebase yapılandırma hatası: .env dosyasında gerekli değişkenler tanımlı olmalıdır.');
  throw new Error('Firebase yapılandırması eksik. Lütfen .env dosyasını kontrol edin.');
}

// Firebase uygulamasını başlat
const app = initializeApp(firebaseConfig);

// Firebase servislerini export et
export const auth = getAuth(app);
export const db = getDatabase(app); // Realtime Database
export const analytics = getAnalytics(app);
export const googleProvider = new GoogleAuthProvider();

export default app;
