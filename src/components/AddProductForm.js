import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  saveProduct,
  saveProductResolved,
  applyConflictResolutions,
} from '../utils/productService';
import { VariantsEditor, BrandInput, CategoryInput } from './ProductFormFields';
import ConfirmDialog from './ConfirmDialog';
import './ProductEditModal.css';

// ── Çakışma Çözüm Paneli ──────────────────────────────────────────────────────
function ConflictResolutionPanel({ conflicts, resolutions, onResolutionChange, onConfirm, onCancel, loading }) {
  const allResolved = conflicts.every((_, i) => resolutions[i]);

  return (
    <div className="edit-conflict-panel">
      <div className="edit-conflict-panel-header">
        <span className="edit-conflict-icon">⚠</span>
        <div>
          <strong>Renk Varyantı Çakışması</strong>
          <p>
            Bu ürün kayıtlarda mevcut. {conflicts.length} renk{' '}
            {conflicts.length > 1 ? 'çakışması' : 'çakışması'} tespit edildi.
            Her biri için nasıl devam etmek istediğinizi seçin.
          </p>
        </div>
      </div>

      {conflicts.map((conflict, i) => (
        <div key={i} className="edit-conflict-item">
          {conflict.type === 'code_name_mismatch' ? (
            <>
              <div className="edit-conflict-desc">
                Renk kodu <code className="edit-conflict-code">[{conflict.newVariant.colorCode}]</code> için isim uyuşmazlığı:
              </div>
              <div className="edit-conflict-variants">
                <div className="edit-conflict-side existing">
                  <span className="edit-conflict-side-label">Kayıtlı</span>
                  <span className="edit-conflict-side-value">"{conflict.existingVariant.colorName}"</span>
                </div>
                <div className="edit-conflict-arrow">↔</div>
                <div className="edit-conflict-side new">
                  <span className="edit-conflict-side-label">Yeni</span>
                  <span className="edit-conflict-side-value">"{conflict.newVariant.colorName}"</span>
                </div>
              </div>
              <div className="edit-conflict-options">
                <button
                  type="button"
                  className={`edit-conflict-option-btn${resolutions[i] === 'keep_existing_name' ? ' selected' : ''}`}
                  onClick={() => onResolutionChange(i, 'keep_existing_name')}
                >
                  Kayıtlı adı koru
                  <span className="edit-conflict-option-value">"{conflict.existingVariant.colorName}"</span>
                </button>
                <button
                  type="button"
                  className={`edit-conflict-option-btn${resolutions[i] === 'use_new_name' ? ' selected' : ''}`}
                  onClick={() => onResolutionChange(i, 'use_new_name')}
                >
                  Yeni adı kullan
                  <span className="edit-conflict-option-value">"{conflict.newVariant.colorName}"</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="edit-conflict-desc">
                Renk adı <strong>"{conflict.newVariant.colorName}"</strong> için renk kodu uyuşmazlığı:
              </div>
              <div className="edit-conflict-variants">
                <div className="edit-conflict-side existing">
                  <span className="edit-conflict-side-label">Kayıtlı</span>
                  <span className="edit-conflict-side-value">
                    kod [{conflict.existingVariant.colorCode}], ad "{conflict.existingVariant.colorName}"
                  </span>
                </div>
                <div className="edit-conflict-arrow">↔</div>
                <div className="edit-conflict-side new">
                  <span className="edit-conflict-side-label">Yeni</span>
                  <span className="edit-conflict-side-value">
                    kod yok, ad "{conflict.newVariant.colorName}"
                  </span>
                </div>
              </div>
              <div className="edit-conflict-options">
                <button
                  type="button"
                  className={`edit-conflict-option-btn${resolutions[i] === 'same' ? ' selected' : ''}`}
                  onClick={() => onResolutionChange(i, 'same')}
                >
                  Aynı renk say
                  <span className="edit-conflict-option-desc">Stoku mevcut renge ekle</span>
                </button>
                <button
                  type="button"
                  className={`edit-conflict-option-btn${resolutions[i] === 'separate' ? ' selected' : ''}`}
                  onClick={() => onResolutionChange(i, 'separate')}
                >
                  Ayrı renk olarak ekle
                  <span className="edit-conflict-option-desc">Yeni varyant oluştur</span>
                </button>
              </div>
            </>
          )}
        </div>
      ))}

      <div className="edit-conflict-actions">
        <button type="button" className="edit-cancel-btn" onClick={onCancel} disabled={loading}>
          Vazgeç
        </button>
        <button
          type="button"
          className="edit-submit-btn"
          onClick={onConfirm}
          disabled={!allResolved || loading}
        >
          {loading ? 'Kaydediliyor...' : 'Onayla ve Kaydet'}
        </button>
      </div>
    </div>
  );
}

// ── Ana Form ──────────────────────────────────────────────────────────────────
function AddProductForm({ onClose, onProductAdded, brands = [] }) {
  const { currentUser } = useAuth();

  const [formData, setFormData] = useState({
    name: '',
    brand: '',
    category: 'yatak',
    description: '',
  });
  const [variants, setVariants] = useState([
    { colorCode: '', colorName: '', quantity: '', stockReason: 'purchase', returnReason: '', returnDescription: '' },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Çakışma durumu
  const [conflictData, setConflictData] = useState(null); // { conflicts, existingProductId }
  const [conflictResolutions, setConflictResolutions] = useState([]);
  const [hasVariantConflicts, setHasVariantConflicts] = useState(false);

  // Kapatma uyarısı
  const [closeConfirm, setCloseConfirm] = useState(false);

  const isFormDirty = () =>
    formData.name.trim() !== '' ||
    formData.brand.trim() !== '' ||
    formData.description.trim() !== '' ||
    variants.some((v) => (parseInt(v.quantity) || 0) > 0);

  const handleRequestClose = () => {
    if (loading) return;
    if (conflictData || isFormDirty()) {
      setCloseConfirm(true);
    } else {
      onClose();
    }
  };

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
    if (hasVariantConflicts) { setError('Renk çeşitlerindeki çakışmalar çözülmeden devam edilemez'); return false; }

    // Per-variant stok sebebi validasyonu
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      if ((parseInt(v.quantity) || 0) === 0) continue;
      if (!v.stockReason) {
        const label = v.colorName || v.colorCode || `${i + 1}. renk`;
        setError(`"${label}" için stok giriş sebebi seçilmelidir`); return false;
      }
      const needsReturn = v.stockReason === 'return' || v.stockReason === 'return_to_supplier';
      if (needsReturn && !v.returnReason) {
        const label = v.colorName || v.colorCode || `${i + 1}. renk`;
        setError(`"${label}" için iade sebebi seçilmelidir`); return false;
      }
      if (needsReturn && v.returnReason === 'other' && !(v.returnDescription || '').trim()) {
        const label = v.colorName || v.colorCode || `${i + 1}. renk`;
        setError(`"${label}" için iade açıklaması girilmelidir`); return false;
      }
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    if (!validateForm()) return;

    try {
      setLoading(true);

      const result = await saveProduct({
        name: formData.name,
        brand: formData.brand,
        category: formData.category,
        description: formData.description,
        variants,
        currentUser,
      });

      if (result.action === 'conflict') {
        setConflictData(result);
        setConflictResolutions(new Array(result.conflicts.length).fill(null));
        return;
      }

      onProductAdded();
      if (result.action === 'updated') {
        setSuccessMsg(
          `"${formData.name.trim()}" zaten kayıtlı — stok güncellendi (toplam: ${result.totalQuantity} adet)`
        );
        setTimeout(onClose, 2200);
      } else {
        onClose();
      }
    } catch (err) {
      console.error('Ürün eklenirken hata oluştu:', err);
      setError('Ürün eklenirken bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  const handleResolutionChange = (i, value) => {
    setConflictResolutions((prev) => {
      const next = [...prev];
      next[i] = value;
      return next;
    });
  };

  const handleConflictConfirm = async () => {
    setError('');
    try {
      setLoading(true);
      const resolvedVariants = applyConflictResolutions(
        variants,
        conflictData.conflicts,
        conflictResolutions
      );

      const result = await saveProductResolved({
        existingProductId: conflictData.existingProductId,
        name: formData.name,
        brand: formData.brand,
        resolvedVariants,
        currentUser,
      });

      onProductAdded();
      setConflictData(null);
      setSuccessMsg(
        `"${formData.name.trim()}" stok güncellendi (toplam: ${result.totalQuantity} adet)`
      );
      setTimeout(onClose, 2200);
    } catch (err) {
      console.error('Çakışma çözümlenirken hata:', err);
      setError('Kaydedilirken bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) handleRequestClose();
  };

  return (
    <div className="edit-modal-backdrop" onClick={handleBackdropClick}>
      <div className="edit-modal-content">
        <div className="edit-modal-header">
          <h2>➕ Yeni Ürün Ekle</h2>
          <button onClick={handleRequestClose} className="edit-close-btn" disabled={loading}>
            ✕
          </button>
        </div>

        {error && <div className="edit-error-message">{error}</div>}
        {successMsg && <div className="edit-success-message">{successMsg}</div>}

        {/* Çakışma çözüm paneli — form yerine gösterilir */}
        {conflictData ? (
          <ConflictResolutionPanel
            conflicts={conflictData.conflicts}
            resolutions={conflictResolutions}
            onResolutionChange={handleResolutionChange}
            onConfirm={handleConflictConfirm}
            onCancel={() => setConflictData(null)}
            loading={loading}
          />
        ) : (
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

            <VariantsEditor
              variants={variants}
              onChange={setVariants}
              mode="quantity"
              disabled={loading}
              onConflictsChange={setHasVariantConflicts}
              perVariantReason
            />

            <div className="edit-form-actions">
              <div className="edit-action-buttons">
                <button
                  type="button"
                  onClick={handleRequestClose}
                  className="edit-cancel-btn"
                  disabled={loading}
                >
                  İptal
                </button>
                <button type="submit" className="edit-submit-btn" disabled={loading}>
                  {loading ? 'Kontrol ediliyor...' : 'Ürün Ekle'}
                </button>
              </div>
            </div>
          </form>
        )}

        {closeConfirm && (
          <ConfirmDialog
            message="Girilen bilgiler kaydedilmeyecek. Çıkmak istiyor musunuz?"
            onConfirm={onClose}
            onCancel={() => setCloseConfirm(false)}
            confirmLabel="Çık"
            cancelLabel="Devam Et"
            variant="neutral"
          />
        )}
      </div>
    </div>
  );
}

export default AddProductForm;
