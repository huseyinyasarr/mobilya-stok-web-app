import React from 'react';
import './SettingsModal.css';

const SETTINGS_ITEMS = [
  {
    id: 'report',
    icon: '📊',
    title: 'Özet / Rapor Al',
    desc: 'Tüm ürünleri listele, marka ve kategoriye göre filtrele',
  },
  {
    id: 'logs',
    icon: '📋',
    title: 'İşlem Geçmişi',
    desc: 'Ürün ekleme, güncelleme ve silme kayıtları',
  },
  {
    id: 'categories',
    icon: '🏷️',
    title: 'Kategoriler',
    desc: 'Kategori adı ve ikonlarını düzenle, yeni ekle',
  },
  {
    id: 'brands',
    icon: '🏭',
    title: 'Markalar',
    desc: 'Marka adını düzenle veya toplu değiştir',
  },
  {
    id: 'products',
    icon: '📦',
    title: 'Ürünler',
    desc: 'Toplu ürün silme ve ürün yönetimi',
  },
  {
    id: 'logout',
    icon: '⏻',
    title: 'Çıkış Yap',
    desc: 'Hesabınızdan güvenli şekilde çıkış yapın',
    danger: true,
  },
];

export default function SettingsModal({ onClose, onOpenReport, onOpenLogs, onOpenCategories, onOpenBrands, onOpenProducts, onLogout, user }) {
  const handleItem = (id) => {
    onClose();
    if (id === 'report') onOpenReport?.();
    if (id === 'logs') onOpenLogs();
    if (id === 'categories') onOpenCategories();
    if (id === 'brands') onOpenBrands?.();
    if (id === 'products') onOpenProducts?.();
    if (id === 'logout') onLogout();
  };

  return (
    <div
      className="settings-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="settings-modal">
        <div className="settings-header">
          <div className="settings-header-left">
            <span className="settings-header-icon">⚙</span>
            <h2>Ayarlar</h2>
          </div>
          <button className="settings-close-btn" onClick={onClose}>✕</button>
        </div>

        {user && (
          <div className="settings-user-card">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName}
                className="settings-user-avatar"
              />
            ) : (
              <div className="settings-user-avatar settings-user-avatar--placeholder">
                {(user.displayName || user.email || '?')[0].toUpperCase()}
              </div>
            )}
            <div className="settings-user-info">
              <span className="settings-user-name">{user.displayName || 'Kullanıcı'}</span>
              <span className="settings-user-email">{user.email}</span>
            </div>
          </div>
        )}

        <div className="settings-body">
          {SETTINGS_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`settings-item${item.danger ? ' settings-item--danger' : ''}`}
              onClick={() => handleItem(item.id)}
            >
              <span className="settings-item-icon">{item.icon}</span>
              <div className="settings-item-text">
                <span className="settings-item-title">{item.title}</span>
                <span className="settings-item-desc">{item.desc}</span>
              </div>
              <span className="settings-item-arrow">›</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
