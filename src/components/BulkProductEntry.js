import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { saveProduct, saveProductResolved, applyConflictResolutions, syncBulkStockUpdate } from '../utils/productService';
import {
  getQueue,
  addToQueue,
  removeFromQueue,
  updateQueueEntry,
  clearQueue,
  getProductsCache,
} from '../utils/offlineQueue';
import { VariantsEditor, StockReasonSelector, BrandInput, CategoryInput } from './ProductFormFields';
import ConfirmDialog from './ConfirmDialog';
import './ProductEditModal.css';
import './BulkProductEntry.css';

// Mevcut ürün varyantlarını delta moduna dönüştür (mevcut adet bilgisiyle)
// originalColorCode / originalColorName: Firebase'de eşleştirme için kullanılır,
// kullanıcı kodu/adı değiştirse bile asıl kayıt bulunabilir.
const DEFAULT_REASON = { stockReason: '', returnReason: '', returnDescription: '' };

const buildDeltaFromProduct = (product) => {
  if (product.variants && product.variants.length > 0) {
    return product.variants.map((v) => ({
      colorCode: v.colorCode || '',
      colorName: v.colorName || '',
      varyans: v.varyans || '',
      originalColorCode: v.colorCode || '',
      originalColorName: v.colorName || '',
      originalVaryans: v.varyans || '',
      delta: '',
      currentQty: v.quantity || 0,
      ...DEFAULT_REASON,
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
    currentQty: product.quantity || 0,
    ...DEFAULT_REASON,
  }];
};

const getTotalDelta = (deltaVariants) =>
  deltaVariants.reduce((sum, v) => sum + (parseInt(v.delta) || 0), 0);

const getProductStock = (product) => {
  if (product.variants && product.variants.length > 0) return product.totalQuantity || 0;
  return product.quantity || 0;
};

// ---- Yeni Ürün Formu ----
function NewProductForm({ onAdd, onCancel, brands = [], initialData = null, onSave = null }) {
  const isEditMode = initialData !== null;

  const [formData, setFormData] = useState({
    name: initialData?.name ?? '',
    brand: initialData?.brand ?? '',
    category: initialData?.category ?? '',
    description: initialData?.description ?? '',
  });
  const [variants, setVariants] = useState(() => {
    if (initialData?.variants?.length > 0) {
      return initialData.variants.map((v) => ({
        colorCode: v.colorCode ?? '',
        colorName: v.colorName ?? '',
        varyans: v.varyans ?? '',
        quantity: v.quantity ?? '',
      }));
    }
    return [{ colorCode: '', colorName: '', varyans: '', quantity: '' }];
  });
  const [stockReasonData, setStockReasonData] = useState({
    stockReason: initialData?.stockReason ?? 'purchase',
    returnReason: initialData?.returnReason ?? '',
    returnDescription: initialData?.returnDescription ?? '',
  });
  const [error, setError] = useState('');
  const [hasVariantConflicts, setHasVariantConflicts] = useState(false);

  const setField = (field, val) => setFormData((d) => ({ ...d, [field]: val }));
  const totalQty = variants.reduce((s, v) => s + (parseInt(v.quantity) || 0), 0);

  const handleAdd = () => {
    setError('');
    if (!formData.name.trim()) { setError('Ürün adı zorunludur.'); return; }
    if (!formData.brand.trim()) { setError('Marka zorunludur.'); return; }
    if (!formData.category) { setError('Kategori seçilmelidir.'); return; }
    if (totalQty === 0) { setError('En az 1 adet ürün eklenmelidir.'); return; }
    if (hasVariantConflicts) { setError('Çeşitlerdeki çakışmalar çözülmeden devam edilemez.'); return; }
    if (!stockReasonData.stockReason) { setError('Stok giriş sebebi seçilmelidir.'); return; }
    if (stockReasonData.stockReason === 'return' && !stockReasonData.returnReason) {
      setError('İade sebebi seçilmelidir.'); return;
    }
    if (
      stockReasonData.stockReason === 'return' &&
      stockReasonData.returnReason === 'other' &&
      !stockReasonData.returnDescription.trim()
    ) {
      setError('İade açıklaması girilmelidir.'); return;
    }

    const data = {
      name: formData.name.trim(),
      brand: formData.brand.trim(),
      category: formData.category,
      description: formData.description.trim(),
      stockReason: stockReasonData.stockReason,
      returnReason:
        stockReasonData.stockReason === 'return' ? stockReasonData.returnReason : null,
      returnDescription:
        stockReasonData.stockReason === 'return' &&
        stockReasonData.returnReason === 'other'
          ? stockReasonData.returnDescription.trim()
          : null,
      variants: variants.map((v) => ({
        colorCode: v.colorCode.trim(),
        colorName: v.colorName.trim(),
        varyans: (v.varyans || '').trim(),
        quantity: parseInt(v.quantity) || 0,
      })),
    };

    if (isEditMode && onSave) {
      onSave(data);
    } else {
      onAdd({ type: 'new_product', data });
    }
  };

  return (
    <div className="bulk-form-panel">
      {isEditMode && (
        <div className="bulk-edit-mode-banner">
          ✏ Düzenleme modu — değişiklikler kuyruğa uygulanacak
        </div>
      )}
      {error && (
        <div className="edit-error-message bulk-inline-error">{error}</div>
      )}

      <div className="edit-form-row">
        <div className="edit-form-group">
          <label>Ürün Adı *</label>
          <input
            type="text"
            placeholder="Örn: Stress Out"
            value={formData.name}
            onChange={(e) => setField('name', e.target.value)}
          />
        </div>
        <div className="edit-form-group">
          <label>Marka *</label>
          <BrandInput
            value={formData.brand}
            onChange={(val) => setField('brand', val)}
            brands={brands}
          />
        </div>
      </div>

      <div className="edit-form-row">
        <div className="edit-form-group">
          <label>Kategori *</label>
          <CategoryInput
            value={formData.category}
            onChange={(id) => setField('category', id)}
          />
        </div>
      </div>

      <div className="edit-form-group">
        <label>Açıklama</label>
        <textarea
          placeholder="İsteğe bağlı açıklama"
          rows={2}
          value={formData.description}
          onChange={(e) => setField('description', e.target.value)}
        />
      </div>

      <StockReasonSelector
        value={stockReasonData}
        onChange={setStockReasonData}
        mode="increase"
      />

      <VariantsEditor variants={variants} onChange={setVariants} mode="quantity" onConflictsChange={setHasVariantConflicts} />

      <div className="edit-form-actions">
        <div className="edit-action-buttons">
          <button type="button" className="edit-cancel-btn" onClick={onCancel}>
            İptal
          </button>
          <button type="button" className="edit-submit-btn" onClick={handleAdd}>
            {isEditMode ? 'Güncelle' : 'Kuyruğa Ekle'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Stok Güncelleme Formu ----
function StockUpdateForm({ cachedProducts, availableBrands = [], queue = [], onAdd, onCancel, initialData = null, onSave = null }) {
  const isEditMode = initialData !== null;

  // Edit modunda başlangıç ürününü önbellekten bul
  const initialProduct = isEditMode && initialData.productId
    ? cachedProducts.find((p) => p.id === initialData.productId) ?? null
    : null;

  const [selectedProduct, setSelectedProduct] = useState(initialProduct);
  const [search, setSearch] = useState('');
  const [deltaVariants, setDeltaVariants] = useState(() => {
    if (isEditMode && initialProduct && initialData.deltaVariants) {
      const current = buildDeltaFromProduct(initialProduct);
      return current.map((cv) => {
        const saved = initialData.deltaVariants.find(
          (sv) => sv.colorCode === cv.colorCode && sv.colorName === cv.colorName
        );
        return {
          ...cv,
          delta: saved ? String(saved.delta) : '',
          stockReason: saved?.stockReason ?? 'purchase',
          returnReason: saved?.returnReason ?? '',
          returnDescription: saved?.returnDescription ?? '',
        };
      });
    }
    return [];
  });
  const [error, setError] = useState('');
  const [hasVariantConflicts, setHasVariantConflicts] = useState(false);

  // Ürün bilgisi düzenleme (isim / marka / kategori override)
  const [editingProductInfo, setEditingProductInfo] = useState(false);
  const [infoName, setInfoName] = useState(initialProduct?.name || '');
  const [infoBrand, setInfoBrand] = useState(initialProduct?.brand || '');
  const [infoCategory, setInfoCategory] = useState(initialProduct?.category || '');

  // Seçili ürün için kuyruktaki bekleyen işlem sayısı
  const pendingCount = selectedProduct
    ? queue.filter((e) => e.type === 'stock_update' && e.data?.productId === selectedProduct.id).length
    : 0;

  const sortedProducts = [...cachedProducts].sort((a, b) =>
    (a.name || '').localeCompare(b.name || '', 'tr')
  );

  const filteredProducts = sortedProducts.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.name?.toLowerCase().includes(q) ||
      p.brand?.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q)
    );
  });

  const selectProduct = (product) => {
    // Bu ürün için kuyruktaki bekleyen işlemleri bul
    const pendingEntries = queue.filter(
      (e) => e.type === 'stock_update' && e.data?.productId === product.id
    );

    // Temel varyantları oluştur, ardından bekleyen delta'ları currentQty'ye uygula
    const base = buildDeltaFromProduct(product);

    let adjusted = base;
    if (pendingEntries.length > 0) {
      adjusted = base.map((v) => {
        let effectiveQty = v.currentQty || 0;
        for (const entry of pendingEntries) {
          for (const dv of (entry.data.deltaVariants || [])) {
            const matchCode = dv.originalColorCode ?? dv.colorCode;
            const matchName = dv.originalColorName ?? dv.colorName;
            if (
              (v.originalColorCode || '') === (matchCode || '') &&
              (v.originalColorName || '') === (matchName || '')
            ) {
              effectiveQty = Math.max(0, effectiveQty + (dv.delta || 0));
            }
          }
        }
        return { ...v, currentQty: effectiveQty };
      });
    }

    setSelectedProduct(product);
    setDeltaVariants(adjusted);
    setInfoName(product.name || '');
    setInfoBrand(product.brand || '');
    setInfoCategory(product.category || '');
    setEditingProductInfo(false);
    setError('');
  };

  const clearSelection = () => {
    setSelectedProduct(null);
    setDeltaVariants([]);
    setEditingProductInfo(false);
    setError('');
  };

  const handleAdd = () => {
    setError('');
    if (!selectedProduct) { setError('Ürün seçilmelidir.'); return; }
    if (hasVariantConflicts) { setError('Çeşitlerdeki çakışmalar çözülmeden devam edilemez.'); return; }

    const finalName = infoName.trim() || selectedProduct.name;
    const finalBrand = infoBrand.trim() || selectedProduct.brand || '';
    const finalCategory = infoCategory || selectedProduct.category || '';

    const hasInfoChange =
      finalName !== selectedProduct.name ||
      finalBrand !== (selectedProduct.brand || '') ||
      finalCategory !== (selectedProduct.category || '');

    // Delta sıfır olsa bile renk kodu/adı değişmişse veya varyant silinmek üzere işaretlenmişse anlamlı değişikliktir
    const hasColorChange = deltaVariants.some(
      (v) => !v.isNew && (
        (v.colorCode || '') !== (v.originalColorCode || '') ||
        (v.colorName || '') !== (v.originalColorName || '')
      )
    );
    const hasQuantityChange = deltaVariants.some((v) => (parseInt(v.delta) || 0) !== 0);
    const hasNewVariant = deltaVariants.some((v) => v.isNew && (parseInt(v.delta) || 0) > 0);
    const hasDeletion = deltaVariants.some((v) => v.isDeleting);

    if (!hasInfoChange && !hasColorChange && !hasQuantityChange && !hasNewVariant && !hasDeletion) {
      setError('Herhangi bir değişiklik yapılmadan kuyruğa eklenemez.'); return;
    }

    // Per-variant stok sebebi validasyonu
    for (let i = 0; i < deltaVariants.length; i++) {
      const v = deltaVariants[i];
      const delta = parseInt(v.delta) || 0;
      if (delta === 0) continue;
      const mode = delta > 0 ? 'increase' : 'decrease';
      const validReasons = mode === 'increase'
        ? ['purchase', 'return']
        : ['sold', 'return_to_supplier'];
      if (!validReasons.includes(v.stockReason)) {
        const label = v.colorName || v.colorCode || `${i + 1}. renk`;
        setError(`"${label}" için stok sebebi seçilmelidir.`); return;
      }
      const needsReturn = v.stockReason === 'return' || v.stockReason === 'return_to_supplier';
      if (needsReturn && !v.returnReason) {
        const label = v.colorName || v.colorCode || `${i + 1}. renk`;
        setError(`"${label}" için iade sebebi seçilmelidir.`); return;
      }
      if (needsReturn && v.returnReason === 'other' && !(v.returnDescription || '').trim()) {
        const label = v.colorName || v.colorCode || `${i + 1}. renk`;
        setError(`"${label}" için iade açıklaması girilmelidir.`); return;
      }
    }

    const data = {
      productId: selectedProduct.id,
      productName: finalName,
      brand: finalBrand,
      category: finalCategory,
      // Overrides: yalnızca orijinalden farklıysa eklenir
      ...(finalName !== selectedProduct.name && { nameOverride: finalName }),
      ...(finalBrand !== (selectedProduct.brand || '') && { brandOverride: finalBrand }),
      ...(finalCategory !== (selectedProduct.category || '') && { categoryOverride: finalCategory }),
      // Miktar değişikliği olmasa bile renk kodu/adı değişen varyantları da dahil et
      deltaVariants: deltaVariants
        .filter((v) => {
          const hasDelta = v.delta !== '' && parseInt(v.delta) !== 0;
          const colorChanged = !v.isNew && (
            (v.colorCode || '') !== (v.originalColorCode || '') ||
            (v.colorName || '') !== (v.originalColorName || '') ||
            (v.varyans || '') !== (v.originalVaryans || '')
          );
          return hasDelta || colorChanged || (v.isNew && (parseInt(v.delta) || 0) > 0);
        })
        .map((v) => ({
          colorCode: v.colorCode,
          colorName: v.colorName,
          varyans: (v.varyans || '').trim(),
          originalColorCode: v.isNew ? null : (v.originalColorCode ?? v.colorCode),
          originalColorName: v.isNew ? null : (v.originalColorName ?? v.colorName),
          originalVaryans: v.isNew ? null : (v.originalVaryans ?? v.varyans ?? ''),
          delta: parseInt(v.delta) || 0,
          stockReason: v.stockReason || null,
          returnReason: v.returnReason || null,
          returnDescription: v.returnDescription || null,
          ...(v.isNew && { isNew: true }),
        })),
    };

    if (isEditMode && onSave) {
      onSave(data);
    } else {
      onAdd({ type: 'stock_update', data });
    }
  };

  if (cachedProducts.length === 0) {
    return (
      <div className="bulk-form-panel">
        <div className="bulk-cache-warning">
          Önbellekte ürün bulunamadı. Bu özelliği kullanmak için en az bir kez internet bağlantısı gereklidir.
        </div>
        <div className="edit-form-actions">
          <div className="edit-action-buttons">
            <button type="button" className="edit-cancel-btn" onClick={onCancel}>İptal</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bulk-form-panel">
      {isEditMode && (
        <div className="bulk-edit-mode-banner">
          ✏ Düzenleme modu — değişiklikler kuyruğa uygulanacak
        </div>
      )}
      {error && (
        <div className="edit-error-message bulk-inline-error">{error}</div>
      )}

      {!selectedProduct ? (
        /* ——— Ürün Seçim Paneli ——— */
        <div className="bulk-product-select-panel">
          <div className="bulk-product-select-header">
            <label>
              Ürün Seç *
              <span className="bulk-product-count">
                {filteredProducts.length} / {cachedProducts.length} ürün
              </span>
            </label>
            <div className="bulk-product-search-wrapper">
              <input
                type="text"
                placeholder="İsim, marka veya kategori ile filtrele..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bulk-product-search-input"
              />
              {search && (
                <button
                  type="button"
                  className="bulk-search-clear-btn"
                  onClick={() => setSearch('')}
                  title="Filtreyi temizle"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          <ul className="bulk-product-list">
            {filteredProducts.length === 0 ? (
              <li className="bulk-product-list-empty">Ürün bulunamadı</li>
            ) : (
              filteredProducts.map((p) => {
                const stock = getProductStock(p);
                const stockClass = stock === 0 ? 'out' : stock <= 5 ? 'low' : 'in';
                return (
                  <li
                    key={p.id}
                    className="bulk-product-list-item"
                    onClick={() => selectProduct(p)}
                  >
                    <span className="bulk-product-list-name">{p.name}</span>
                    <span className="bulk-product-list-meta">
                      <span>{p.brand}</span>
                      <span className="bulk-meta-dot">·</span>
                      <span>{p.category}</span>
                      <span className="bulk-meta-dot">·</span>
                      <span className={`bulk-stock-badge ${stockClass}`}>{stock} adet</span>
                    </span>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : (
        /* ——— Seçili Ürün + Delta Girişi ——— */
        <>
          <div className="bulk-selected-product-bar">
            <div className="bulk-selected-badges">
              <span className="bulk-product-badge">{infoName || selectedProduct.name}</span>
              {infoBrand && <span className="bulk-brand-badge">{infoBrand}</span>}
              {infoCategory && <span className="bulk-category-badge">{infoCategory}</span>}
            </div>
            <button
              type="button"
              className="bulk-change-product-btn"
              onClick={clearSelection}
            >
              ← Ürün Değiştir
            </button>
          </div>

          {/* Bekleyen işlem uyarısı */}
          {pendingCount > 0 && (
            <div className="bulk-pending-warning">
              ⚠ Bu ürün için kuyruğa eklenmiş {pendingCount} işlem var. Adet değerleri bekleyen işlemler uygulandıktan sonraki durumu yansıtır.
            </div>
          )}

          {/* Ürün bilgisi düzenleme — kalem butonuyla açılır/kapanır */}
          {editingProductInfo && (
            <div className="bulk-product-info-edit">
              <div className="bulk-product-info-edit-title">Ürün Bilgilerini Düzenle</div>
              <div className="edit-form-group">
                <label>Ürün Adı</label>
                <input
                  type="text"
                  value={infoName}
                  onChange={(e) => setInfoName(e.target.value)}
                  placeholder={selectedProduct.name}
                />
              </div>
              <div className="edit-form-group">
                <label>Marka</label>
                <BrandInput
                  value={infoBrand}
                  onChange={setInfoBrand}
                  brands={availableBrands}
                />
              </div>
              <div className="edit-form-group">
                <label>Kategori</label>
                <CategoryInput value={infoCategory} onChange={setInfoCategory} />
              </div>
            </div>
          )}

          <VariantsEditor
            variants={deltaVariants}
            onChange={setDeltaVariants}
            mode="delta"
            onEditProductInfo={() => setEditingProductInfo((v) => !v)}
            onConflictsChange={setHasVariantConflicts}
            perVariantReason
          />
        </>
      )}

      <div className="edit-form-actions">
        <div className="edit-action-buttons">
          <button type="button" className="edit-cancel-btn" onClick={onCancel}>
            İptal
          </button>
          <button
            type="button"
            className="edit-submit-btn"
            onClick={handleAdd}
            disabled={!selectedProduct}
          >
            Kuyruğa Ekle
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Kuyruk Kartı ----
function QueueCard({ entry, onRemove, onEdit, onResolveConflict }) {
  const [expanded, setExpanded] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolutions, setResolutions] = useState([]);

  const isNew = entry.type === 'new_product';
  const isConflict = entry.status === 'conflict' && entry.conflictDetails?.length > 0;
  const d = entry.data;
  const canEdit = entry.status !== 'success' && entry.status !== 'syncing';
  const allResolved = resolutions.length > 0 && resolutions.every((r) => r !== null);

  const statusLabel = {
    pending: 'Bekliyor',
    syncing: 'Gönderiliyor...',
    success: 'Tamamlandı',
    error: 'Hata',
    conflict: '⚠ Renk Çakışması',
  }[entry.status] || 'Bekliyor';

  const handleEditClick = (e) => {
    e.stopPropagation();
    if (isConflict) {
      setResolutions(new Array(entry.conflictDetails.length).fill(null));
      setResolving(true);
      setExpanded(true);
    } else {
      onEdit(entry);
    }
  };

  const handleHeaderClick = () => {
    if (resolving) setResolving(false);
    setExpanded((v) => !v);
  };

  const handleResolutionChange = (i, val) =>
    setResolutions((prev) => { const n = [...prev]; n[i] = val; return n; });

  const handleConflictConfirm = (e) => {
    e.stopPropagation();
    onResolveConflict(entry.id, entry.conflictDetails, resolutions);
    setResolving(false);
    setExpanded(false);
  };

  return (
    <div className={`bulk-queue-card status-${entry.status}`}>
      <div className="bulk-queue-card-header" onClick={handleHeaderClick}>
        <div className="bulk-queue-card-title">
          <span className={`bulk-type-badge ${isNew ? 'new' : 'update'}`}>
            {isNew ? 'Yeni Ürün' : 'Stok Güncelleme'}
          </span>
          <span className="bulk-queue-product-name">{d.productName || d.name}</span>
          <span className="bulk-queue-brand">{d.brand}</span>
        </div>
        <div className="bulk-queue-card-meta">
          <span className={`bulk-status-badge ${entry.status}`}>{statusLabel}</span>
          {canEdit && (
            <>
              <button
                className={`bulk-edit-queue-btn${isConflict ? ' conflict-edit' : ''}`}
                onClick={handleEditClick}
                title={isConflict ? 'Çakışmayı çöz ve düzenle' : 'Düzenle'}
              >
                {isConflict ? (
                  <><span className="bulk-edit-pencil-icon">✏</span> Düzenle</>
                ) : '✏'}
              </button>
              <button
                className="bulk-remove-queue-btn"
                onClick={(e) => { e.stopPropagation(); onRemove(entry.id); }}
                title="Kuyruktan çıkar"
              >
                ✕
              </button>
            </>
          )}
          <span className="bulk-expand-icon">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div className="bulk-queue-card-details">
          {resolving && isConflict ? (
            /* ── Inline çakışma çözüm paneli ── */
            <div className="bulk-inline-conflict">
              <div className="bulk-inline-conflict-header">
                <span>⚠</span>
                <div>
                  <strong>Renk Varyantı Çakışması</strong>
                  <p>Her çakışma için nasıl devam edeceğinizi seçin.</p>
                </div>
              </div>

              {entry.conflictDetails.map((conflict, i) => (
                <div key={i} className="edit-conflict-item">
                  {conflict.type === 'code_name_mismatch' ? (
                    <>
                      <div className="edit-conflict-desc">
                        Renk kodu{' '}
                        <code className="edit-conflict-code">[{conflict.newVariant.colorCode}]</code>{' '}
                        — isim uyuşmazlığı:
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
                          onClick={(e) => { e.stopPropagation(); handleResolutionChange(i, 'keep_existing_name'); }}
                        >
                          Kayıtlı adı koru
                          <span className="edit-conflict-option-value">"{conflict.existingVariant.colorName}"</span>
                        </button>
                        <button
                          type="button"
                          className={`edit-conflict-option-btn${resolutions[i] === 'use_new_name' ? ' selected' : ''}`}
                          onClick={(e) => { e.stopPropagation(); handleResolutionChange(i, 'use_new_name'); }}
                        >
                          Yeni adı kullan
                          <span className="edit-conflict-option-value">"{conflict.newVariant.colorName}"</span>
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="edit-conflict-desc">
                        Renk adı <strong>"{conflict.newVariant.colorName}"</strong> — kod uyuşmazlığı:
                      </div>
                      <div className="edit-conflict-variants">
                        <div className="edit-conflict-side existing">
                          <span className="edit-conflict-side-label">Kayıtlı</span>
                          <span className="edit-conflict-side-value">
                            kod [{conflict.existingVariant.colorCode}]
                          </span>
                        </div>
                        <div className="edit-conflict-arrow">↔</div>
                        <div className="edit-conflict-side new">
                          <span className="edit-conflict-side-label">Yeni</span>
                          <span className="edit-conflict-side-value">kod yok</span>
                        </div>
                      </div>
                      <div className="edit-conflict-options">
                        <button
                          type="button"
                          className={`edit-conflict-option-btn${resolutions[i] === 'same' ? ' selected' : ''}`}
                          onClick={(e) => { e.stopPropagation(); handleResolutionChange(i, 'same'); }}
                        >
                          Aynı renk say
                          <span className="edit-conflict-option-desc">Stoku mevcut renge ekle</span>
                        </button>
                        <button
                          type="button"
                          className={`edit-conflict-option-btn${resolutions[i] === 'separate' ? ' selected' : ''}`}
                          onClick={(e) => { e.stopPropagation(); handleResolutionChange(i, 'separate'); }}
                        >
                          Ayrı renk olarak ekle
                          <span className="edit-conflict-option-desc">Yeni varyant oluştur</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}

              <div className="bulk-inline-conflict-actions">
                <button
                  type="button"
                  className="edit-cancel-btn"
                  onClick={(e) => { e.stopPropagation(); setResolving(false); }}
                >
                  İptal
                </button>
                <button
                  type="button"
                  className="edit-submit-btn"
                  disabled={!allResolved}
                  onClick={handleConflictConfirm}
                >
                  Onayla ve Kuyruğa Ekle
                </button>
              </div>
            </div>
          ) : (
            /* ── Normal kart detayları ── */
            <>
              {isNew ? (
                <div className="bulk-detail-grid">
                  <span className="bulk-detail-label">Kategori:</span>
                  <span>{d.category}</span>
                  <span className="bulk-detail-label">Stok Sebebi:</span>
                  <span>{d.stockReason === 'purchase' ? 'Satın Alım' : 'Ürün İade'}</span>
                  <span className="bulk-detail-label">Toplam Adet:</span>
                  <span>{d.variants.reduce((s, v) => s + (v.quantity || 0), 0)} adet</span>
                  {d.description && (
                    <>
                      <span className="bulk-detail-label">Açıklama:</span>
                      <span>{d.description}</span>
                    </>
                  )}
                  <span className="bulk-detail-label">Varyantlar:</span>
                  <div className="bulk-detail-variants">
                    {d.variants.map((v, i) => (
                      <span key={i} className="bulk-detail-variant-chip">
                        {[v.colorCode, v.colorName].filter(Boolean).join(' ') || 'Renksiz'} — {v.quantity} adet
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bulk-detail-grid">
                  <span className="bulk-detail-label">Kategori:</span>
                  <span>{d.category}</span>
                  <span className="bulk-detail-label">Stok Sebebi:</span>
                  <span>
                    {{ purchase: 'Satın Alım', return: 'Ürün İade', sold: 'Satıldı', return_to_supplier: 'Firmaya İade' }[d.stockReason] || d.stockReason}
                  </span>
                  <span className="bulk-detail-label">Toplam Delta:</span>
                  <span className={getTotalDelta(d.deltaVariants) >= 0 ? 'bulk-positive' : 'bulk-negative'}>
                    {getTotalDelta(d.deltaVariants) >= 0 ? '+' : ''}{getTotalDelta(d.deltaVariants)} adet
                  </span>
                  <span className="bulk-detail-label">Varyantlar:</span>
                  <div className="bulk-detail-variants">
                    {d.deltaVariants.map((v, i) => (
                      <span
                        key={i}
                        className={`bulk-detail-variant-chip ${v.delta > 0 ? 'positive' : v.delta < 0 ? 'negative' : ''}`}
                      >
                        {[v.colorCode, v.colorName].filter(Boolean).join(' ') || 'Tüm Stok'}:
                        {' '}{v.delta > 0 ? '+' : ''}{v.delta}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {entry.status === 'conflict' && entry.errorMessage && (
                <div className="bulk-entry-conflict">
                  <div className="bulk-entry-conflict-title">Renk varyantı çakışması:</div>
                  {entry.errorMessage.split('\n').map((line, i) => (
                    <div key={i} className="bulk-entry-conflict-line">• {line}</div>
                  ))}
                  <div className="bulk-entry-conflict-hint">
                    ✏ "Düzenle" butonuna tıklayarak çakışmayı düzeltebilirsiniz.
                  </div>
                </div>
              )}
              {entry.status === 'error' && entry.errorMessage && (
                <div className="bulk-entry-error">{entry.errorMessage}</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Özet Modalı ----
function SyncSummary({ successCount, errorCount, onClose }) {
  return (
    <div className="bulk-summary-overlay">
      <div className="bulk-summary-modal">
        <h3>Senkronizasyon Tamamlandı</h3>
        <div className="bulk-summary-stats">
          <div className="bulk-summary-item success">
            <span className="bulk-summary-number">{successCount}</span>
            <span>Başarılı</span>
          </div>
          {errorCount > 0 && (
            <div className="bulk-summary-item error">
              <span className="bulk-summary-number">{errorCount}</span>
              <span>Hatalı</span>
            </div>
          )}
        </div>
        {errorCount > 0 && (
          <p className="bulk-summary-note">
            Hatalı girişler kuyrukta kaldı. İnceleyip tekrar deneyebilirsiniz.
          </p>
        )}
        <button className="bulk-summary-close-btn" onClick={onClose}>
          Tamam
        </button>
      </div>
    </div>
  );
}

// ---- Ana BulkProductEntry Bileşeni ----
function BulkProductEntry({ onClose }) {
  const { currentUser } = useAuth();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [activeTab, setActiveTab] = useState('new_product');
  const [queue, setQueue] = useState(getQueue());
  const [showForm, setShowForm] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncSummary, setSyncSummary] = useState(null);
  const [editingEntry, setEditingEntry] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  const cachedProducts = useMemo(() => {
    const cache = getProductsCache();
    if (!cache || !cache.products) return [];
    return Object.keys(cache.products).map((id) => ({ id, ...cache.products[id] }));
  }, []);

  const availableBrands = useMemo(
    () => [...new Set(cachedProducts.map((p) => p.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')),
    [cachedProducts]
  );

  const refreshQueue = useCallback(() => setQueue(getQueue()), []);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const handleAdd = (entry) => {
    addToQueue(entry);
    refreshQueue();
    setShowForm(false);
  };

  const handleRemove = (id) => {
    setConfirmDialog({
      message: 'Bu girişi kuyruktan kaldırmak istediğinizden emin misiniz?',
      onConfirm: () => { removeFromQueue(id); refreshQueue(); },
    });
  };

  const handleEditEntry = (entry) => {
    setEditingEntry(entry);
    setActiveTab(entry.type === 'new_product' ? 'new_product' : 'stock_update');
    setShowForm(true);
  };

  const handleSaveEditedEntry = (updatedData) => {
    updateQueueEntry(editingEntry.id, {
      data: updatedData,
      status: 'pending',
      errorMessage: null,
    });
    refreshQueue();
    setEditingEntry(null);
    setShowForm(false);
  };

  const handleCancelEdit = () => {
    setEditingEntry(null);
    setShowForm(false);
  };

  // QueueCard'dan gelen inline çakışma çözümü
  const handleResolveConflict = useCallback((entryId, conflictDetails, resolutions) => {
    const entry = getQueue().find((e) => e.id === entryId);
    if (!entry) return;
    const resolvedVariants = applyConflictResolutions(
      entry.data.variants,
      conflictDetails,
      resolutions
    );
    updateQueueEntry(entryId, {
      data: { ...entry.data, variants: resolvedVariants },
      status: 'pending',
      errorMessage: null,
      conflictDetails: null,
      conflictResolved: true,
      conflictExistingProductId: entry.conflictExistingProductId,
    });
    refreshQueue();
  }, [refreshQueue]);

  const handleSync = async () => {
    if (!isOnline) return;
    const pending = getQueue().filter(
      (e) => e.status === 'pending' || e.status === 'error' || e.status === 'conflict'
    );
    if (pending.length === 0) return;

    setSyncing(true);
    let successCount = 0;
    let errorCount = 0;

    for (const entry of pending) {
      updateQueueEntry(entry.id, { status: 'syncing' });
      refreshQueue();

      try {
        if (entry.type === 'new_product') {
          await syncNewProduct(entry, currentUser);
        } else if (entry.type === 'stock_update') {
          await syncBulkStockUpdate(entry, currentUser);
        }
        removeFromQueue(entry.id);
        successCount++;
        // Her girişten sonra kısa gecikme — Firebase log yazımlarının tamamlanması için
        if (successCount < pending.length) {
          await new Promise((r) => setTimeout(r, 150));
        }
      } catch (err) {
        console.error('Senkronizasyon hatası:', err);
        updateQueueEntry(entry.id, {
          status: err.isConflict ? 'conflict' : 'error',
          errorMessage: err.message || 'Bilinmeyen hata',
          ...(err.isConflict ? {
            conflictDetails: err.conflicts,
            conflictExistingProductId: err.existingProductId,
          } : { conflictDetails: null }),
        });
        errorCount++;
      }

      refreshQueue();
    }

    setSyncing(false);
    setSyncSummary({ successCount, errorCount });
    refreshQueue();
  };

  const pendingCount = useMemo(
    () => queue.filter((e) => e.status === 'pending' || e.status === 'error' || e.status === 'conflict').length,
    [queue]
  );

  // Mobilde kuyruk varsayılan kapalı, masaüstünde açık
  const [queueOpen, setQueueOpen] = useState(false);

  // Kapatma isteği: form açıksa uyar
  const handleModalClose = () => {
    if (showForm) {
      setConfirmDialog({
        message: 'Formdaki değişiklikler kaydedilmeyecek. Çıkmak istiyor musunuz?',
        confirmLabel: 'Çık',
        cancelLabel: 'Devam Et',
        variant: 'neutral',
        onConfirm: onClose,
      });
    } else {
      onClose();
    }
  };

  return (
    <div
      className="bulk-modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && handleModalClose()}
    >
      <div className="bulk-modal-content">
        {/* Header */}
        <div className="bulk-modal-header">
          <div className="bulk-header-left">
            <h2>Toplu Ürün Girişi</h2>
            <div className={`bulk-online-indicator ${isOnline ? 'online' : 'offline'}`}>
              <span className="bulk-online-dot" />
              {isOnline ? 'Çevrimiçi' : 'Çevrimdışı'}
            </div>
          </div>
          <button className="bulk-close-btn" onClick={handleModalClose} disabled={syncing}>
            ✕
          </button>
        </div>

        {/* Sekmeler — form açıkken sekme değişiminde uyarı */}
        <div className="bulk-tabs">
          <button
            className={`bulk-tab ${activeTab === 'new_product' ? 'active' : ''}`}
            onClick={() => {
              const switchToNew = () => {
                setActiveTab('new_product');
                setShowForm(false);
                setEditingEntry(null);
              };
              if (showForm) {
                const msg = activeTab === 'stock_update'
                  ? 'Stok güncelleme formundaki veriler kaybolacak. Yeni Ürün sekmesine geçmek istiyor musunuz?'
                  : 'Yeni ürün formundaki veriler kaybolacak. Devam etmek istiyor musunuz?';
                setConfirmDialog({
                  message: msg,
                  confirmLabel: 'Evet, Geç',
                  cancelLabel: 'İptal',
                  variant: 'neutral',
                  onConfirm: () => { switchToNew(); setConfirmDialog(null); },
                  onCancel: () => setConfirmDialog(null),
                });
              } else {
                switchToNew();
              }
            }}
          >
            Yeni Ürün
          </button>
          <button
            className={`bulk-tab ${activeTab === 'stock_update' ? 'active' : ''}`}
            onClick={() => {
              const switchToStock = () => {
                setActiveTab('stock_update');
                setShowForm(false);
                setEditingEntry(null);
              };
              if (showForm) {
                const msg = activeTab === 'new_product'
                  ? 'Yeni ürün formundaki veriler kaybolacak. Stok Güncelleme sekmesine geçmek istiyor musunuz?'
                  : 'Stok güncelleme formundaki veriler kaybolacak. Devam etmek istiyor musunuz?';
                setConfirmDialog({
                  message: msg,
                  confirmLabel: 'Evet, Geç',
                  cancelLabel: 'İptal',
                  variant: 'neutral',
                  onConfirm: () => { switchToStock(); setConfirmDialog(null); },
                  onCancel: () => setConfirmDialog(null),
                });
              } else {
                switchToStock();
              }
            }}
          >
            Stok Güncelleme
          </button>
        </div>

        {/* İçerik */}
        <div className={`bulk-modal-body${queueOpen ? '' : ' bulk-body-queue-closed'}`}>
          {/* Form alanı */}
          <div className="bulk-form-area">
            {showForm ? (
              activeTab === 'new_product' ? (
                <NewProductForm
                  onAdd={handleAdd}
                  onCancel={editingEntry ? handleCancelEdit : () => setShowForm(false)}
                  brands={availableBrands}
                  initialData={editingEntry?.type === 'new_product' ? editingEntry.data : null}
                  onSave={editingEntry?.type === 'new_product' ? handleSaveEditedEntry : null}
                />
              ) : (
                <StockUpdateForm
                  cachedProducts={cachedProducts}
                  availableBrands={availableBrands}
                  queue={queue}
                  onAdd={handleAdd}
                  onCancel={editingEntry ? handleCancelEdit : () => setShowForm(false)}
                  initialData={editingEntry?.type === 'stock_update' ? editingEntry.data : null}
                  onSave={editingEntry?.type === 'stock_update' ? handleSaveEditedEntry : null}
                />
              )
            ) : (
              <button
                className="bulk-show-form-btn"
                onClick={() => setShowForm(true)}
              >
                + {activeTab === 'new_product' ? 'Yeni Ürün Ekle' : 'Stok Güncelleme Ekle'}
              </button>
            )}
          </div>

          {/* Kuyruk listesi */}
          <div className={`bulk-queue-section${queueOpen ? '' : ' bulk-queue-collapsed'}`}>
            <div
              className="bulk-queue-header bulk-queue-header--toggle"
              onClick={() => setQueueOpen((o) => !o)}
            >
              <h3>
                Kuyruk
                {queue.length > 0 && (
                  <span className="bulk-queue-count">{queue.length}</span>
                )}
                {queue.some((e) => e.status === 'conflict' || e.status === 'error') && (
                  <span className="bulk-queue-issue-badge" title="Hata veya çakışma var">!</span>
                )}
              </h3>
              <div className="bulk-queue-header-actions">
                {queue.length > 0 && !syncing && queueOpen && (
                  <button
                    className="bulk-clear-all-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDialog({
                        message: 'Kuyruktaki tüm girişler silinecek. Emin misiniz?',
                        onConfirm: () => { clearQueue(); refreshQueue(); },
                      });
                    }}
                    title="Tüm kuyruğu temizle"
                  >
                    Tümünü Temizle
                  </button>
                )}
                <span className={`bulk-queue-chevron${queueOpen ? ' bulk-queue-chevron--open' : ''}`}>
                  ›
                </span>
              </div>
            </div>

            <div className="bulk-queue-body">
              {queue.length === 0 ? (
                <div className="bulk-queue-empty">Kuyrukta henüz giriş yok.</div>
              ) : (
                <div className="bulk-queue-list">
                  {queue.map((entry) => (
                    <QueueCard
                      key={entry.id}
                      entry={entry}
                      onRemove={handleRemove}
                      onEdit={handleEditEntry}
                      onResolveConflict={handleResolveConflict}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Alt bar */}
        <div className="bulk-modal-footer">
          {!isOnline && !showForm && (
            <div className="bulk-offline-warning">
              Çevrimdışı moddasınız. Girişler kaydedildi, internet bağlantısı geldiğinde senkronize edilebilir.
            </div>
          )}
          <div className="bulk-footer-actions">
            <span className="bulk-pending-info">
              {pendingCount > 0 ? `${pendingCount} giriş bekliyor` : 'Kuyruk boş'}
            </span>
            {!showForm && (
              <button
                className="bulk-sync-btn"
                onClick={handleSync}
                disabled={!isOnline || pendingCount === 0 || syncing}
                title={!isOnline ? 'İnternet bağlantısı gereklidir' : ''}
              >
                {syncing ? 'Gönderiliyor...' : `Kaydet (${pendingCount})`}
              </button>
            )}
          </div>
        </div>
      </div>

      {syncSummary && (
        <SyncSummary
          successCount={syncSummary.successCount}
          errorCount={syncSummary.errorCount}
          onClose={() => setSyncSummary(null)}
        />
      )}

      {confirmDialog && (
        <ConfirmDialog
          message={confirmDialog.message}
          onConfirm={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }}
          onCancel={() => setConfirmDialog(null)}
          confirmLabel={confirmDialog.confirmLabel || 'Sil'}
          cancelLabel={confirmDialog.cancelLabel || 'İptal'}
          variant={confirmDialog.variant || 'danger'}
        />
      )}
    </div>
  );
}

// ---- Senkronizasyon Fonksiyonları ----

async function syncNewProduct(entry, currentUser) {
  const d = entry.data;

  // Çakışma kullanıcı tarafından önceden çözüldüyse, direkt güncelleme yap
  if (entry.conflictResolved && entry.conflictExistingProductId) {
    await saveProductResolved({
      existingProductId: entry.conflictExistingProductId,
      name: d.name,
      brand: d.brand,
      resolvedVariants: d.variants,
      stockReason: d.stockReason,
      returnReason: d.returnReason || '',
      returnDescription: d.returnDescription || '',
      currentUser,
    });
    return;
  }

  const result = await saveProduct({
    name: d.name,
    brand: d.brand,
    category: d.category,
    description: d.description || '',
    variants: d.variants,
    stockReason: d.stockReason,
    returnReason: d.returnReason || '',
    returnDescription: d.returnDescription || '',
    currentUser,
  });

  if (result.action === 'conflict') {
    const conflictMsg = buildConflictMessage(result.conflicts);
    const err = new Error(conflictMsg);
    err.isConflict = true;
    err.conflicts = result.conflicts;
    err.existingProductId = result.existingProductId;
    throw err;
  }
}

function buildConflictMessage(conflicts) {
  return conflicts
    .map((c) => {
      if (c.type === 'code_name_mismatch') {
        return `Renk kodu [${c.newVariant.colorCode}]: kayıtlı ad "${c.existingVariant.colorName}", girilen ad "${c.newVariant.colorName}"`;
      }
      return `Renk adı "${c.newVariant.colorName}": kayıtlıda renk kodu var [${c.existingVariant.colorCode}], yeni girişte yok`;
    })
    .join('\n');
}


export default BulkProductEntry;
