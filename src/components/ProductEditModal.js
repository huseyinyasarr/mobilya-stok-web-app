// Ürün düzenleme modal component'i
import React, { useState, useEffect } from 'react';
import { ref, update, remove } from 'firebase/database';
import { db } from '../firebase';
import './ProductEditModal.css';

function ProductEditModal({ product, onClose, onProductUpdated }) {
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
      if (variant.quantity < 0) {
        setError(`${i + 1}. varyantın adet sayısı geçerli olmalıdır`);
        return false;
      }
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
      const productRef = ref(db, `products/${product.id}`);
      
      // Temizlenmiş varyantları hazırla
      const cleanVariants = variants.map(variant => ({
        colorCode: variant.colorCode.trim(),
        colorName: variant.colorName.trim(),
        quantity: parseInt(variant.quantity) || 0
      }));
      
      // Güncelleme verisi
      const updateData = {
        name: formData.name.trim(),
        brand: formData.brand.trim(),
        category: formData.category,
        description: formData.description.trim(),
        variants: cleanVariants,
        totalQuantity: getTotalQuantity()
      };
      
      // Eski sistemi temizle
      updateData.quantity = null;
      
      await update(productRef, updateData);
      
      onProductUpdated(); // Ürün listesini yenile
      onClose(); // Modal'ı kapat
      
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