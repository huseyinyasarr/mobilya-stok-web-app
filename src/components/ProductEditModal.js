// Ürün düzenleme modal component'i
import React, { useState, useEffect } from 'react';
import { ref, update, remove } from 'firebase/database';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { createLog, LOG_ACTIONS } from '../utils/logging';
import { buildUserRef } from '../utils/productService';
import { BrandInput, CategoryInput, VariantsEditor } from './ProductFormFields';
import ConfirmDialog from './ConfirmDialog';
import './ProductEditModal.css';

function ProductEditModal({ product, onClose, onProductUpdated, brands = [] }) {
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

  // Varyant verileri (delta formatı - Toplu Giriş ile aynı)
  const buildDeltaVariants = (prod) => {
    if (prod.variants && prod.variants.length > 0) {
      return prod.variants.map((v) => ({
        colorCode: v.colorCode || '',
        colorName: v.colorName || '',
        varyans: v.varyans || '',
        originalColorCode: v.colorCode || '',
        originalColorName: v.colorName || '',
        originalVaryans: v.varyans || '',
        delta: '',
        currentQty: v.quantity || 0,
        stockReason: '',
        returnReason: '',
        returnDescription: '',
      }));
    }
    return [{
      colorCode: '',
      colorName: '',
      varyans: '',
      originalColorCode: '',
      originalColorName: '',
      originalVaryans: '',
      delta: '',
      currentQty: prod.quantity || 0,
      stockReason: '',
      returnReason: '',
      returnDescription: '',
    }];
  };
  const [deltaVariants, setDeltaVariants] = useState(() => buildDeltaVariants(product));
  
  // Orijinal stok miktarlarını takip et
  const [originalTotalQuantity, setOriginalTotalQuantity] = useState(0);
  
  // Stok geçmişi görüntüleme
  const [showStockHistory, setShowStockHistory] = useState(false);
  
  const [hasVariantConflicts, setHasVariantConflicts] = useState(false);

  // Kapatma uyarısı — kaydedilmemiş değişiklik varsa ConfirmDialog göster
  const [closeConfirm, setCloseConfirm] = useState(false);

  const getCleanVariantsFromDelta = () =>
    deltaVariants
      .filter((v) => !v.isDeleting)
      .map((v) => ({
        colorCode: (v.colorCode || '').trim(),
        colorName: (v.colorName || '').trim(),
        varyans: (v.varyans || '').trim(),
        quantity: (v.currentQty || 0) + (parseInt(v.delta) || 0),
      }));

  const isFormDirty = () => {
    if (formData.name.trim() !== (product.name || '').trim()) return true;
    if (formData.brand.trim() !== (product.brand || '').trim()) return true;
    if (formData.category !== (product.category || '')) return true;
    if (formData.description.trim() !== (product.description || '').trim()) return true;
    const clean = getCleanVariantsFromDelta();
    const oldV = product.variants || [];
    if (clean.length !== oldV.length) return true;
    for (let i = 0; i < clean.length; i++) {
      const v = clean[i];
      const o = oldV[i] || {};
      if ((v.colorCode || '').trim() !== (o.colorCode || '').trim()) return true;
      if ((v.colorName || '').trim() !== (o.colorName || '').trim()) return true;
      if ((v.varyans || '').trim() !== (o.varyans || '').trim()) return true;
      if ((parseInt(v.quantity) || 0) !== (parseInt(o.quantity) || 0)) return true;
    }
    return false;
  };

  const handleRequestClose = () => {
    if (loading) return;
    if (isFormDirty()) {
      setCloseConfirm(true);
    } else {
      onClose();
    }
  };

  // Ürün değiştiğinde state'leri sıfırla
  useEffect(() => {
    const initialTotal = (product.variants || []).reduce((total, variant) => {
      return total + (parseInt(variant.quantity) || 0);
    }, 0);
    setOriginalTotalQuantity(initialTotal);
    setDeltaVariants(buildDeltaVariants(product));
  }, [product]);

  // Form input değişikliklerini handle et
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Toplam adet hesaplama (delta formatından)
  const getTotalQuantity = () => {
    return deltaVariants
      .filter((v) => !v.isDeleting)
      .reduce((total, v) => total + (v.currentQty || 0) + (parseInt(v.delta) || 0), 0);
  };

  // Stok değişikliği olup olmadığını kontrol et
  const hasStockChanged = () => {
    const currentTotal = getTotalQuantity();
    return currentTotal !== originalTotalQuantity;
  };

  const REASON_LABELS = { purchase: 'Satın Alım', return: 'Ürün İade', sold: 'Satıldı', return_to_supplier: 'Firmaya İade' };

  // Stok geçmişi formatlama
  const getStockReasonText = (entry) => {
    let baseText = '';
    
    // Per-variant sebepler (yeni format)
    if (entry.reason === 'per_variant' && entry.variantChanges?.length > 0) {
      const parts = entry.variantChanges
        .filter((v) => v.quantityChange !== 0)
        .map((v) => {
          const colorInfo = [v.colorCode, v.colorName, v.varyans].filter(Boolean).join(' - ') || 'Renksiz';
          const reasonLabel = REASON_LABELS[v.stockReason] || v.stockReason;
          return `${colorInfo}: ${reasonLabel}`;
        });
      if (parts.length > 0) baseText = parts.join('\n');
    }
    // Eski format: tek sebep
    else if (entry.type === 'increase' && entry.reason === 'return') {
      if (entry.returnReason === 'wrong_product') baseText = 'Yanlış Ürün';
      else if (entry.returnReason === 'damaged') baseText = 'Bozuk Ürün';
      else if (entry.returnReason === 'other') baseText = 'Diğer';
      if (entry.returnDescription) baseText += `: ${entry.returnDescription}`;
    } else if (entry.type === 'decrease' && entry.reason === 'return_to_supplier') {
      if (entry.returnReason === 'wrong_product') baseText = 'Yanlış Ürün';
      else if (entry.returnReason === 'damaged') baseText = 'Bozuk Ürün';
      else if (entry.returnReason === 'other') baseText = 'Diğer';
      if (entry.returnDescription) baseText += `: ${entry.returnDescription}`;
    } else if (entry.reason && entry.reason !== 'per_variant') {
      baseText = REASON_LABELS[entry.reason] || entry.reason;
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
          const colorInfo = [variant.colorCode, variant.colorName, variant.varyans]
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
          const colorInfo = [variant.colorCode, variant.colorName, variant.varyans]
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

  // Per-variant stok sebebi doğrulama (Toplu Giriş ile aynı mantık)
  const validatePerVariantReasons = () => {
    const validIncrease = ['purchase', 'return'];
    const validDecrease = ['sold', 'return_to_supplier'];
    for (let i = 0; i < deltaVariants.length; i++) {
      const v = deltaVariants[i];
      const delta = parseInt(v.delta) || 0;
      if (delta === 0) continue;
      const mode = delta > 0 ? 'increase' : 'decrease';
      const validReasons = mode === 'increase' ? validIncrease : validDecrease;
      if (!validReasons.includes(v.stockReason)) {
        const label = v.colorName || v.colorCode || `${i + 1}. renk`;
        setError(`"${label}" için stok sebebi seçilmelidir.`);
        return false;
      }
      const needsReturn = v.stockReason === 'return' || v.stockReason === 'return_to_supplier';
      if (needsReturn && !v.returnReason) {
        const label = v.colorName || v.colorCode || `${i + 1}. renk`;
        setError(`"${label}" için iade sebebi seçilmelidir.`);
        return false;
      }
      if (needsReturn && v.returnReason === 'other' && !(v.returnDescription || '').trim()) {
        const label = v.colorName || v.colorCode || `${i + 1}. renk`;
        setError(`"${label}" için iade açıklaması girilmelidir.`);
        return false;
      }
    }
    return true;
  };

  // Asıl kaydetme işlemi
  const performActualSave = async () => {
    const productRef = ref(db, `products/${product.id}`);
    
    const cleanVariants = getCleanVariantsFromDelta();
    
    // Değişiklikleri tespit et
    const oldTotalQuantity = originalTotalQuantity;
    const newTotalQuantity = getTotalQuantity();
    const nameChanged = (product.name || '').trim() !== formData.name.trim();
    const brandChanged = (product.brand || '').trim() !== formData.brand.trim();
    const categoryChanged = (product.category || '') !== formData.category;
    const descriptionChanged = (product.description || '').trim() !== formData.description.trim();
    
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
    
    // Stok geçmişi güncellemesi (eğer stok değişmişse) — per-variant sebepler
    if (hasStockChanged()) {
      const changedVariants = deltaVariants
        .filter((v) => !v.isDeleting && (parseInt(v.delta) || 0) !== 0)
        .map((v) => {
          const d = parseInt(v.delta) || 0;
          const oldQty = v.currentQty || 0;
          const newQty = oldQty + d;
          const entry = {
            colorCode: v.colorCode || '',
            colorName: v.colorName || '',
            varyans: (v.varyans || '').trim(),
            quantityChange: d,
            oldQuantity: oldQty,
            newQuantity: newQty,
            stockReason: v.stockReason || null,
            returnReason: v.returnReason || null,
            returnDescription: v.returnDescription || null,
          };
          return entry;
        });

      const stockEntry = {
        date: new Date().toISOString(),
        type: newTotalQuantity >= oldTotalQuantity ? 'increase' : 'decrease',
        reason: 'per_variant',
        quantity: Math.abs(newTotalQuantity - oldTotalQuantity),
        remainingStock: newTotalQuantity,
        variantChanges: changedVariants,
        user: buildUserRef(currentUser),
      };

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
        logDetails.stockChangeType = 'per_variant';
      }
    }
    if (nameChanged) {
      logDetails.nameChanged = { from: product.name || '', to: formData.name.trim() };
    }
    if (brandChanged) {
      logDetails.brandChanged = { from: product.brand || '', to: formData.brand.trim() };
    }
    if (categoryChanged) {
      logDetails.categoryChanged = { from: product.category || '', to: formData.category };
    }
    if (descriptionChanged) {
      logDetails.descriptionChanged = { from: product.description || '', to: formData.description.trim() };
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
    if (deltaVariants.filter((v) => !v.isDeleting).length === 0) {
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
    if (hasVariantConflicts) {
      setError('Çeşitlerdeki çakışmalar çözülmeden devam edilemez.');
      return;
    }

    // Stok değişikliği varsa per-variant sebep doğrulaması
    if (hasStockChanged() && !validatePerVariantReasons()) {
      return;
    }

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

  // Modal dışına tıklama ile kapatma — kaydedilmemiş değişiklik varsa uyarı göster
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      handleRequestClose();
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
            onClick={handleRequestClose} 
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
              <BrandInput
                value={formData.brand}
                onChange={(val) => setFormData((prev) => ({ ...prev, brand: val }))}
                brands={brands}
                disabled={loading}
                placeholder="Örn: IKEA, Doğtaş, Kelebek"
              />
            </div>
          </div>

          <div className="edit-form-row">
            <div className="edit-form-group">
              <label>Kategori *</label>
              <CategoryInput
                value={formData.category}
                onChange={(id) => setFormData((prev) => ({ ...prev, category: id }))}
                disabled={loading}
              />
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

          {/* Çeşitler — Toplu Giriş ile aynı delta modu + per-variant sebep */}
          <VariantsEditor
            variants={deltaVariants}
            onChange={setDeltaVariants}
            mode="delta"
            disabled={loading}
            onConflictsChange={setHasVariantConflicts}
            perVariantReason
          />

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
                onClick={handleRequestClose}
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

      {closeConfirm && (
        <ConfirmDialog
          message="Yapılan değişiklikler kaydedilmeyecek. Çıkmak istiyor musunuz?"
          onConfirm={onClose}
          onCancel={() => setCloseConfirm(false)}
          confirmLabel="Çık"
          cancelLabel="Devam Et"
          variant="neutral"
        />
      )}

    </div>
  );
}

export default ProductEditModal; 