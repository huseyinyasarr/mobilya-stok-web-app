// Activity Logs Component - İşlem geçmişini görüntüler
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ref, onValue, query, orderByChild, limitToLast } from 'firebase/database';
import { db } from '../firebase';
import { scoreSearchTerms, formatRelativeDate } from '../utils/fuzzySearch';
import './ActivityLogs.css';

// ── Modül scope saf fonksiyonlar ─────────────────────────────────────────────

function getActionIcon(action) {
  switch (action) {
    case 'PRODUCT_CREATED': return '➕';
    case 'PRODUCT_UPDATED':
    case 'PRODUCT_QUANTITY_CHANGED': return '✏️';
    case 'PRODUCT_DELETED': return '🗑️';
    default: return '📝';
  }
}

function getActionClass(action) {
  switch (action) {
    case 'PRODUCT_CREATED': return 'action-created';
    case 'PRODUCT_UPDATED':
    case 'PRODUCT_QUANTITY_CHANGED': return 'action-updated';
    case 'PRODUCT_DELETED': return 'action-deleted';
    default: return 'action-default';
  }
}

const ACTION_GROUPS = {
  created: ['PRODUCT_CREATED'],
  updated: ['PRODUCT_UPDATED', 'PRODUCT_QUANTITY_CHANGED'],
  deleted: ['PRODUCT_DELETED'],
};

function searchLogs(logs, query) {
  if (!query || query.trim() === '') return logs;
  const searchTerms = query.toLowerCase().split(' ').filter((t) => t.length > 0);
  if (searchTerms.length === 0) return logs;

  return logs
    .map((log) => {
      if (!log || typeof log !== 'object') return { ...log, searchScore: 0 };
      const text = [
        log.productName || '',
        log.description || '',
        log.user?.displayName || '',
        log.user?.email || '',
        ...(log.details?.variantChanges?.added || []).map((v) => `${v.colorCode} ${v.colorName}`),
        ...(log.details?.variantChanges?.modified || []).map((v) => `${v.colorCode} ${v.colorName}`),
        ...(log.details?.variantChanges?.removed || []).map((v) => `${v.colorCode} ${v.colorName}`),
        log.details?.brandName || '',
        log.details?.categoryName || '',
      ].join(' ').toLowerCase();

      const words = text.split(' ').filter((w) => w.length > 0);
      const { totalScore, foundTerms } = scoreSearchTerms(words, searchTerms);
      const passes = foundTerms >= Math.ceil(searchTerms.length / 2);
      return { ...log, searchScore: passes ? totalScore : 0 };
    })
    .filter((l) => l.searchScore > 0)
    .sort((a, b) => b.searchScore - a.searchScore);
}

// ── Component ─────────────────────────────────────────────────────────────────

function ActivityLogs({ onClose }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceRef = useRef(null);

  // Log kayıtlarını gerçek zamanlı dinle
  useEffect(() => {
    const logsRef = ref(db, 'logs');
    const q = query(logsRef, orderByChild('timestamp'), limitToLast(200));
    let unsubscribe;
    try {
      unsubscribe = onValue(q, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const logsData = Object.keys(data)
            .map((key) => ({ id: key, ...data[key] }))
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          setLogs(logsData);
        } else {
          setLogs([]);
        }
        setLoading(false);
      }, (error) => {
        console.error('Log kayıtları getirilirken hata:', error);
        setLogs([]);
        setLoading(false);
      });
    } catch (error) {
      console.error('Log dinleme hatası:', error);
      setLoading(false);
    }
    return () => unsubscribe && unsubscribe();
  }, []);

  // Debounce arama girdisi
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(value), 200);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setDebouncedQuery('');
    clearTimeout(debounceRef.current);
  };

  // Tüm filtreleme useMemo ile türetilmiş değer
  const filteredLogs = useMemo(() => {
    let result = logs;

    // Zaman filtresi
    if (filter !== 'all') {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      let cutoff;
      if (filter === 'today') cutoff = startOfDay;
      else if (filter === 'week') cutoff = new Date(startOfDay - 7 * 24 * 60 * 60 * 1000);
      else if (filter === 'month') cutoff = new Date(startOfDay - 30 * 24 * 60 * 60 * 1000);
      if (cutoff) result = result.filter((l) => new Date(l.timestamp) >= cutoff);
    }

    // İşlem türü filtresi
    const group = ACTION_GROUPS[actionFilter];
    if (group) result = result.filter((l) => group.includes(l.action));

    // Arama filtresi
    return searchLogs(result, debouncedQuery);
  }, [logs, filter, actionFilter, debouncedQuery]);

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const formatDate = (ts) => formatRelativeDate(ts);

  return (
    <div className="logs-modal-backdrop" onClick={handleBackdropClick}>
      <div className="logs-modal-content">
        <div className="logs-modal-header">
          <h2>📋 İşlem Geçmişi</h2>
          <button onClick={onClose} className="logs-close-btn">✕</button>
        </div>

        {/* Arama Çubuğu */}
        <div className="logs-search">
          <div className="logs-search-input-container">
            <input
              type="text"
              placeholder="İşlem geçmişinde ara... (ürün adı, kullanıcı, renk kodu vs.)"
              value={searchQuery}
              onChange={handleSearchChange}
              className="logs-search-input"
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="logs-clear-search-btn"
                title="Aramayı temizle"
              >
                ✕
              </button>
            )}
            <div className="logs-search-icon">🔍</div>
          </div>
          {searchQuery && (
            <div className="logs-search-info">
              {filteredLogs.length > 0 ? (
                <span className="logs-search-results-count">
                  "{searchQuery}" için {filteredLogs.length} sonuç bulundu
                </span>
              ) : (
                <span className="logs-no-results">
                  "{searchQuery}" için sonuç bulunamadı
                </span>
              )}
            </div>
          )}
        </div>

        {/* Filtreler */}
        <div className="logs-filters">
          <div className="filter-group">
            <label>Zaman:</label>
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">Tüm Zamanlar</option>
              <option value="today">Bugün</option>
              <option value="week">Son 7 Gün</option>
              <option value="month">Son 30 Gün</option>
            </select>
          </div>
          
          <div className="filter-group">
            <label>İşlem:</label>
            <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
              <option value="all">Tüm İşlemler</option>
              <option value="created">Ürün Ekleme</option>
              <option value="updated">Ürün Güncelleme</option>
              <option value="deleted">Ürün Silme</option>
            </select>
          </div>
        </div>

        {/* Log listesi */}
        <div className="logs-content">
          {loading ? (
            <div className="logs-loading">
              <div className="loading-spinner"></div>
              <p>İşlem geçmişi yükleniyor...</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="logs-empty">
              <div className="empty-icon">📝</div>
              <h3>
                {searchQuery ? 'Arama sonucu bulunamadı' : 'Henüz işlem kaydı bulunmuyor'}
              </h3>
              <p>
                {searchQuery 
                  ? `"${searchQuery}" için eşleşen işlem geçmişi bulunamadı. Farklı kelimeler deneyebilirsiniz.`
                  : 'Seçili filtrelere uygun işlem geçmişi bulunamadı.'
                }
              </p>
              {searchQuery && (
                <button onClick={clearSearch} className="logs-clear-search-button">
                  Aramayı Temizle
                </button>
              )}
            </div>
          ) : (
            <div className="logs-list">
              {filteredLogs.map((log) => (
                <div 
                  key={log.id} 
                  className={`log-item ${getActionClass(log.action)} ${
                    searchQuery && log.isVisible !== undefined 
                      ? log.isVisible ? 'log-visible' : 'log-hidden' 
                      : 'log-visible'
                  }`}
                >
                  <div className="log-icon">
                    {getActionIcon(log.action)}
                  </div>
                  
                  <div className="log-details">
                    <div className="log-description">
                      {log.description}
                    </div>
                    
                    <div className="log-meta">
                      <div className="log-user">
                        {log.user?.photoURL && (
                          <img 
                            src={log.user.photoURL} 
                            alt={log.user.displayName}
                            className="user-avatar"
                          />
                        )}
                        <span className="user-name">
                          {log.user?.displayName || log.user?.email || 'Bilinmeyen Kullanıcı'}
                        </span>
                      </div>
                      
                      <div className="log-time">
                        {formatDate(log.timestamp)}
                      </div>
                    </div>
                    
                    {/* Detaylar varsa göster */}
                    {log.details && Object.keys(log.details).length > 0 && (
                      <div className="log-extra-details">
                        {log.details.quantityChange && (
                          <span className="detail-item quantity-change">
                            Toplam Stok: {log.details.quantityChange.from} → {log.details.quantityChange.to}
                          </span>
                        )}
                        
                        {log.details.variantChanges && (
                          <div className="variant-changes">
                            {/* Eklenen renkler */}
                            {log.details.variantChanges.added && log.details.variantChanges.added.map((variant, index) => (
                              <span key={`added-${index}`} className="detail-item variant-added">
                                ➕ {variant.colorCode} {variant.colorName} ({variant.quantity} adet)
                              </span>
                            ))}
                            
                            {/* Değişen renkler */}
                            {log.details.variantChanges.modified && log.details.variantChanges.modified.map((change, index) => (
                              <span key={`modified-${index}`} className="detail-item variant-modified">
                                ✏️ {change.colorCode} {change.colorName}: {change.oldQuantity} → {change.newQuantity}
                              </span>
                            ))}
                            
                            {/* Silinen renkler */}
                            {log.details.variantChanges.removed && log.details.variantChanges.removed.map((variant, index) => (
                              <span key={`removed-${index}`} className="detail-item variant-removed">
                                🗑️ {variant.colorCode} {variant.colorName} ({variant.quantity} adet)
                              </span>
                            ))}
                          </div>
                        )}
                        
                        {log.details.nameChanged && (
                          <span className="detail-item name-changed">
                            İsim değiştirildi: "{log.details.nameChanged.from}" → "{log.details.nameChanged.to}"
                          </span>
                        )}
                        {log.details.brandChanged && (
                          <span className="detail-item brand-changed">
                            Marka değiştirildi: "{log.details.brandChanged.from}" → "{log.details.brandChanged.to}"
                          </span>
                        )}
                        {log.details.categoryChanged && (
                          <span className="detail-item category-changed">
                            Kategori değiştirildi: "{log.details.categoryChanged.from}" → "{log.details.categoryChanged.to}"
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Özet bilgisi */}
        {!loading && (
          <div className="logs-summary">
            {filteredLogs.length} işlem gösteriliyor
            {logs.length !== filteredLogs.length && ` (toplam ${logs.length} kayıt)`}
          </div>
        )}
      </div>
    </div>
  );
}

export default ActivityLogs; 