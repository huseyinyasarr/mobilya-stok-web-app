# Mobilya Stok Takip Uygulaması

Firebase Realtime Database kullanarak geliştirilmiş mobilya stok takip uygulaması.

## Gereksinimler

- **Node.js**: >= 22.0.0 (LTS)
- **npm**: >= 10.0.0

NVM kullanıyorsanız:
```bash
nvm use
```

## Kurulum

### 1. Bağımlılıkları Yükleyin

```bash
npm install
```

### 2. Environment Variables (.env) Dosyası Oluşturun

Proje kök dizininde `.env` dosyası oluşturun ve Firebase yapılandırma bilgilerinizi ekleyin:

```env
REACT_APP_FIREBASE_API_KEY=your_api_key_here
REACT_APP_FIREBASE_AUTH_DOMAIN=your_auth_domain_here
REACT_APP_FIREBASE_DATABASE_URL=your_database_url_here
REACT_APP_FIREBASE_PROJECT_ID=your_project_id_here
REACT_APP_FIREBASE_STORAGE_BUCKET=your_storage_bucket_here
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id_here
REACT_APP_FIREBASE_APP_ID=your_app_id_here
REACT_APP_FIREBASE_MEASUREMENT_ID=your_measurement_id_here
```

**Önemli:** `.env` dosyası `.gitignore`'da olduğu için git'e commit edilmeyecektir. Bu sayede API key'leriniz güvende kalır.

### 3. Uygulamayı Çalıştırın

```bash
npm start
```

Uygulama [http://localhost:3000](http://localhost:3000) adresinde çalışacaktır.

## Build

Production build için:

```bash
npm run build
```

## Deploy

GitHub Pages'e deploy için:

```bash
npm run deploy
```

## Güvenlik

- Tüm Firebase API key'leri `.env` dosyasında saklanmalıdır
- `.env` dosyası asla git'e commit edilmemelidir
- Production ortamında environment variables'ları hosting platformunuzun ayarlarından yapılandırın

## Özellikler

- Ürün ekleme, düzenleme ve silme
- Kategori bazlı ürün yönetimi
- Stok takibi ve geçmişi
- Renk varyantları yönetimi
- Aktivite logları (son 300 kayıt)
- Google ile giriş yapma

