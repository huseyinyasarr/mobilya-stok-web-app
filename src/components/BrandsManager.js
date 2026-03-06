import React, { useState, useMemo } from 'react';
import { ref, update } from 'firebase/database';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { createLog, LOG_ACTIONS } from '../utils/logging';
import './BrandsManager.css';

function BrandRow({ brand, productCount, onRename, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(brand);
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === brand) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onRename(brand, trimmed);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setName(brand);
    setEditing(false);
  };

  const handleRemove = async () => {
    setSaving(true);
    try {
      await onRemove(brand);
      setConfirmRemove(false);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="brandmgr-row brandmgr-row--editing">
        <input
          type="text"
          className="brandmgr-name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') handleCancel();
          }}
        />
        <div className="brandmgr-row-actions">
          <button className="brandmgr-btn brandmgr-btn--save" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? '…' : 'Kaydet'}
          </button>
          <button className="brandmgr-btn brandmgr-btn--cancel" onClick={handleCancel} disabled={saving}>
            İptal
          </button>
        </div>
      </div>
    );
  }

  if (confirmRemove) {
    return (
      <div className="brandmgr-row brandmgr-row--confirm">
        <span className="brandmgr-confirm-text">
          <strong>{brand}</strong> markasını tüm ürünlerden kaldırmak istediğinize emin misiniz?
          {productCount > 0 && (
            <span className="brandmgr-warn"> ({productCount} ürün etkilenecek)</span>
          )}
        </span>
        <div className="brandmgr-row-actions">
          <button className="brandmgr-btn brandmgr-btn--delete-confirm" onClick={handleRemove} disabled={saving}>
            {saving ? '…' : 'Evet, Kaldır'}
          </button>
          <button className="brandmgr-btn brandmgr-btn--cancel" onClick={() => setConfirmRemove(false)} disabled={saving}>
            Vazgeç
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="brandmgr-row">
      <div className="brandmgr-row-info">
        <span className="brandmgr-row-name">{brand}</span>
        <span className="brandmgr-row-count">{productCount} ürün</span>
      </div>
      <div className="brandmgr-row-actions">
        <button className="brandmgr-btn brandmgr-btn--edit" onClick={() => setEditing(true)}>
          Düzenle
        </button>
        <button className="brandmgr-btn brandmgr-btn--delete" onClick={() => setConfirmRemove(true)}>
          Kaldır
        </button>
      </div>
    </div>
  );
}

export default function BrandsManager({ onClose, products = [] }) {
  const { currentUser } = useAuth();

  const brands = useMemo(() => {
    const set = new Set();
    products.forEach((p) => {
      const b = (p.brand || '').trim();
      if (b) set.add(b);
    });
    return [...set].sort((a, b) => a.localeCompare(b, 'tr-TR'));
  }, [products]);

  const getProductCount = (brand) =>
    products.filter((p) => (p.brand || '').trim() === brand).length;

  const handleRename = async (oldBrand, newBrand) => {
    const affected = products.filter((p) => (p.brand || '').trim() === oldBrand);
    if (affected.length === 0) return;

    const updates = {};
    affected.forEach((p) => {
      updates[`products/${p.id}/brand`] = newBrand;
    });

    await update(ref(db), updates);

    await createLog(
      LOG_ACTIONS.PRODUCT_UPDATED,
      currentUser,
      { id: 'bulk', name: 'Toplu marka değişikliği', brand: newBrand },
      {
        brandChanged: { from: oldBrand, to: newBrand },
        affectedCount: affected.length,
      }
    );
  };

  const handleRemove = async (brand) => {
    const affected = products.filter((p) => (p.brand || '').trim() === brand);
    if (affected.length === 0) return;

    const updates = {};
    affected.forEach((p) => {
      updates[`products/${p.id}/brand`] = '';
    });

    await update(ref(db), updates);

    await createLog(
      LOG_ACTIONS.PRODUCT_UPDATED,
      currentUser,
      { id: 'bulk', name: 'Marka kaldırma', brand: '' },
      {
        brandChanged: { from: brand, to: '' },
        affectedCount: affected.length,
      }
    );
  };

  return (
    <div
      className="brandmgr-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="brandmgr-modal">
        <div className="brandmgr-header">
          <h2>Markaları Yönet</h2>
          <button className="brandmgr-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="brandmgr-body">
          <p className="brandmgr-hint">
            Marka adını düzenleyebilir veya tüm ürünlerden kaldırabilirsiniz. Düzenleme tüm ilgili ürünlere uygulanır.
          </p>

          <div className="brandmgr-list">
            {brands.length === 0 ? (
              <p className="brandmgr-empty">Henüz marka yok. Ürün ekledikçe markalar burada görünecek.</p>
            ) : (
              brands.map((brand) => (
                <BrandRow
                  key={brand}
                  brand={brand}
                  productCount={getProductCount(brand)}
                  onRename={handleRename}
                  onRemove={handleRemove}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
