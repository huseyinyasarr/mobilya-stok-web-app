// Ürün düzenleme modal component'i
import React, { useState, useEffect } from 'react';
import { ref, update, remove } from 'firebase/database';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { createLog, LOG_ACTIONS } from '../utils/logging';
import './ProductEditModal.css';

function ProductEditModal({ product, onClose, onProductUpdated }) {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Form verileri
  const [formData, setFormData] = useState({
    name: product.name || '',
    brand: product.brand || '',
    category: product.category || '',
    description: product.description || ''
  });

  // Varyant verileri
  const [variants, setVariants] = useState(product.variants || []);
  
  // Orijinal stok miktarlarını takip et
  const [originalTotalQuantity, setOriginalTotalQuantity] = useState(0);
  
  // Stok geçmişi görüntüleme
  const [showStockHistory, setShowStockHistory] = useState(false);
  
  // Stok değişikliği modal'ı
  const [showStockReasonModal, setShowStockReasonModal] = useState(false);
  const [stockChangeType, setStockChangeType] = useState('');
  const [stockChangeAmount, setStockChangeAmount] = useState('');
  const [stockChangeReason, setStockChangeReason] = useState('');
  const [stockChangeDescription, setStockChangeDescription] = useState('');



  // Kategori seçenekleri
  const categories = [
    { id: 'masa', name: 'Masa/Sehpa' },
    { id: 'sandalye', name: 'Sandalye' },
    { id: 'koltuk', name: 'Koltuk' },
    { id: 'dolap', name: 'Dolap' },
    { id: 'yatak', name: 'Yatak' },
    { id: 'tv-unitesi', name: 'TV Ünitesi' },
    { id: 'kitaplik', name: 'Kitaplık' },
    { id: 'konsol', name: 'Konsol' },
    { id: 'puf', name: 'Puf' },
    { id: 'berjer', name: 'Berjer' },
    { id: 'diger', name: 'Diğer' }
  ];

  // Component mount olduğunda orijinal stok miktarını ayarla
  useEffect(() => {
    const initialTotal = (product.variants || []).reduce((total, variant) => {
      return total + (parseInt(variant.quantity) || 0);
    }, 0);
    setOriginalTotalQuantity(initialTotal);
  }, [product]);

  // Form input değişikliklerini handle et
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Varyant değişikliklerini handle et
  const handleVariantChange = (index, field, value) => {
    setVariants(prev => prev.map((variant, i) => {
      if (i === index) {
        // Quantity alanı için negatif değer kontrolü
        if (field === 'quantity') {
          const numValue = parseInt(value) || 0;
          return { ...variant, [field]: Math.max(0, numValue) };
        }
        return { ...variant, [field]: value };
      }
      return variant;
    }));
  };

  const addVariant = () => {
    setVariants(prev => [...prev, { colorCode: '', colorName: '', quantity: 0 }]);
  };

  const removeVariant = (index) => {
    if (variants.length > 1) {
      setVariants(prev => prev.filter((_, i) => i !== index));
    }
  };

  // Toplam adet hesaplama
  const getTotalQuantity = () => {
    return variants.reduce((total, variant) => {
      return total + (parseInt(variant.quantity) || 0);
    }, 0);
  };

  // Stok değişikliği olup olmadığını kontrol et
  const hasStockChanged = () => {
    const currentTotal = getTotalQuantity();
    return currentTotal !== originalTotalQuantity;
  };

  // Stok geçmişi formatlama
  const getStockReasonText = (entry) => {
    let baseText = '';
    
    // İade açıklamaları varsa göster
    if (entry.type === 'increase' && entry.reason === 'return') {
      if (entry.returnReason === 'wrong_product') baseText = 'Yanlış Ürün';
      else if (entry.returnReason === 'damaged') baseText = 'Bozuk Ürün';
      else if (entry.returnReason === 'other') baseText = 'Diğer';
      if (entry.returnDescription) baseText += `: ${entry.returnDescription}`;
    } else if (entry.type === 'decrease' && entry.reason === 'return_to_supplier') {
      if (entry.returnReason === 'wrong_product') baseText = 'Yanlış Ürün';
      else if (entry.returnReason === 'damaged') baseText = 'Bozuk Ürün';
      else if (entry.returnReason === 'other') baseText = 'Diğer';
      if (entry.returnDescription) baseText += `: ${entry.returnDescription}`;
    }
    
    // Toplam kalan ürün göster
    if (typeof entry.remainingStock === 'number') {
      if (baseText) baseText += '\n';
      baseText += `Toplam kalan ürün: ${entry.remainingStock} adet`;
    }
    
    // Varyant bilgisi ekle (işlem sonrası kalan miktarlar)
    if (entry.variantChanges && entry.variantChanges.length > 0) {
      const variantTexts = entry.variantChanges
        .filter(variant => variant.quantityChange !== 0)
        .map(variant => {
          const colorInfo = [variant.colorCode, variant.colorName]
            .filter(Boolean)
            .join(' - ');
          const colorDisplay = colorInfo || 'Renksiz';
          const kalanMiktar = variant.newQuantity;
          return `${colorDisplay} kalan: ${kalanMiktar} adet`;
        });
      
      if (variantTexts.length > 0) {
        baseText += `\n${variantTexts.join('\n')}`;
      }
    }
    
    // Satılan/alınan miktar detayı
    if (entry.quantity && entry.variantChanges && entry.variantChanges.length > 0) {
      const islemYapilan = entry.variantChanges
        .filter(variant => variant.quantityChange !== 0)
        .map(variant => {
          const colorInfo = [variant.colorCode, variant.colorName]
            .filter(Boolean)
            .join(' - ');
          const colorDisplay = colorInfo || 'Renksiz';
          const miktar = Math.abs(variant.quantityChange);
          return `${miktar} adet ${colorDisplay}`;
        });
      
      if (islemYapilan.length > 0) {
        const islemTipi = entry.type === 'increase' ? 'alınan' : 'satılan';
        baseText += `\n\n${islemTipi.charAt(0).toUpperCase() + islemTipi.slice(1)}: ${islemYapilan.join(', ')}`;
      }
    }
    
    return baseText;
  };

  // Stok nedeni modal'ı doğrulama
  const validateStockReason = () => {
    if (!stockChangeReason) {
      setError('Stok değişikliği sebebi seçmelisiniz');
      return false;
    }

    if ((stockChangeType === 'increase' && stockChangeReason === 'return') ||
        (stockChangeType === 'decrease' && stockChangeReason === 'return_to_supplier')) {
      if (!stockChangeDescription.trim()) {
        setError('İade açıklaması girilmelidir');
        return false;
      }
    }

    return true;
  };

  // Stok nedeni seçimini kaydet ve asıl kaydetme işlemini yap
  const handleStockReasonSubmit = async () => {
    if (!validateStockReason()) return;

    try {
      setLoading(true);
      await performActualSave();
      
      // Modal'ı kapat
      setShowStockReasonModal(false);
      setStockChangeReason('');
      setStockChangeDescription('');
      
    } catch (error) {
      console.error('Kaydetme hatası:', error);
      setError('Kaydetme işlemi sırasında hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  // Asıl kaydetme işlemi
  const performActualSave = async () => {
    const productRef = ref(db, `products/${product.id}`);
    
    // Temizlenmiş varyantları hazırla
    const cleanVariants = variants.map(variant => ({
      colorCode: variant.colorCode.trim(),
      colorName: variant.colorName.trim(),
      quantity: parseInt(variant.quantity) || 0
    }));
    
    // Değişiklikleri tespit et
    const oldTotalQuantity = originalTotalQuantity;
    const newTotalQuantity = getTotalQuantity();
    const nameChanged = product.name !== formData.name.trim();
    const categoryChanged = product.category !== formData.category;
    
    // Varyant değişikliklerini detaylı analiz et
    const variantChanges = analyzeVariantChanges(product.variants || [], cleanVariants);

    // Güncelleme verisi
    const updateData = {
      name: formData.name.trim(),
      brand: formData.brand.trim(),
      category: formData.category,
      description: formData.description.trim(),
      variants: cleanVariants,
      totalQuantity: newTotalQuantity,
      lastUpdated: new Date().toISOString()
    };
    
    // Stok geçmişi güncellemesi (eğer stok değişmişse)
    if (hasStockChanged()) {
      // Varyant değişikliklerini analiz et
      const changedVariants = [];
      const oldVariants = product.variants || [];
      
      cleanVariants.forEach((newVariant, index) => {
        const oldVariant = oldVariants[index];
        if (oldVariant && oldVariant.quantity !== newVariant.quantity) {
          const quantityDiff = newVariant.quantity - oldVariant.quantity;
          if (quantityDiff !== 0) {
            changedVariants.push({
              colorCode: newVariant.colorCode || '',
              colorName: newVariant.colorName || '',
              quantityChange: quantityDiff,
              oldQuantity: oldVariant.quantity,
              newQuantity: newVariant.quantity
            });
          }
        }
      });

      const stockEntry = {
        date: new Date().toISOString(),
        type: stockChangeType,
        reason: stockChangeReason,
        quantity: Math.abs(newTotalQuantity - oldTotalQuantity),
        remainingStock: newTotalQuantity, // İşlem sonrası kalan stok
        variantChanges: changedVariants, // Hangi varyantlardan değişiklik oldu
        user: {
          uid: currentUser.uid,
          email: currentUser.email,
          displayName: currentUser.displayName || 'Bilinmeyen Kullanıcı'
        }
      };

      // Sebep açıklamaları
      if ((stockChangeType === 'increase' && stockChangeReason === 'return') ||
          (stockChangeType === 'decrease' && stockChangeReason === 'return_to_supplier')) {
        const reasonParts = stockChangeDescription.split(':');
        stockEntry.returnReason = reasonParts[0]?.trim();
        if (reasonParts[1]) {
          stockEntry.returnDescription = reasonParts[1]?.trim();
        }
      }

      // Stok geçmişini güncelle
      const currentHistory = product.stockHistory || [];
      updateData.stockHistory = [...currentHistory, stockEntry];
    }
    
    // Eski sistemi temizle
    updateData.quantity = null;
    
    await update(productRef, updateData);
    
    // Log kaydı oluştur
    const logDetails = {};
    if (oldTotalQuantity !== newTotalQuantity) {
      logDetails.quantityChange = { from: oldTotalQuantity, to: newTotalQuantity };
      if (hasStockChanged()) {
        logDetails.stockChangeType = stockChangeType;
        logDetails.stockChangeReason = stockChangeReason;
        logDetails.stockChangeDescription = stockChangeDescription;
      }
    }
    if (nameChanged) {
      logDetails.nameChanged = {
        from: product.name,
        to: formData.name.trim()
      };
    }
    if (categoryChanged) {
      logDetails.categoryChanged = {
        from: product.category,
        to: formData.category
      };
    }
    if (variantChanges.hasChanges) {
      logDetails.variantChanges = variantChanges.changes;
    }

    if (Object.keys(logDetails).length > 0) {
      await createLog(
        LOG_ACTIONS.PRODUCT_UPDATED,
        currentUser,
        {
          id: product.id,
          name: formData.name.trim(),
          brand: formData.brand.trim(),
          category: formData.category,
          totalQuantity: newTotalQuantity
        },
        logDetails
      );
    }
    
    onProductUpdated();
    onClose();
  };



  // Form doğrulama
  const validateForm = () => {
    if (!formData.name.trim()) {
      setError('Ürün adı zorunludur');
      return false;
    }
    if (!formData.brand.trim()) {
      setError('Marka adı zorunludur');
      return false;
    }
    if (!formData.category) {
      setError('Kategori seçimi zorunludur');
      return false;
    }
    if (variants.length === 0) {
      setError('En az bir renk çeşidi eklemelisiniz');
      return false;
    }
    // Stok 0 olması normal bir durum (stok tükendi), bu kontrol kaldırıldı
    return true;
  };

  // Form submit - stok kontrolü ile
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!validateForm()) {
      return;
    }

    // Stok değişikliği kontrolü
    if (hasStockChanged()) {
      const currentTotal = getTotalQuantity();
      const changeAmount = currentTotal - originalTotalQuantity;
      
      setStockChangeType(changeAmount > 0 ? 'increase' : 'decrease');
      setStockChangeAmount(Math.abs(changeAmount).toString());
      setShowStockReasonModal(true);
      return;
    }

    // Stok değişikliği yoksa direkt kaydet
    try {
      setLoading(true);
      await performActualSave();
    } catch (error) {
      console.error('Ürün güncellenirken hata oluştu:', error);
      setError('Ürün güncellenirken bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  // Ürün silme işlemi
  const handleDeleteProduct = async () => {
    const confirmMessage = `"${product.name}" ürününü silmek istediğinizden emin misiniz?\n\nBu işlem geri alınamaz!`;
    
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      setLoading(true);
      const productRef = ref(db, `products/${product.id}`);
      
      // Silme işleminden önce log kaydı oluştur
      await createLog(
        LOG_ACTIONS.PRODUCT_DELETED,
        currentUser,
        {
          id: product.id,
          name: product.name,
          brand: product.brand,
          category: product.category,
          totalQuantity: product.totalQuantity || product.quantity || 0
        }
      );
      
      await remove(productRef);
      
      onProductUpdated(); // Ürün listesini yenile
      onClose(); // Modal'ı kapat
      
    } catch (error) {
      console.error('Ürün silinirken hata oluştu:', error);
      setError('Ürün silinirken bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  // Modal dışına tıklama ile kapatma
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Varyant değişikliklerini detaylı analiz eden fonksiyon
  const analyzeVariantChanges = (oldVariants, newVariants) => {
    const changes = {
      added: [],
      modified: [],
      removed: []
    };
    
    // Varyantları karşılaştırmak için unique key oluştur
    const getVariantKey = (variant) => `${variant.colorCode || ''}_${variant.colorName || ''}`;
    
    // Eski varyantları map'e çevir
    const oldVariantMap = new Map();
    (oldVariants || []).forEach(variant => {
      const key = getVariantKey(variant);
      oldVariantMap.set(key, variant);
    });
    
    // Yeni varyantları map'e çevir
    const newVariantMap = new Map();
    newVariants.forEach(variant => {
      const key = getVariantKey(variant);
      newVariantMap.set(key, variant);
    });
    
    // Yeni eklenen varyantları bul
    newVariantMap.forEach((newVariant, key) => {
      if (!oldVariantMap.has(key)) {
        changes.added.push({
          colorCode: newVariant.colorCode || '',
          colorName: newVariant.colorName || '',
          quantity: newVariant.quantity
        });
      }
    });
    
    // Miktarı değişen varyantları bul
    oldVariantMap.forEach((oldVariant, key) => {
      if (newVariantMap.has(key)) {
        const newVariant = newVariantMap.get(key);
        if (oldVariant.quantity !== newVariant.quantity) {
          changes.modified.push({
            colorCode: newVariant.colorCode || '',
            colorName: newVariant.colorName || '',
            oldQuantity: oldVariant.quantity,
            newQuantity: newVariant.quantity
          });
        }
      }
    });
    
    // Silinen varyantları bul
    oldVariantMap.forEach((oldVariant, key) => {
      if (!newVariantMap.has(key)) {
        changes.removed.push({
          colorCode: oldVariant.colorCode || '',
          colorName: oldVariant.colorName || '',
          quantity: oldVariant.quantity
        });
      }
    });
    
    const hasChanges = changes.added.length > 0 || changes.modified.length > 0 || changes.removed.length > 0;
    
    return { hasChanges, changes };
  };

  if (!product) return null;

  return (
    <div className="edit-modal-backdrop" onClick={handleBackdropClick}>
      <div className="edit-modal-content">
        <div className="edit-modal-header">
          <h2>✏️ Ürün Düzenle</h2>
          <button 
            onClick={onClose} 
            className="edit-close-btn"
            disabled={loading}
          >
            ✕
          </button>
        </div>

        {error && <div className="edit-error-message">{error}</div>}

        {/* Ürünü Ekleyen Bilgisi */}
        {product.createdBy && (
          <div className="edit-created-by">
            <span className="edit-created-by-label">Ürünü Ekleyen:</span>
            <span className="edit-created-by-user">
              {product.createdBy.displayName || product.createdBy.email}
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="edit-product-form">
          <div className="edit-form-row">
            <div className="edit-form-group">
              <label htmlFor="edit-name">Ürün Adı *</label>
              <input
                type="text"
                id="edit-name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="Ürün adı"
                disabled={loading}
                required
              />
            </div>

            <div className="edit-form-group">
              <label htmlFor="edit-brand">Marka *</label>
              <input
                type="text"
                id="edit-brand"
                name="brand"
                value={formData.brand}
                onChange={handleInputChange}
                placeholder="Örn: IKEA, Doğtaş, Kelebek"
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className="edit-form-row">
            <div className="edit-form-group">
              <label htmlFor="edit-category">Kategori *</label>
              <select
                id="edit-category"
                name="category"
                value={formData.category}
                onChange={handleInputChange}
                disabled={loading}
                required
              >
                {categories.map(category => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="edit-form-group">
            <label htmlFor="edit-description">Açıklama</label>
            <textarea
              id="edit-description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              placeholder="Ürün açıklaması (isteğe bağlı)"
              rows="3"
              disabled={loading}
            />
          </div>

          {/* Stok Yönetimi */}
          <div className="edit-stock-management">
            <div className="stock-header">
              <h3>Stok Yönetimi</h3>
              <div className="stock-actions">
                <button
                  type="button"
                  onClick={() => setShowStockHistory(!showStockHistory)}
                  className="view-history-btn"
                  disabled={loading}
                >
                  {showStockHistory ? 'Geçmişi Gizle' : 'Stok Geçmişi'}
                </button>
              </div>
            </div>
            <p className="stock-info-text">
              Stok miktarını değiştirmek için aşağıdaki + - butonlarını kullanın. Kaydet butonuna bastığınızda stok değişikliği sebebi sorulacak.
            </p>

            {/* Stok Geçmişi */}
            {showStockHistory && (
              <div className="stock-history">
                <h4>Stok Hareketleri</h4>
                {product.stockHistory && product.stockHistory.length > 0 ? (
                  <div className="stock-history-list">
                    {[...product.stockHistory].reverse().map((entry, index) => (
                      <div key={index} className={`stock-entry ${entry.type}`}>
                        <div className="stock-entry-header">
                          <span className={`stock-type ${entry.type}`}>
                            {entry.type === 'increase' ? '+' : '-'}{entry.quantity}
                          </span>
                          <span className="stock-date">
                            {new Date(entry.date).toLocaleDateString('tr-TR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                        <div className="stock-entry-details">
                          <p className="stock-reason">{getStockReasonText(entry)}</p>
                          <p className="stock-user">
                            {entry.user?.displayName || entry.user?.email}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="no-stock-history">Henüz stok hareketi bulunmuyor.</p>
                )}
              </div>
            )}

            {/* Stok Değişikliği - Artık kullanılmıyor */}
            {false && (
              <div className="stock-change-form">
                {/* Eski stok değişikliği formu - kaldırıldı */}
              </div>
            )}
          </div>

          {/* Renk Çeşitleri */}
          <div className="edit-variants-section">
            <div className="edit-variants-header">
              <label>Renk Çeşitleri *</label>
              <span className="edit-total-quantity">Toplam: {getTotalQuantity()} adet</span>
            </div>
            
            <div className="edit-variants-list">
              {variants.map((variant, index) => (
                <div key={index} className="edit-variant-row">
                  <div className="edit-variant-inputs">
                    <input
                      type="text"
                      placeholder="Renk kodu (isteğe bağlı)"
                      value={variant.colorCode}
                      onChange={(e) => handleVariantChange(index, 'colorCode', e.target.value)}
                      disabled={loading}
                      className="edit-color-code-input"
                    />
                    <input
                      type="text"
                      placeholder="Renk adı (isteğe bağlı)"
                      value={variant.colorName}
                      onChange={(e) => handleVariantChange(index, 'colorName', e.target.value)}
                      disabled={loading}
                      className="edit-color-name-input"
                    />
                    <div className="edit-quantity-container">
                      <button
                        type="button"
                        onClick={() => handleVariantChange(index, 'quantity', Math.max(0, (parseInt(variant.quantity) || 0) - 1))}
                        disabled={loading || (parseInt(variant.quantity) || 0) === 0}
                        className="edit-quantity-btn minus"
                        title="Azalt (-1)"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min="0"
                        placeholder="Adet"
                        value={variant.quantity}
                        onChange={(e) => handleVariantChange(index, 'quantity', e.target.value)}
                        disabled={loading}
                        className="edit-quantity-input"
                        style={{ textAlign: 'center' }}
                      />
                      <button
                        type="button"
                        onClick={() => handleVariantChange(index, 'quantity', (parseInt(variant.quantity) || 0) + 1)}
                        disabled={loading}
                        className="edit-quantity-btn plus"
                        title="Artır (+1)"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeVariant(index)}
                    disabled={loading || variants.length === 1}
                    className="edit-remove-variant-btn"
                    title="Bu rengi sil"
                  >
                    Sil
                  </button>
                </div>
              ))}
            </div>
            
            <button
              type="button"
              onClick={addVariant}
              disabled={loading}
              className="edit-add-variant-btn"
            >
              + Yeni Renk Ekle
            </button>
          </div>

          <div className="edit-form-actions">
            <button 
              type="button" 
              onClick={handleDeleteProduct}
              className="edit-delete-btn"
              disabled={loading}
            >
              {loading ? 'Siliniyor...' : 'Ürünü Sil'}
            </button>
            
            <div className="edit-action-buttons">
              <button 
                type="button" 
                onClick={onClose}
                className="edit-cancel-btn"
                disabled={loading}
              >
                İptal
              </button>
              <button 
                type="submit" 
                className="edit-submit-btn"
                disabled={loading}
              >
                {loading ? 'Güncelleniyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Stok Nedeni Modal'ı */}
      {showStockReasonModal && (
        <div 
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowStockReasonModal(false);
              setStockChangeReason('');
              setStockChangeDescription('');
              setError('');
            }
          }}
        >
          <div className="modal-content stock-reason-modal">
            <div className="modal-header">
              <h3>Stok Değişikliği Sebebi</h3>
              <button 
                type="button" 
                onClick={() => {
                  setShowStockReasonModal(false);
                  setStockChangeReason('');
                  setStockChangeDescription('');
                  setError('');
                }}
                className="modal-close-btn"
                disabled={loading}
              >
                ×
              </button>
            </div>

            <div className="modal-body">
              <div className="stock-change-info">
                <p>
                  <strong>Stok Değişikliği:</strong> {stockChangeAmount} adet{' '}
                  {stockChangeType === 'increase' ? 'artış' : 'azalış'}
                </p>
                <p>
                  <strong>Orijinal Stok:</strong> {originalTotalQuantity} adet
                </p>
                <p>
                  <strong>Yeni Stok:</strong> {getTotalQuantity()} adet
                </p>
              </div>

              <div className="stock-reason-form">
                <div className="form-group">
                  <label>Stok Değişikliği Sebebi *</label>
                  <select
                    value={stockChangeReason}
                    onChange={(e) => setStockChangeReason(e.target.value)}
                    disabled={loading}
                  >
                    <option value="">Seçiniz...</option>
                    {stockChangeType === 'increase' ? (
                      <>
                        <option value="purchase">Satın Alım</option>
                        <option value="return">Ürün İade</option>
                      </>
                    ) : (
                      <>
                        <option value="sold">Ürün Satıldı</option>
                        <option value="return_to_supplier">Ürün Firmaya İade Edildi</option>
                      </>
                    )}
                  </select>
                </div>

                {/* İade açıklaması */}
                {((stockChangeType === 'increase' && stockChangeReason === 'return') ||
                  (stockChangeType === 'decrease' && stockChangeReason === 'return_to_supplier')) && (
                  <div className="form-group">
                    <label>İade Detayı *</label>
                    <select
                      value={stockChangeDescription.split(':')[0] || ''}
                      onChange={(e) => {
                        const reason = e.target.value;
                        if (reason === 'other') {
                          setStockChangeDescription('other:');
                        } else {
                          setStockChangeDescription(reason);
                        }
                      }}
                      disabled={loading}
                    >
                      <option value="">Seçiniz...</option>
                      <option value="wrong_product">Yanlış Ürün</option>
                      <option value="damaged">Bozuk Ürün</option>
                      <option value="other">Diğer</option>
                    </select>
                    
                    {stockChangeDescription.startsWith('other:') && (
                      <textarea
                        value={stockChangeDescription.split(':')[1] || ''}
                        onChange={(e) => setStockChangeDescription(`other:${e.target.value}`)}
                        placeholder="Açıklama giriniz..."
                        rows="3"
                        disabled={loading}
                        className="stock-description-textarea"
                      />
                    )}
                  </div>
                )}

                {error && <div className="error-message">{error}</div>}
              </div>
            </div>

            <div className="modal-footer">
              <button 
                type="button" 
                onClick={() => {
                  setShowStockReasonModal(false);
                  setStockChangeReason('');
                  setStockChangeDescription('');
                  setError('');
                }}
                className="btn-cancel"
                disabled={loading}
              >
                İptal
              </button>
              <button 
                type="button" 
                onClick={handleStockReasonSubmit}
                className="btn-primary"
                disabled={loading}
              >
                {loading ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProductEditModal; 