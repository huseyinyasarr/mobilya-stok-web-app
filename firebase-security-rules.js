/*
 * Firebase Realtime Database Güvenlik Kuralları
 * 
 * Bu dosyadaki kuralları Firebase Console'da uygulayın:
 * 1. Firebase Console > Database > Realtime Database > Rules sekmesi
 * 2. Aşağıdaki JSON'u kopyalayıp yapıştırın
 * 3. "Yayınla" butonuna tıklayın
 * 
 * UYARI: Bu kurallar çok sıkıdır ve mevcut verilerinizi etkileyebilir!
 * Önce test environment'da deneyin.
 */

const firebaseSecurityRules = {
  "rules": {
    "products": {
      // Sadece giriş yapmış kullanıcılar okuyabilir
      ".read": "auth != null",
      
      // Sadece giriş yapmış kullanıcılar yazabilir
      ".write": "auth != null",
      
      // Her ürün için kurallar
      "$productId": {
        // Ürün validation kuralları - zorunlu alanlar
        ".validate": "newData.hasChildren(['name', 'brand', 'category', 'variants', 'totalQuantity', 'createdAt', 'createdBy'])",
        
        // Ürün adı kuralları
        "name": {
          ".validate": "newData.isString() && newData.val().length >= 2 && newData.val().length <= 100"
        },
        
        // Marka kuralları
        "brand": {
          ".validate": "newData.isString() && newData.val().length >= 2 && newData.val().length <= 50"
        },
        
        // Kategori kuralları - sadece belirli kategoriler
        "category": {
          ".validate": "newData.isString() && newData.val().matches(/^(yatak|kanepe|koltuk|masa|sandalye|dolap|diğer)$/)"
        },
        
        // Açıklama kuralları (opsiyonel)
        "description": {
          ".validate": "!newData.exists() || (newData.isString() && newData.val().length <= 500)"
        },
        
        // Toplam adet kuralları
        "totalQuantity": {
          ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 999999"
        },
        
        // Varyantlar kuralları
        "variants": {
          ".validate": "newData.hasChildren()",
          "$variantIndex": {
            ".validate": "newData.hasChildren(['colorName', 'quantity'])",
            
            "colorCode": {
              ".validate": "!newData.exists() || (newData.isString() && newData.val().length <= 20 && newData.val().matches(/^[a-zA-Z0-9-]*$/))"
            },
            
            "colorName": {
              ".validate": "newData.isString() && newData.val().length >= 1 && newData.val().length <= 30"
            },
            
            "quantity": {
              ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 999999"
            },
            
            // Sadece geçerli alanlar
            "$other": {
              ".validate": "false"
            }
          }
        },
        
        // Oluşturma bilgileri - güvenlik için
        "createdAt": {
          ".validate": "newData.isString() && newData.val().matches(/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}.\\d{3}Z$/)"
        },
        
        "createdBy": {
          ".validate": "newData.isString() && newData.val() == auth.uid"
        },
        
        "createdByEmail": {
          ".validate": "newData.isString() && newData.val() == auth.token.email"
        },
        
        // Güncelleme bilgileri (opsiyonel)
        "lastUpdatedAt": {
          ".validate": "!newData.exists() || newData.isString()"
        },
        
        "lastUpdatedBy": {
          ".validate": "!newData.exists() || (newData.isString() && newData.val() == auth.uid)"
        },
        
        "lastUpdatedByEmail": {
          ".validate": "!newData.exists() || (newData.isString() && newData.val() == auth.token.email)"
        },
        
        // Legacy fields (eski sistem uyumluluğu için)
        "quantity": {
          ".validate": "!newData.exists() || newData.val() == null"
        },
        
        // Sadece yukarıdaki alanlar kabul edilir
        "$other": {
          ".validate": "false"
        }
      }
    },
    
    // Diğer tüm path'leri engelle
    "$other": {
      ".read": "false",
      ".write": "false"
    }
  }
};

// Firebase Console'a kopyalamak için clean JSON
console.log("Firebase Console'a kopyalayın:");
console.log(JSON.stringify(firebaseSecurityRules, null, 2));

module.exports = firebaseSecurityRules; 