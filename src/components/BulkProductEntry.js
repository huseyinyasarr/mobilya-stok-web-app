import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ref, push, runTransaction } from 'firebase/database';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { createLog, LOG_ACTIONS } from '../utils/logging';
import {
  getQueue,
  addToQueue,
  removeFromQueue,
  updateQueueEntry,
  clearQueue,
  getProductsCache,
} from '../utils/offlineQueue';
import { CATEGORIES, VariantsEditor, StockReasonSelector, BrandInput, CategoryInput } from './ProductFormFields';
import './ProductEditModal.css';
import './BulkProductEntry.css';

// Mevcut ürün varyantlarını delta moduna dönüştür (mevcut adet bilgisiyle)
const buildDeltaFromProduct = (product) => {
  if (product.variants && product.variants.length > 0) {
    return product.variants.map((v) => ({
      colorCode: v.colorCode || '',
      colorName: v.colorName || '',
      delta: '',
      currentQty: v.quantity || 0,
    }));
  }
  return [{ colorCode: '', colorName: '', delta: '', currentQty: product.quantity || 0 }];
};

const getTotalDelta = (deltaVariants) =>
  deltaVariants.reduce((sum, v) => sum + (parseInt(v.delta) || 0), 0);

const getProductStock = (product) => {
  if (product.variants && product.variants.length > 0) return product.totalQuantity || 0;
  return product.quantity || 0;
};

// ---- Yeni Ürün Formu ----
function NewProductForm({ onAdd, onCancel, brands = [] }) {
  const [formData, setFormData] = useState({
    name: '', brand: '', category: 'yatak', description: '',
  });
  const [variants, setVariants] = useState([{ colorCode: '', colorName: '', quantity: '' }]);
  const [stockReasonData, setStockReasonData] = useState({
    stockReason: 'purchase', returnReason: '', returnDescription: '',
  });
  const [error, setError] = useState('');

  const setField = (field, val) => setFormData((d) => ({ ...d, [field]: val }));
  const totalQty = variants.reduce((s, v) => s + (parseInt(v.quantity) || 0), 0);

  const handleAdd = () => {
    setError('');
    if (!formData.name.trim()) { setError('Ürün adı zorunludur.'); return; }
    if (!formData.brand.trim()) { setError('Marka zorunludur.'); return; }
    if (!formData.category) { setError('Kategori seçilmelidir.'); return; }
    if (totalQty === 0) { setError('En az 1 adet ürün eklenmelidir.'); return; }
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

    onAdd({
      type: 'new_product',
      data: {
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
          quantity: parseInt(v.quantity) || 0,
        })),
      },
    });
  };

  return (
    <div className="bulk-form-panel">
      {error && (
        <div className="edit-error-message bulk-inline-error">{error}</div>
      )}

      <div className="edit-form-row">
        <div className="edit-form-group">
          <label>Ürün Adı *</label>
          <input
            type="text"
            placeholder="Örn: 90x190 Stress Out"
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

      <VariantsEditor variants={variants} onChange={setVariants} mode="quantity" />

      <div className="edit-form-actions">
        <div className="edit-action-buttons">
          <button type="button" className="edit-cancel-btn" onClick={onCancel}>
            İptal
          </button>
          <button type="button" className="edit-submit-btn" onClick={handleAdd}>
            Kuyruğa Ekle
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Stok Güncelleme Formu ----
function StockUpdateForm({ cachedProducts, onAdd, onCancel }) {
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [search, setSearch] = useState('');
  const [deltaVariants, setDeltaVariants] = useState([]);
  const [stockReasonData, setStockReasonData] = useState({
    stockReason: 'purchase', returnReason: '', returnDescription: '',
  });
  const [error, setError] = useState('');

  const totalDelta = getTotalDelta(deltaVariants);
  const reasonMode = totalDelta >= 0 ? 'increase' : 'decrease';

  // Delta işareti değiştiğinde stok sebebini sıfırla
  const prevReasonModeRef = useRef(reasonMode);
  useEffect(() => {
    if (prevReasonModeRef.current !== reasonMode) {
      prevReasonModeRef.current = reasonMode;
      setStockReasonData({
        stockReason: reasonMode === 'increase' ? 'purchase' : 'sold',
        returnReason: '',
        returnDescription: '',
      });
    }
  }, [reasonMode]);

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
    setSelectedProduct(product);
    setDeltaVariants(buildDeltaFromProduct(product));
    setStockReasonData({ stockReason: 'purchase', returnReason: '', returnDescription: '' });
    setError('');
  };

  const clearSelection = () => {
    setSelectedProduct(null);
    setDeltaVariants([]);
    setError('');
  };

  const handleAdd = () => {
    setError('');
    if (!selectedProduct) { setError('Ürün seçilmelidir.'); return; }
    if (totalDelta === 0) { setError('En az bir varyant için sıfırdan farklı adet girilmelidir.'); return; }
    if (!stockReasonData.stockReason) { setError('Stok sebebi seçilmelidir.'); return; }
    const needsReturn =
      stockReasonData.stockReason === 'return' ||
      stockReasonData.stockReason === 'return_to_supplier';
    if (needsReturn && !stockReasonData.returnReason) {
      setError('İade sebebi seçilmelidir.'); return;
    }
    if (needsReturn && stockReasonData.returnReason === 'other' && !stockReasonData.returnDescription.trim()) {
      setError('İade açıklaması girilmelidir.'); return;
    }

    onAdd({
      type: 'stock_update',
      data: {
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        brand: selectedProduct.brand || '',
        category: selectedProduct.category || '',
        stockReason: stockReasonData.stockReason,
        returnReason: needsReturn ? stockReasonData.returnReason : null,
        returnDescription:
          needsReturn && stockReasonData.returnReason === 'other'
            ? stockReasonData.returnDescription.trim()
            : null,
        deltaVariants: deltaVariants
          .filter((v) => v.delta !== '' && parseInt(v.delta) !== 0)
          .map((v) => ({
            colorCode: v.colorCode,
            colorName: v.colorName,
            delta: parseInt(v.delta) || 0,
          })),
      },
    });
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
              <span className="bulk-product-badge">{selectedProduct.name}</span>
              <span className="bulk-brand-badge">{selectedProduct.brand}</span>
              <span className="bulk-category-badge">{selectedProduct.category}</span>
            </div>
            <button
              type="button"
              className="bulk-change-product-btn"
              onClick={clearSelection}
            >
              ← Ürün Değiştir
            </button>
          </div>

          <VariantsEditor
            variants={deltaVariants}
            onChange={setDeltaVariants}
            mode="delta"
          />

          <StockReasonSelector
            value={stockReasonData}
            onChange={setStockReasonData}
            mode={reasonMode}
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
function QueueCard({ entry, onRemove }) {
  const [expanded, setExpanded] = useState(false);

  const isNew = entry.type === 'new_product';
  const d = entry.data;

  const statusLabel = {
    pending: 'Bekliyor',
    syncing: 'Gönderiliyor...',
    success: 'Tamamlandı',
    error: 'Hata',
  }[entry.status] || 'Bekliyor';

  return (
    <div className={`bulk-queue-card status-${entry.status}`}>
      <div className="bulk-queue-card-header" onClick={() => setExpanded((e) => !e)}>
        <div className="bulk-queue-card-title">
          <span className={`bulk-type-badge ${isNew ? 'new' : 'update'}`}>
            {isNew ? 'Yeni Ürün' : 'Stok Güncelleme'}
          </span>
          <span className="bulk-queue-product-name">{d.productName || d.name}</span>
          <span className="bulk-queue-brand">{d.brand}</span>
        </div>
        <div className="bulk-queue-card-meta">
          <span className={`bulk-status-badge ${entry.status}`}>{statusLabel}</span>
          {entry.status !== 'success' && entry.status !== 'syncing' && (
            <button
              className="bulk-remove-queue-btn"
              onClick={(e) => { e.stopPropagation(); onRemove(entry.id); }}
              title="Kuyruktan çıkar"
            >
              ✕
            </button>
          )}
          <span className="bulk-expand-icon">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div className="bulk-queue-card-details">
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
          {entry.errorMessage && (
            <div className="bulk-entry-error">{entry.errorMessage}</div>
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

  const cachedProducts = (() => {
    const cache = getProductsCache();
    if (!cache || !cache.products) return [];
    return Object.keys(cache.products).map((id) => ({ id, ...cache.products[id] }));
  })();

  const availableBrands = [
    ...new Set(cachedProducts.map((p) => p.brand).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, 'tr'));

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
    removeFromQueue(id);
    refreshQueue();
  };

  const handleSync = async () => {
    if (!isOnline) return;
    const pending = getQueue().filter((e) => e.status === 'pending' || e.status === 'error');
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
          await syncStockUpdate(entry, currentUser);
        }
        removeFromQueue(entry.id);
        successCount++;
      } catch (err) {
        console.error('Senkronizasyon hatası:', err);
        updateQueueEntry(entry.id, {
          status: 'error',
          errorMessage: err.message || 'Bilinmeyen hata',
        });
        errorCount++;
      }

      refreshQueue();
    }

    setSyncing(false);
    setSyncSummary({ successCount, errorCount });
    refreshQueue();
  };

  const pendingCount = queue.filter(
    (e) => e.status === 'pending' || e.status === 'error'
  ).length;

  return (
    <div
      className="bulk-modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
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
          <button className="bulk-close-btn" onClick={onClose} disabled={syncing}>
            ✕
          </button>
        </div>

        {/* Sekmeler */}
        <div className="bulk-tabs">
          <button
            className={`bulk-tab ${activeTab === 'new_product' ? 'active' : ''}`}
            onClick={() => { setActiveTab('new_product'); setShowForm(false); }}
          >
            Yeni Ürün
          </button>
          <button
            className={`bulk-tab ${activeTab === 'stock_update' ? 'active' : ''}`}
            onClick={() => { setActiveTab('stock_update'); setShowForm(false); }}
          >
            Stok Güncelleme
          </button>
        </div>

        {/* İçerik */}
        <div className="bulk-modal-body">
          {/* Form alanı */}
          <div className="bulk-form-area">
            {showForm ? (
              activeTab === 'new_product' ? (
                <NewProductForm onAdd={handleAdd} onCancel={() => setShowForm(false)} brands={availableBrands} />
              ) : (
                <StockUpdateForm
                  cachedProducts={cachedProducts}
                  onAdd={handleAdd}
                  onCancel={() => setShowForm(false)}
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
          <div className="bulk-queue-section">
            <div className="bulk-queue-header">
              <h3>
                Kuyruk
                {queue.length > 0 && (
                  <span className="bulk-queue-count">{queue.length}</span>
                )}
              </h3>
              {queue.length > 0 && !syncing && (
                <button
                  className="bulk-clear-all-btn"
                  onClick={() => { clearQueue(); refreshQueue(); }}
                  title="Tüm kuyruğu temizle"
                >
                  Tümünü Temizle
                </button>
              )}
            </div>

            {queue.length === 0 ? (
              <div className="bulk-queue-empty">Kuyrukta henüz giriş yok.</div>
            ) : (
              <div className="bulk-queue-list">
                {queue.map((entry) => (
                  <QueueCard key={entry.id} entry={entry} onRemove={handleRemove} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Alt bar */}
        <div className="bulk-modal-footer">
          {!isOnline && (
            <div className="bulk-offline-warning">
              Çevrimdışı moddasınız. Girişler kaydedildi, internet bağlantısı geldiğinde senkronize edilebilir.
            </div>
          )}
          <div className="bulk-footer-actions">
            <span className="bulk-pending-info">
              {pendingCount > 0 ? `${pendingCount} giriş bekliyor` : 'Kuyruk boş'}
            </span>
            <button
              className="bulk-sync-btn"
              onClick={handleSync}
              disabled={!isOnline || pendingCount === 0 || syncing}
              title={!isOnline ? 'İnternet bağlantısı gereklidir' : ''}
            >
              {syncing ? 'Gönderiliyor...' : `Kaydet (${pendingCount})`}
            </button>
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
    </div>
  );
}

// ---- Senkronizasyon Fonksiyonları ----

async function syncNewProduct(entry, currentUser) {
  const d = entry.data;
  const productsRef = ref(db, 'products');
  const totalQuantity = d.variants.reduce((s, v) => s + v.quantity, 0);
  const now = new Date().toISOString();

  const stockEntry = {
    date: now,
    type: 'increase',
    reason: d.stockReason,
    quantity: totalQuantity,
    remainingStock: totalQuantity,
    variantChanges: d.variants.map((v) => ({
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

  if (d.stockReason === 'return') {
    stockEntry.returnReason = d.returnReason;
    if (d.returnReason === 'other' && d.returnDescription) {
      stockEntry.returnDescription = d.returnDescription;
    }
  }

  const productData = {
    name: d.name,
    brand: d.brand,
    category: d.category,
    description: d.description || '',
    variants: d.variants,
    totalQuantity,
    createdAt: now,
    lastUpdated: now,
    createdBy: {
      uid: currentUser.uid,
      email: currentUser.email,
      displayName: currentUser.displayName || 'Bilinmeyen Kullanıcı',
    },
    stockHistory: [stockEntry],
  };

  const newRef = await push(productsRef, productData);

  await createLog(
    LOG_ACTIONS.PRODUCT_CREATED,
    currentUser,
    { id: newRef.key, name: d.name, brand: d.brand, category: d.category, totalQuantity },
    {
      stockReason: d.stockReason,
      returnReason: d.stockReason === 'return' ? d.returnReason : null,
      returnDescription:
        d.stockReason === 'return' && d.returnReason === 'other' ? d.returnDescription : null,
    }
  );
}

async function syncStockUpdate(entry, currentUser) {
  const d = entry.data;
  const productRef = ref(db, `products/${d.productId}`);
  let updatedProduct = null;

  await runTransaction(productRef, (currentData) => {
    if (!currentData) return currentData;

    const now = new Date().toISOString();
    let variants = currentData.variants ? [...currentData.variants] : [];
    const variantChanges = [];

    for (const dv of d.deltaVariants) {
      const key = `${dv.colorCode}_${dv.colorName}`;
      const existingIdx = variants.findIndex(
        (v) => `${v.colorCode}_${v.colorName}` === key
      );

      if (existingIdx !== -1) {
        const oldQty = variants[existingIdx].quantity || 0;
        const newQty = Math.max(0, oldQty + dv.delta);
        variantChanges.push({
          colorCode: dv.colorCode,
          colorName: dv.colorName,
          quantityChange: dv.delta,
          oldQuantity: oldQty,
          newQuantity: newQty,
        });
        variants[existingIdx] = { ...variants[existingIdx], quantity: newQty };
      } else if (dv.delta > 0) {
        variantChanges.push({
          colorCode: dv.colorCode,
          colorName: dv.colorName,
          quantityChange: dv.delta,
          oldQuantity: 0,
          newQuantity: dv.delta,
        });
        variants.push({ colorCode: dv.colorCode, colorName: dv.colorName, quantity: dv.delta });
      }
    }

    const totalDelta = d.deltaVariants.reduce((s, v) => s + v.delta, 0);
    const oldTotal = currentData.totalQuantity || 0;
    const newTotal = Math.max(0, oldTotal + totalDelta);

    const stockEntry = {
      date: now,
      type: totalDelta >= 0 ? 'increase' : 'decrease',
      reason: d.stockReason,
      quantity: Math.abs(totalDelta),
      remainingStock: newTotal,
      variantChanges,
      user: {
        uid: currentUser.uid,
        email: currentUser.email,
        displayName: currentUser.displayName || 'Bilinmeyen Kullanıcı',
      },
    };

    if (d.returnReason) {
      stockEntry.returnReason = d.returnReason;
      if (d.returnReason === 'other' && d.returnDescription) {
        stockEntry.returnDescription = d.returnDescription;
      }
    }

    const existingHistory = currentData.stockHistory
      ? Object.values(currentData.stockHistory)
      : [];

    updatedProduct = {
      ...currentData,
      variants,
      totalQuantity: newTotal,
      lastUpdated: now,
      quantity: null,
      stockHistory: [...existingHistory, stockEntry],
    };

    return updatedProduct;
  });

  if (updatedProduct) {
    const totalDelta = d.deltaVariants.reduce((s, v) => s + v.delta, 0);
    const newTotal = updatedProduct.totalQuantity;

    await createLog(
      LOG_ACTIONS.PRODUCT_QUANTITY_CHANGED,
      currentUser,
      {
        id: d.productId,
        name: d.productName,
        brand: d.brand,
        category: d.category,
        totalQuantity: newTotal,
      },
      {
        quantityChange: { from: newTotal - totalDelta, to: newTotal },
        stockChangeType: totalDelta >= 0 ? 'increase' : 'decrease',
        stockChangeReason: d.stockReason,
      }
    );
  }
}

export default BulkProductEntry;
