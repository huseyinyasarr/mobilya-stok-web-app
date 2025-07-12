// Logging utility functions
import { ref, push } from 'firebase/database';
import { db } from '../firebase';

// Log işlemi tiplerini tanımla
export const LOG_ACTIONS = {
  PRODUCT_CREATED: 'PRODUCT_CREATED',
  PRODUCT_UPDATED: 'PRODUCT_UPDATED', 
  PRODUCT_DELETED: 'PRODUCT_DELETED',
  PRODUCT_QUANTITY_CHANGED: 'PRODUCT_QUANTITY_CHANGED'
};

// Log kaydı oluşturma helper function'ı
export const createLog = async (action, user, productInfo, details = {}) => {
  try {
    if (!user || !action || !productInfo) {
      console.warn('Eksik log bilgileri:', { action, user, productInfo });
      return;
    }

    const logsRef = ref(db, 'logs');
    
    const logEntry = {
      action,
      timestamp: new Date().toISOString(),
      user: {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || 'Bilinmeyen Kullanıcı',
        photoURL: user.photoURL || null
      },
      product: {
        id: productInfo.id,
        name: productInfo.name,
        brand: productInfo.brand,
        category: productInfo.category,
        ...(productInfo.totalQuantity !== undefined && { totalQuantity: productInfo.totalQuantity }),
        ...(productInfo.quantity !== undefined && { quantity: productInfo.quantity })
      },
      details: details,
      // Türkçe açıklama ekle
      description: getLogDescription(action, user.displayName || user.email, productInfo, details)
    };

    await push(logsRef, logEntry);
    console.log('Log kaydı oluşturuldu:', logEntry);
    
  } catch (error) {
    console.error('Log kaydı oluşturulurken hata:', error);
    // Log hatası ana işlemi engellemez
  }
};

// Log açıklaması oluştur
const getLogDescription = (action, userName, productInfo, details) => {
  const productName = `"${productInfo.name}" (${productInfo.brand})`;
  
  switch (action) {
    case LOG_ACTIONS.PRODUCT_CREATED:
      const totalQty = productInfo.totalQuantity || productInfo.quantity || 0;
      return `${userName}, ${productName} ürününü ekledi (${totalQty} adet)`;
      
    case LOG_ACTIONS.PRODUCT_UPDATED:
      let updateDetails = [];
      if (details.quantityChange) {
        updateDetails.push(`Toplam stok: ${details.quantityChange.from} → ${details.quantityChange.to}`);
      }
      if (details.nameChanged) {
        updateDetails.push(`İsim değişti: "${details.nameChanged.from}" → "${details.nameChanged.to}"`);
      }
      if (details.categoryChanged) {
        updateDetails.push(`Kategori değişti: "${details.categoryChanged.from}" → "${details.categoryChanged.to}"`);
      }
      if (details.variantChanges) {
        const variantTexts = [];
        
        // Yeni eklenen varyantlar
        if (details.variantChanges.added && details.variantChanges.added.length > 0) {
          details.variantChanges.added.forEach(variant => {
            const colorInfo = variant.colorCode || variant.colorName ? 
              `${variant.colorCode} ${variant.colorName}`.trim() : 'Renksiz';
            variantTexts.push(`${colorInfo} (${variant.quantity} adet) eklendi`);
          });
        }
        
        // Miktarı değişen varyantlar
        if (details.variantChanges.modified && details.variantChanges.modified.length > 0) {
          details.variantChanges.modified.forEach(change => {
            const colorInfo = change.colorCode || change.colorName ? 
              `${change.colorCode} ${change.colorName}`.trim() : 'Renksiz';
            variantTexts.push(`${colorInfo}: ${change.oldQuantity} → ${change.newQuantity} adet`);
          });
        }
        
        // Silinen varyantlar
        if (details.variantChanges.removed && details.variantChanges.removed.length > 0) {
          details.variantChanges.removed.forEach(variant => {
            const colorInfo = variant.colorCode || variant.colorName ? 
              `${variant.colorCode} ${variant.colorName}`.trim() : 'Renksiz';
            variantTexts.push(`${colorInfo} (${variant.quantity} adet) silindi`);
          });
        }
        
        if (variantTexts.length > 0) {
          updateDetails.push(`Renkler: ${variantTexts.join(', ')}`);
        }
      }
      
      const changeText = updateDetails.length > 0 ? ` (${updateDetails.join('; ')})` : '';
      return `${userName}, ${productName} ürününü güncelledi${changeText}`;
      
    case LOG_ACTIONS.PRODUCT_DELETED:
      return `${userName}, ${productName} ürününü sildi`;
      
    case LOG_ACTIONS.PRODUCT_QUANTITY_CHANGED:
      const { from, to } = details.quantityChange || {};
      return `${userName}, ${productName} ürününün stok miktarını değiştirdi (${from} → ${to})`;
      
    default:
      return `${userName}, ${productName} ürünü üzerinde bir işlem yaptı`;
  }
};

// Log kayıtlarını getirme fonksiyonu
export const getLogEntries = async (limit = 100) => {
  try {
    const logsRef = ref(db, 'logs');
    // En yeni kayıtları getirmek için timestamp'e göre sıralama yapacağız
    // Bu kısmı çağıran component'te onValue ile dinleyeceğiz
    return logsRef;
  } catch (error) {
    console.error('Log kayıtları getirilirken hata:', error);
    return null;
  }
}; 