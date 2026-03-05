import React, { useState } from 'react';
import { useCategories } from '../contexts/CategoriesContext';
import './CategoriesManager.css';

// Sık kullanılan emoji önerileri
const ICON_SUGGESTIONS = [
  '🛏️','🛋️','💺','🪑','🚪','🗄️','📦','🪞','🛁','🚿',
  '🖼️','🏮','🕯️','🪴','🛺','📺','🖥️','🎋','🪵','🧸',
];

function CategoryRow({ cat, onSave, onDelete, products }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(cat.name);
  const [icon, setIcon] = useState(cat.icon || '📦');
  const [saving, setSaving] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const productCount = products.filter((p) => p.category === cat.id).length;

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave(cat.id, { name: name.trim(), icon });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setName(cat.name);
    setIcon(cat.icon || '📦');
    setEditing(false);
    setShowIconPicker(false);
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await onDelete(cat.id);
    } finally {
      setSaving(false);
      setConfirmDelete(false);
    }
  };

  if (editing) {
    return (
      <div className="catmgr-row catmgr-row--editing">
        <div className="catmgr-edit-fields">
          {/* İkon seçici */}
          <div className="catmgr-icon-picker-wrapper">
            <button
              type="button"
              className="catmgr-icon-btn"
              onClick={() => setShowIconPicker((v) => !v)}
              title="İkonu değiştir"
            >
              {icon}
            </button>
            {showIconPicker && (
              <div className="catmgr-icon-grid">
                {ICON_SUGGESTIONS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    className={`catmgr-icon-option${em === icon ? ' selected' : ''}`}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      setIcon(em);
                      setShowIconPicker(false);
                    }}
                  >
                    {em}
                  </button>
                ))}
                <input
                  type="text"
                  className="catmgr-icon-custom"
                  placeholder="Emoji yaz…"
                  maxLength={4}
                  onChange={(e) => {
                    const val = [...e.target.value].filter((c) => {
                      const cp = c.codePointAt(0);
                      return cp > 127;
                    }).join('');
                    if (val) setIcon(val);
                  }}
                />
              </div>
            )}
          </div>

          <input
            type="text"
            className="catmgr-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel(); }}
          />
        </div>
        <div className="catmgr-row-actions">
          <button className="catmgr-btn catmgr-btn--save" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? '…' : 'Kaydet'}
          </button>
          <button className="catmgr-btn catmgr-btn--cancel" onClick={handleCancel} disabled={saving}>
            İptal
          </button>
        </div>
      </div>
    );
  }

  if (confirmDelete) {
    return (
      <div className="catmgr-row catmgr-row--confirm">
        <span className="catmgr-confirm-text">
          <strong>{cat.icon} {cat.name}</strong> silinsin mi?
          {productCount > 0 && (
            <span className="catmgr-warn"> ({productCount} ürün bu kategoride)</span>
          )}
        </span>
        <div className="catmgr-row-actions">
          <button className="catmgr-btn catmgr-btn--delete-confirm" onClick={handleDelete} disabled={saving}>
            {saving ? '…' : 'Evet, Sil'}
          </button>
          <button className="catmgr-btn catmgr-btn--cancel" onClick={() => setConfirmDelete(false)} disabled={saving}>
            Vazgeç
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="catmgr-row">
      <div className="catmgr-row-info">
        <span className="catmgr-row-icon">{cat.icon || '📦'}</span>
        <span className="catmgr-row-name">{cat.name}</span>
        <span className="catmgr-row-count">{productCount} ürün</span>
      </div>
      <div className="catmgr-row-actions">
        <button className="catmgr-btn catmgr-btn--edit" onClick={() => setEditing(true)}>
          Düzenle
        </button>
        <button className="catmgr-btn catmgr-btn--delete" onClick={() => setConfirmDelete(true)}>
          Sil
        </button>
      </div>
    </div>
  );
}

function AddCategoryForm({ onAdd }) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('📦');
  const [adding, setAdding] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setAdding(true);
    try {
      await onAdd(name.trim(), icon);
      setName('');
      setIcon('📦');
    } finally {
      setAdding(false);
    }
  };

  return (
    <form className="catmgr-add-form" onSubmit={handleSubmit}>
      <div className="catmgr-add-fields">
        <div className="catmgr-icon-picker-wrapper">
          <button
            type="button"
            className="catmgr-icon-btn"
            onClick={() => setShowIconPicker((v) => !v)}
          >
            {icon}
          </button>
          {showIconPicker && (
            <div className="catmgr-icon-grid">
              {ICON_SUGGESTIONS.map((em) => (
                <button
                  key={em}
                  type="button"
                  className={`catmgr-icon-option${em === icon ? ' selected' : ''}`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    setIcon(em);
                    setShowIconPicker(false);
                  }}
                >
                  {em}
                </button>
              ))}
              <input
                type="text"
                className="catmgr-icon-custom"
                placeholder="Emoji yaz…"
                maxLength={4}
                onChange={(e) => {
                  const val = [...e.target.value].filter((c) => {
                    const cp = c.codePointAt(0);
                    return cp > 127;
                  }).join('');
                  if (val) setIcon(val);
                }}
              />
            </div>
          )}
        </div>
        <input
          type="text"
          className="catmgr-name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Yeni kategori adı..."
        />
      </div>
      <button
        type="submit"
        className="catmgr-btn catmgr-btn--add"
        disabled={adding || !name.trim()}
      >
        {adding ? 'Ekleniyor…' : '＋ Ekle'}
      </button>
    </form>
  );
}

export default function CategoriesManager({ onClose, products = [] }) {
  const { categories, addCategory, updateCategory, deleteCategory } = useCategories();

  return (
    <div
      className="catmgr-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="catmgr-modal">
        <div className="catmgr-header">
          <h2>Kategorileri Yönet</h2>
          <button className="catmgr-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="catmgr-body">
          <p className="catmgr-hint">
            Kategorilerin adını ve ikonunu düzenleyebilir, yenilerini ekleyebilir veya silebilirsiniz.
          </p>

          <div className="catmgr-list">
            {categories.map((cat) => (
              <CategoryRow
                key={cat.id}
                cat={cat}
                onSave={updateCategory}
                onDelete={deleteCategory}
                products={products}
              />
            ))}
          </div>
        </div>

        <div className="catmgr-footer">
          <p className="catmgr-footer-label">Yeni Kategori Ekle</p>
          <AddCategoryForm onAdd={addCategory} />
        </div>
      </div>
    </div>
  );
}
