// Güvenlik yardımcı fonksiyonları
export const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  
  // HTML tags ve script'leri temizle
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
};

// XSS koruması için string escape
export const escapeHtml = (unsafe) => {
  if (typeof unsafe !== 'string') return unsafe;
  
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

// Input validation kuralları
export const validateInput = {
  productName: (name) => {
    const sanitized = sanitizeInput(name);
    if (!sanitized || sanitized.length < 2) {
      throw new Error('Ürün adı en az 2 karakter olmalıdır');
    }
    if (sanitized.length > 100) {
      throw new Error('Ürün adı 100 karakterden uzun olamaz');
    }
    return sanitized;
  },

  brandName: (brand) => {
    const sanitized = sanitizeInput(brand);
    if (!sanitized || sanitized.length < 2) {
      throw new Error('Marka adı en az 2 karakter olmalıdır');
    }
    if (sanitized.length > 50) {
      throw new Error('Marka adı 50 karakterden uzun olamaz');
    }
    return sanitized;
  },

  colorCode: (code) => {
    const sanitized = sanitizeInput(code);
    // Sadece alphanumeric karakterler ve tire
    if (sanitized && !/^[a-zA-Z0-9-]{0,20}$/.test(sanitized)) {
      throw new Error('Renk kodu sadece harf, rakam ve tire içerebilir');
    }
    return sanitized;
  },

  colorName: (name) => {
    const sanitized = sanitizeInput(name);
    if (!sanitized || sanitized.length < 1) {
      throw new Error('Renk adı zorunludur');
    }
    if (sanitized.length > 30) {
      throw new Error('Renk adı 30 karakterden uzun olamaz');
    }
    return sanitized;
  },

  description: (desc) => {
    const sanitized = sanitizeInput(desc);
    if (sanitized && sanitized.length > 500) {
      throw new Error('Açıklama 500 karakterden uzun olamaz');
    }
    return sanitized;
  },

  quantity: (qty) => {
    const num = parseInt(qty);
    if (isNaN(num) || num < 0) {
      throw new Error('Adet sayısı geçerli bir pozitif sayı olmalıdır');
    }
    if (num > 999999) {
      throw new Error('Adet sayısı çok büyük (max: 999,999)');
    }
    return num;
  }
};

// Firebase güvenlik kontrolleri
export const checkFirebaseAuth = (user) => {
  if (!user) {
    throw new Error('Kullanıcı giriş yapmamış');
  }
  
  if (!user.emailVerified) {
    console.warn('Email doğrulanmamış kullanıcı:', user.email);
  }
  
  return true;
};

// Rate limiting için basit kontrolör (localStorage kullanıyor)
export const rateLimiter = {
  check: (action, maxAttempts = 10, timeWindow = 60000) => { // 10 attempt per minute
    const key = `rate_limit_${action}`;
    const now = Date.now();
    
    let attempts = JSON.parse(localStorage.getItem(key) || '[]');
    attempts = attempts.filter(time => now - time < timeWindow);
    
    if (attempts.length >= maxAttempts) {
      throw new Error(`Çok fazla deneme yapıldı. ${Math.ceil(timeWindow/1000)} saniye sonra tekrar deneyin.`);
    }
    
    attempts.push(now);
    localStorage.setItem(key, JSON.stringify(attempts));
    
    return true;
  }
}; 