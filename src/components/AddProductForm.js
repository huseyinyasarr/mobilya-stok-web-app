import React, { useState } from 'react';
import { ref, push } from 'firebase/database';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { createLog, LOG_ACTIONS } from '../utils/logging';
import { CATEGORIES, VariantsEditor, StockReasonSelector, BrandInput, CategoryInput } from './ProductFormFields';
import './ProductEditModal.css';

function AddProductForm({ onClose, onProductAdded, brands = [] }) {
  const { currentUser } = useAuth();

  const [formData, setFormData] = useState({
    name: '',
    brand: '',
    category: 'yatak',
    description: '',
  });
  const [variants, setVariants] = useState([
    { colorCode: '', colorName: '', quantity: '' },
  ]);
  const [stockReasonData, setStockReasonData] = useState({
    stockReason: 'purchase',
    returnReason: '',
    returnDescription: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const getTotalQuantity = () =>
    variants.reduce((total, v) => total + (parseInt(v.quantity) || 0), 0);

  const validateForm = () => {
    if (!formData.name.trim()) { setError('Ürün adı zorunludur'); return false; }
    if (!formData.brand.trim()) { setError('Marka adı zorunludur'); return false; }
    if (!formData.category) { setError('Kategori seçimi zorunludur'); return false; }

    for (let i = 0; i < variants.length; i++) {
      if (!variants[i].quantity || variants[i].quantity < 0) {
        setError(`${i + 1}. varyantın adet sayısı geçerli olmalıdır`);
        return false;
      }
    }
    if (getTotalQuantity() === 0) { setError('En az 1 adet ürün eklenmelidir'); return false; }
    if (!stockReasonData.stockReason) { setError('Stok giriş sebebi seçilmelidir'); return false; }
    if (stockReasonData.stockReason === 'return' && !stockReasonData.returnReason) {
      setError('İade sebebi seçilmelidir'); return false;
    }
    if (
      stockReasonData.stockReason === 'return' &&
      stockReasonData.returnReason === 'other' &&
      !stockReasonData.returnDescription.trim()
    ) {
      setError('İade açıklaması girilmelidir'); return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!validateForm()) return;

    try {
      setLoading(true);
      const productsRef = ref(db, 'products');

      const cleanVariants = variants.map((v) => ({
        colorCode: v.colorCode.trim(),
        colorName: v.colorName.trim(),
        quantity: parseInt(v.quantity),
      }));
      const totalQuantity = getTotalQuantity();

      const stockEntry = {
        date: new Date().toISOString(),
        type: 'increase',
        reason: stockReasonData.stockReason,
        quantity: totalQuantity,
        remainingStock: totalQuantity,
        variantChanges: cleanVariants.map((v) => ({
          colorCode: v.colorCode || '',
          colorName: v.colorName || '',
          quantityChange: v.quantity,
          oldQuantity: 0,
          newQuantity: v.quantity,
        })),
        user: {
          uid: currentUser.uid,
          email: currentUser.email,
          displayName: currentUser.displayName || 'Bilinmeyen Kullanıcı',
        },
      };

      if (stockReasonData.stockReason === 'return') {
        stockEntry.returnReason = stockReasonData.returnReason;
        if (stockReasonData.returnReason === 'other' && stockReasonData.returnDescription.trim()) {
          stockEntry.returnDescription = stockReasonData.returnDescription.trim();
        }
      }

      const newProductData = {
        name: formData.name.trim(),
        brand: formData.brand.trim(),
        category: formData.category,
        description: formData.description.trim(),
        variants: cleanVariants,
        totalQuantity,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        createdBy: {
          uid: currentUser.uid,
          email: currentUser.email,
          displayName: currentUser.displayName || 'Bilinmeyen Kullanıcı',
        },
        stockHistory: [stockEntry],
      };

      const newProductRef = await push(productsRef, newProductData);

      await createLog(
        LOG_ACTIONS.PRODUCT_CREATED,
        currentUser,
        {
          id: newProductRef.key,
          name: newProductData.name,
          brand: newProductData.brand,
          category: newProductData.category,
          totalQuantity: newProductData.totalQuantity,
        },
        {
          stockReason: stockReasonData.stockReason,
          returnReason:
            stockReasonData.stockReason === 'return' ? stockReasonData.returnReason : null,
          returnDescription:
            stockReasonData.stockReason === 'return' &&
            stockReasonData.returnReason === 'other'
              ? stockReasonData.returnDescription
              : null,
        }
      );

      onProductAdded();
      onClose();
    } catch (err) {
      console.error('Ürün eklenirken hata oluştu:', err);
      setError('Ürün eklenirken bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="edit-modal-backdrop" onClick={handleBackdropClick}>
      <div className="edit-modal-content">
        <div className="edit-modal-header">
          <h2>➕ Yeni Ürün Ekle</h2>
          <button onClick={onClose} className="edit-close-btn" disabled={loading}>
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
              <BrandInput
                value={formData.brand}
                onChange={(val) => setFormData((prev) => ({ ...prev, brand: val }))}
                brands={brands}
                disabled={loading}
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

          <StockReasonSelector
            value={stockReasonData}
            onChange={setStockReasonData}
            mode="increase"
            disabled={loading}
          />

          <VariantsEditor
            variants={variants}
            onChange={setVariants}
            mode="quantity"
            disabled={loading}
          />

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
              <button type="submit" className="edit-submit-btn" disabled={loading}>
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
