// Yeni ürün ekleme formu (Modal)
import React, { useState } from 'react';
import { ref, push } from 'firebase/database';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { createLog, LOG_ACTIONS } from '../utils/logging';
import './ProductEditModal.css';

function AddProductForm({ onClose, onProductAdded }) {
  const { currentUser } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    brand: '',
    category: 'yatak',
    description: ''
  });
  const [variants, setVariants] = useState([
    { colorCode: '', colorName: '', quantity: '' }
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Stok giriş sebepleri
  const [stockReason, setStockReason] = useState('purchase'); // 'purchase' | 'return'
  const [returnReason, setReturnReason] = useState(''); // 'wrong_product' | 'damaged' | 'other'
  const [returnDescription, setReturnDescription] = useState('');

  // Kategoriler listesi
  const categories = [
    { id: 'yatak', name: 'Yatak' },
    { id: 'kanepe', name: 'Kanepe' },
    { id: 'koltuk', name: 'Koltuk' },
    { id: 'masa', name: 'Masa/Sehpa' },
    { id: 'sandalye', name: 'Sandalye' },
    { id: 'dolap', name: 'Dolap' },
    { id: 'diger', name: 'Diğer' }
  ];

  // Form input değişikliklerini yakala
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Varyant (renk) işlemleri
  const handleVariantChange = (index, field, value) => {
    setVariants(prev => prev.map((variant, i) => 
      i === index ? { ...variant, [field]: value } : variant
    ));
  };

  const addVariant = () => {
    setVariants(prev => [...prev, { colorCode: '', colorName: '', quantity: '' }]);
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
    
    // Varyant doğrulama
    for (let i = 0; i < variants.length; i++) {
      const variant = variants[i];
      if (!variant.quantity || variant.quantity < 0) {
        setError(`${i + 1}. varyantın adet sayısı geçerli olmalıdır`);
        return false;
      }
    }
    
    const totalQty = getTotalQuantity();
    if (totalQty === 0) {
      setError('En az 1 adet ürün eklenmelidir');
      return false;
    }
    
    // Stok giriş sebep doğrulama
    if (!stockReason) {
      setError('Stok giriş sebebi seçilmelidir');
      return false;
    }
    
    if (stockReason === 'return' && !returnReason) {
      setError('İade sebebi seçilmelidir');
      return false;
    }
    
    if (stockReason === 'return' && returnReason === 'other' && !returnDescription.trim()) {
      setError('İade açıklaması girilmelidir');
      return false;
    }
    
    return true;
  };

  // Form gönderme
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!validateForm()) {
      return;
    }

    try {
      setLoading(true);
      
      // Realtime Database'e yeni ürün ekle
      const productsRef = ref(db, 'products');
      
      // Varyantları temizle ve düzenle
      const cleanVariants = variants.map(variant => ({
        colorCode: variant.colorCode.trim(),
        colorName: variant.colorName.trim(),
        quantity: parseInt(variant.quantity)
      }));
      
      // Stok giriş bilgilerini hazırla
      const totalQuantity = getTotalQuantity();
      const stockEntry = {
        date: new Date().toISOString(),
        type: 'increase',
        reason: stockReason,
        quantity: totalQuantity,
        remainingStock: totalQuantity, // İlk giriş olduğu için kalan stok = toplam stok
        variantChanges: cleanVariants.map(variant => ({
          colorCode: variant.colorCode || '',
          colorName: variant.colorName || '',
          quantityChange: variant.quantity,
          oldQuantity: 0,
          newQuantity: variant.quantity
        })),
        user: {
          uid: currentUser.uid,
          email: currentUser.email,
          displayName: currentUser.displayName || 'Bilinmeyen Kullanıcı'
        }
      };
      
      // İade sebebi varsa ekle
      if (stockReason === 'return') {
        stockEntry.returnReason = returnReason;
        if (returnReason === 'other' && returnDescription.trim()) {
          stockEntry.returnDescription = returnDescription.trim();
        }
      }

      const newProductData = {
        name: formData.name.trim(),
        brand: formData.brand.trim(),
        category: formData.category,
        description: formData.description.trim(),
        variants: cleanVariants,
        totalQuantity: getTotalQuantity(),
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        createdBy: {
          uid: currentUser.uid,
          email: currentUser.email,
          displayName: currentUser.displayName || 'Bilinmeyen Kullanıcı'
        },
        stockHistory: [stockEntry] // İlk stok giriş kaydı
      };

      const newProductRef = await push(productsRef, newProductData);
      
      // Log kaydı oluştur
      await createLog(
        LOG_ACTIONS.PRODUCT_CREATED,
        currentUser,
        {
          id: newProductRef.key,
          name: newProductData.name,
          brand: newProductData.brand,
          category: newProductData.category,
          totalQuantity: newProductData.totalQuantity
        },
        {
          stockReason: stockReason,
          returnReason: stockReason === 'return' ? returnReason : null,
          returnDescription: stockReason === 'return' && returnReason === 'other' ? returnDescription : null
        }
      );

      // Başarı durumunda
      onProductAdded(); // Ürün listesini yenile
      onClose(); // Modal'ı kapat
    } catch (error) {
      console.error('Ürün eklenirken hata oluştu:', error);
      setError('Ürün eklenirken bir hata oluştu. Lütfen tekrar deneyin.');
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

  return (
    <div className="edit-modal-backdrop" onClick={handleBackdropClick}>
      <div className="edit-modal-content">
        <div className="edit-modal-header">
          <h2>➕ Yeni Ürün Ekle</h2>
          <button 
            onClick={onClose} 
            className="edit-close-btn"
            disabled={loading}
          >
            ✕
          </button>
        </div>

        {error && <div className="edit-error-message">{error}</div>}

        <form onSubmit={handleSubmit} className="edit-product-form">
          <div className="edit-form-row">
            <div className="edit-form-group">
              <label htmlFor="name">Ürün Adı *</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="Örn: 90x190 Stress Out"
                disabled={loading}
                required
              />
            </div>

            <div className="edit-form-group">
              <label htmlFor="brand">Marka *</label>
              <input
                type="text"
                id="brand"
                name="brand"
                value={formData.brand}
                onChange={handleInputChange}
                placeholder="Örn: Özgür, Vivinza"
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className="edit-form-row">
            <div className="edit-form-group">
              <label htmlFor="category">Kategori *</label>
              <select
                id="category"
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
            <label htmlFor="description">Açıklama</label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              placeholder="Ürün hakkında detaylar (isteğe bağlı)"
              rows="3"
              disabled={loading}
            />
          </div>

          {/* Stok Giriş Sebebi */}
          <div className="edit-form-group">
            <label htmlFor="stockReason">Stok Giriş Sebebi *</label>
            <select
              id="stockReason"
              value={stockReason}
              onChange={(e) => setStockReason(e.target.value)}
              disabled={loading}
              required
            >
              <option value="purchase">Satın Alım</option>
              <option value="return">Ürün İade</option>
            </select>
          </div>

          {/* İade Sebebi (sadece iade seçildiğinde) */}
          {stockReason === 'return' && (
            <>
              <div className="edit-form-group">
                <label htmlFor="returnReason">İade Sebebi *</label>
                <select
                  id="returnReason"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  disabled={loading}
                  required
                >
                  <option value="">Seçiniz...</option>
                  <option value="wrong_product">Yanlış Ürün</option>
                  <option value="damaged">Bozuk Ürün</option>
                  <option value="other">Diğer</option>
                </select>
              </div>

              {/* İade Açıklaması (sadece diğer seçildiğinde) */}
              {returnReason === 'other' && (
                <div className="edit-form-group">
                  <label htmlFor="returnDescription">İade Açıklaması *</label>
                  <textarea
                    id="returnDescription"
                    value={returnDescription}
                    onChange={(e) => setReturnDescription(e.target.value)}
                    placeholder="İade sebebini açıklayın..."
                    rows="3"
                    disabled={loading}
                    required
                  />
                </div>
              )}
            </>
          )}

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
                        type="text"
                        inputMode="text"
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
                {loading ? 'Ekleniyor...' : 'Ürün Ekle'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddProductForm; 