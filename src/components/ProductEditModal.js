// Ürün düzenleme modal component'i
import React, { useState, useEffect } from 'react';
import { ref, update, remove } from 'firebase/database';
import { db } from '../firebase';
import { validateInput, rateLimiter, checkFirebaseAuth } from '../utils/security';
import { useAuth } from '../contexts/AuthContext';
import './ProductEditModal.css';

function ProductEditModal({ product, onClose, onProductUpdated }) {
  const { currentUser } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    brand: '',
    category: 'yatak',
    description: ''
  });
  const [variants, setVariants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Kategoriler listesi
  const categories = ['yatak', 'kanepe', 'koltuk', 'masa', 'sandalye', 'dolap', 'diğer'];

  // Modal açıldığında ürün verilerini yükle
  useEffect(() => {
    if (product) {
      setFormData({
        name: product.name,
        brand: product.brand || '',
        category: product.category,
        description: product.description || ''
      });

      // Varyantları yükle
      if (product.variants && product.variants.length > 0) {
        setVariants([...product.variants]);
      } else {
        // Eski sistem için tek varyant oluştur
        setVariants([{
          colorCode: '',
          colorName: 'Standart',
          quantity: product.quantity || 0
        }]);
      }
    }
  }, [product]);

  // Form input değişikliklerini yakala
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Varyant işlemleri
  const handleVariantChange = (index, field, value) => {
    setVariants(prev => prev.map((variant, i) => 
      i === index ? { ...variant, [field]: value } : variant
    ));
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

  // Güvenli form doğrulama
  const validateForm = () => {
    try {
      // Kullanıcı authentication kontrolü
      checkFirebaseAuth(currentUser);
      
      // Rate limiting kontrolü (edit için daha az kısıtlayıcı)
      rateLimiter.check('edit_product', 10, 60000); // 10 edit/dakika
      
      // Input sanitization ve validation
      const sanitizedName = validateInput.productName(formData.name);
      const sanitizedBrand = validateInput.brandName(formData.brand);
      const sanitizedDescription = validateInput.description(formData.description);
      
      if (!formData.category) {
        setError('Kategori seçimi zorunludur');
        return false;
      }
      
      // Varyant doğrulama
      for (let i = 0; i < variants.length; i++) {
        const variant = variants[i];
        
        try {
          validateInput.colorCode(variant.colorCode);
          validateInput.colorName(variant.colorName);
          validateInput.quantity(variant.quantity);
        } catch (validationError) {
          setError(`${i + 1}. renk: ${validationError.message}`);
          return false;
        }
      }
      
      return {
        name: sanitizedName,
        brand: sanitizedBrand,
        description: sanitizedDescription
      };
      
    } catch (securityError) {
      setError(securityError.message);
      return false;
    }
  };

  // Güvenli form gönderme
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const validationResult = validateForm();
    if (!validationResult) {
      return;
    }

    try {
      setLoading(true);
      
      // Ownership kontrolü (ürünün sahibi mi?)
      if (product.createdBy && product.createdBy !== currentUser.uid) {
        throw new Error('Bu ürünü düzenleme yetkiniz yok');
      }
      
      const productRef = ref(db, `products/${product.id}`);
      
      // Güvenli varyant sanitization
      const cleanVariants = variants.map((variant, index) => {
        try {
          return {
            colorCode: validateInput.colorCode(variant.colorCode),
            colorName: validateInput.colorName(variant.colorName),
            quantity: validateInput.quantity(variant.quantity)
          };
        } catch (err) {
          throw new Error(`Varyant ${index + 1}: ${err.message}`);
        }
      });
      
      // Güvenli güncelleme verisi
      const updateData = {
        name: validationResult.name,
        brand: validationResult.brand,
        category: formData.category,
        description: validationResult.description,
        variants: cleanVariants,
        totalQuantity: getTotalQuantity(),
        lastUpdatedAt: new Date().toISOString(),
        lastUpdatedBy: currentUser.uid,
        lastUpdatedByEmail: currentUser.email
      };
      
      // Eski sistemi temizle
      updateData.quantity = null;
      
      await update(productRef, updateData);
      
      onProductUpdated(); // Ürün listesini yenile
      onClose(); // Modal'ı kapat
      
    } catch (error) {
      console.error('Ürün güncellenirken hata oluştu:', error);
      if (error.message.includes('yetkiniz') || error.message.includes('Varyant')) {
        setError(error.message);
      } else {
        setError('Ürün güncellenirken bir hata oluştu. Lütfen tekrar deneyin.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Güvenli ürün silme işlemi
  const handleDeleteProduct = async () => {
    try {
      // Kullanıcı authentication kontrolü
      checkFirebaseAuth(currentUser);
      
      // Rate limiting kontrolü (silme işlemi için daha sıkı)
      rateLimiter.check('delete_product', 3, 60000); // 3 silme/dakika
      
      // Ownership kontrolü (ürünün sahibi mi?)
      if (product.createdBy && product.createdBy !== currentUser.uid) {
        setError('Bu ürünü silme yetkiniz yok');
        return;
      }
      
      const confirmMessage = `"${product.name}" ürününü silmek istediğinizden emin misiniz?\n\nBu işlem geri alınamaz!`;
      
      if (!window.confirm(confirmMessage)) {
        return;
      }

      setLoading(true);
      const productRef = ref(db, `products/${product.id}`);
      await remove(productRef);
      
      onProductUpdated(); // Ürün listesini yenile
      onClose(); // Modal'ı kapat
      
    } catch (error) {
      console.error('Ürün silinirken hata oluştu:', error);
      if (error.message.includes('yetkiniz') || error.message.includes('fazla deneme')) {
        setError(error.message);
      } else {
        setError('Ürün silinirken bir hata oluştu. Lütfen tekrar deneyin.');
      }
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
                  <option key={category} value={category}>
                    {category.charAt(0).toUpperCase() + category.slice(1)}
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
                      placeholder="Renk kodu (örn: 0046)"
                      value={variant.colorCode}
                      onChange={(e) => handleVariantChange(index, 'colorCode', e.target.value)}
                      disabled={loading}
                      className="edit-color-code-input"
                    />
                    <input
                      type="text"
                      placeholder="Renk adı (örn: Gri)"
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
                        placeholder="Adet"
                        value={variant.quantity}
                        onChange={(e) => handleVariantChange(index, 'quantity', e.target.value)}
                        min="0"
                        disabled={loading}
                        className="edit-quantity-input"
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
    </div>
  );
}

export default ProductEditModal; 