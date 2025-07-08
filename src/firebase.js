// Firebase konfigürasyon dosyası
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getAnalytics } from 'firebase/analytics';

// Firebase projesi ayarları - Environment Variables'dan alınır (fallback olarak gerçek değerler)
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyDsX5K7-49OgRRNLk8_16kiDYOlO8ziRTI",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "mobilya-stok-takip.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "mobilya-stok-takip",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "mobilya-stok-takip.firebasestorage.app",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "580546235473",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:580546235473:web:18df095f586a893016fc70",
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID || "G-HKH4W4VRFV"
};

// Firebase uygulamasını başlat
const app = initializeApp(firebaseConfig);

// Firebase servislerini export et
export const auth = getAuth(app);
export const db = getDatabase(app); // Realtime Database
export const analytics = getAnalytics(app);
export const googleProvider = new GoogleAuthProvider();

export default app; 