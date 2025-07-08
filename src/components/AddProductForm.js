// Yeni ürün ekleme formu (Modal)
import React, { useState } from 'react';
import { ref, push } from 'firebase/database';
import { db } from '../firebase';
import './AddProductForm.css';

function AddProductForm({ onClose, onProductAdded }) {
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

  // Kategoriler listesi
  const categories = ['yatak', 'kanepe', 'koltuk', 'masa', 'sandalye', 'dolap', 'diğer'];

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
      
      await push(productsRef, {
        name: formData.name.trim(),
        brand: formData.brand.trim(),
        category: formData.category,
        description: formData.description.trim(),
        variants: cleanVariants,
        totalQuantity: getTotalQuantity(),
        createdAt: new Date().toISOString()
      });

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
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-content">
        <div className="modal-header">
          <h2>Yeni Ürün Ekle</h2>
          <button 
            onClick={onClose} 
            className="close-btn"
            disabled={loading}
          >
            ✕
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit} className="add-product-form">
          <div className="form-group">
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

          <div className="form-group">
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

          <div className="form-group variants-section">
            <div className="variants-header">
              <label>Renk Çeşitleri *</label>
              <span className="total-quantity">Toplam: {getTotalQuantity()} adet</span>
            </div>
            
            {variants.map((variant, index) => (
              <div key={index} className="variant-row">
                <div className="variant-inputs">
                  <input
                    type="text"
                    placeholder="Renk kodu (isteğe bağlı)"
                    value={variant.colorCode}
                    onChange={(e) => handleVariantChange(index, 'colorCode', e.target.value)}
                    disabled={loading}
                    className="color-code-input"
                  />
                  <input
                    type="text"
                    placeholder="Renk adı (isteğe bağlı)"
                    value={variant.colorName}
                    onChange={(e) => handleVariantChange(index, 'colorName', e.target.value)}
                    disabled={loading}
                    className="color-name-input"
                  />
                  <input
                    type="number"
                    placeholder="Adet"
                    value={variant.quantity}
                    onChange={(e) => handleVariantChange(index, 'quantity', e.target.value)}
                    min="0"
                    disabled={loading}
                    className="quantity-input"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeVariant(index)}
                  disabled={loading || variants.length === 1}
                  className="remove-variant-btn"
                  title="Bu rengi sil"
                >
                  Sil
                </button>
              </div>
            ))}
            
            <button
              type="button"
              onClick={addVariant}
              disabled={loading}
              className="add-variant-btn"
            >
              + Yeni Renk Ekle
            </button>
          </div>

          <div className="form-group">
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
                <option key={category} value={category}>
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
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

          <div className="form-actions">
            <button 
              type="button" 
              onClick={onClose}
              className="cancel-btn"
              disabled={loading}
            >
              İptal
            </button>
            <button 
              type="submit" 
              className="submit-btn"
              disabled={loading}
            >
              {loading ? 'Ekleniyor...' : 'Ürün Ekle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddProductForm; 