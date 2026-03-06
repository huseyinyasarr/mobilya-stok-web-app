import React, { useState, useMemo } from 'react';
import { ref, remove } from 'firebase/database';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useCategories } from '../contexts/CategoriesContext';
import { createLog, LOG_ACTIONS } from '../utils/logging';
import './ProductsManager.css';

export default function ProductsManager({ onClose, products = [] }) {
  const { currentUser } = useAuth();
  const { categories } = useCategories();
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterBrand, setFilterBrand] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const availableBrands = useMemo(
    () => [...new Set(products.map((p) => p.brand).filter(Boolean))].sort((a, b) => (a || '').localeCompare(b || '', 'tr-TR')),
    [products]
  );

  const filteredProducts = useMemo(() => {
    let list = [...products];
    if (filterCategory !== 'all') list = list.filter((p) => p.category === filterCategory);
    if (filterBrand !== 'all') list = list.filter((p) => p.brand === filterBrand);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (p) =>
          (p.name || '').toLowerCase().includes(q) ||
          (p.brand || '').toLowerCase().includes(q) ||
          (p.category || '').toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'tr-TR'));
  }, [products, filterCategory, filterBrand, searchQuery]);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredProducts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProducts.map((p) => p.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    try {
      for (const id of selectedIds) {
        const product = products.find((p) => p.id === id);
        if (product) {
          await createLog(
            LOG_ACTIONS.PRODUCT_DELETED,
            currentUser,
            {
              id: product.id,
              name: product.name,
              brand: product.brand,
              category: product.category,
              totalQuantity: product.totalQuantity || product.quantity || 0,
            }
          );
          await remove(ref(db, `products/${id}`));
        }
      }
      setSelectedIds(new Set());
      setConfirmBulkDelete(false);
    } catch (err) {
      console.error('Toplu silme hatası:', err);
      alert('Bazı ürünler silinirken hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setDeleting(false);
    }
  };

  const getCategoryName = (catId) => {
    const cat = categories.find((c) => c.id === catId);
    return cat ? `${cat.icon || ''} ${cat.name}` : catId || '-';
  };

  return (
    <div
      className="prodmgr-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="prodmgr-modal">
        <div className="prodmgr-header">
          <h2>Ürünleri Yönet</h2>
          <button className="prodmgr-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="prodmgr-body">
          <p className="prodmgr-hint">
            Ürünleri filtreleyebilir, seçip toplu silebilirsiniz.
          </p>

          <div className="prodmgr-filters">
            <input
              type="text"
              className="prodmgr-search"
              placeholder="Ürün ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <select
              className="prodmgr-select"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value="all">Tüm Kategoriler</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.icon} {cat.name}
                </option>
              ))}
            </select>
            <select
              className="prodmgr-select"
              value={filterBrand}
              onChange={(e) => setFilterBrand(e.target.value)}
            >
              <option value="all">Tüm Markalar</option>
              {availableBrands.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </select>
          </div>

          {confirmBulkDelete ? (
            <div className="prodmgr-confirm-box">
              <p className="prodmgr-confirm-text">
                <strong>{selectedIds.size}</strong> ürünü silmek istediğinizden emin misiniz?
                Bu işlem geri alınamaz.
              </p>
              <div className="prodmgr-confirm-actions">
                <button
                  className="prodmgr-btn prodmgr-btn--delete-confirm"
                  onClick={handleBulkDelete}
                  disabled={deleting}
                >
                  {deleting ? 'Siliniyor…' : 'Evet, Sil'}
                </button>
                <button
                  className="prodmgr-btn prodmgr-btn--cancel"
                  onClick={() => setConfirmBulkDelete(false)}
                  disabled={deleting}
                >
                  Vazgeç
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="prodmgr-toolbar">
                <label className="prodmgr-checkbox-label">
                  <input
                    type="checkbox"
                    checked={filteredProducts.length > 0 && selectedIds.size === filteredProducts.length}
                    onChange={toggleSelectAll}
                  />
                  <span>Tümünü seç</span>
                </label>
                {selectedIds.size > 0 && (
                  <button
                    className="prodmgr-btn prodmgr-btn--bulk-delete"
                    onClick={() => setConfirmBulkDelete(true)}
                  >
                    Seçilenleri Sil ({selectedIds.size})
                  </button>
                )}
              </div>

              <div className="prodmgr-list">
                {filteredProducts.length === 0 ? (
                  <p className="prodmgr-empty">Ürün bulunamadı.</p>
                ) : (
                  filteredProducts.map((product) => (
                    <div key={product.id} className="prodmgr-row">
                      <label className="prodmgr-checkbox-label">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(product.id)}
                          onChange={() => toggleSelect(product.id)}
                        />
                        <span className="prodmgr-row-name">{product.name}</span>
                      </label>
                      <span className="prodmgr-row-meta">
                        {product.brand && <span>{product.brand}</span>}
                        {product.brand && product.category && ' · '}
                        {product.category && (
                          <span>{getCategoryName(product.category)}</span>
                        )}
                      </span>
                      <span className="prodmgr-row-qty">
                        {product.totalQuantity ?? product.quantity ?? 0} adet
                      </span>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
