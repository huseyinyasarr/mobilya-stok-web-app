// Activity Logs Component - İşlem geçmişini görüntüler
import React, { useState, useEffect } from 'react';
import { ref, onValue, query, orderByChild, limitToLast } from 'firebase/database';
import { db } from '../firebase';
import './ActivityLogs.css';

function ActivityLogs({ onClose }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, today, week, month
  const [actionFilter, setActionFilter] = useState('all'); // all, created, updated, deleted
  const [searchQuery, setSearchQuery] = useState(''); // Arama sorgusu
  const [isSearching, setIsSearching] = useState(false); // Sadece search bar loading için
  const [searchResults, setSearchResults] = useState([]); // Arama sonuçları
  const [filteredLogs, setFilteredLogs] = useState([]); // Gerçek zamanlı filtrelenmiş sonuçlar

  // Log kayıtlarını getir
  useEffect(() => {
    try {
      const logsRef = ref(db, 'logs');
      // Son 200 kaydı getir, timestamp'e göre sıralı
      const q = query(logsRef, orderByChild('timestamp'), limitToLast(200));
      
      const unsubscribe = onValue(q, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const logsData = Object.keys(data)
            .map(key => ({
              id: key,
              ...data[key]
            }))
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // En yeni önce
          
          setLogs(logsData);
          setFilteredLogs(logsData); // Başlangıçta tüm loglar gösteriliyor
        } else {
          setLogs([]);
          setFilteredLogs([]);
        }
        setLoading(false);
      }, (error) => {
        console.error('Log kayıtları getirilirken hata:', error);
        setLogs([]);
        setFilteredLogs([]);
        setLoading(false);
      });

      return () => unsubscribe();
    } catch (error) {
      console.error('Log dinleme hatası:', error);
      setLoading(false);
    }
  }, []);

  // String benzerlik hesaplama (Jaro-Winkler benzeri)
  const calculateSimilarity = (str1, str2) => {
    if (typeof str1 !== 'string' || typeof str2 !== 'string') return 0;
    if (str1 === str2) return 1;
    if (str1.length === 0 || str2.length === 0) return 0;
    
    const matches = [];
    const s1_matches = new Array(str1.length).fill(false);
    const s2_matches = new Array(str2.length).fill(false);
    
    const match_distance = Math.floor(Math.max(str1.length, str2.length) / 2) - 1;
    let matches_count = 0;
    
    // Eşleşmeleri bul
    for (let i = 0; i < str1.length; i++) {
      const start = Math.max(0, i - match_distance);
      const end = Math.min(i + match_distance + 1, str2.length);
      
      for (let j = start; j < end; j++) {
        if (s2_matches[j] || str1[i] !== str2[j]) continue;
        s1_matches[i] = s2_matches[j] = true;
        matches.push(str1[i]);
        matches_count++;
        break;
      }
    }
    
    if (matches_count === 0) return 0;
    
    // Transpozisyonları hesapla
    let transpositions = 0;
    let k = 0;
    for (let i = 0; i < str1.length; i++) {
      if (!s1_matches[i]) continue;
      while (!s2_matches[k]) k++;
      if (str1[i] !== str2[k]) transpositions++;
      k++;
    }
    
    const jaro = (matches_count / str1.length + matches_count / str2.length + 
                  (matches_count - transpositions / 2) / matches_count) / 3;
    
    return jaro;
  };

  // Akıllı arama fonksiyonu
  const getSearchResults = (logs, query) => {
    if (!logs || !Array.isArray(logs)) return [];
    if (!query || query.trim() === '') return logs;
    
    const searchTerms = query.toLowerCase()
      .split(' ')
      .filter(term => term.length > 0);
    
    if (searchTerms.length === 0) return logs;
    
    // Her log için relevance score hesapla
    const scoredLogs = logs.map(log => {
      if (!log || typeof log !== 'object') {
        return { ...log, searchScore: 0 };
      }
      
      // Aranabilir metin oluştur
      const searchableText = [
        log.productName || '',
        log.description || '',
        log.user?.displayName || '',
        log.user?.email || '',
        // Variant detayları
        ...(log.details?.variantChanges?.added || []).map(v => `${v.colorCode} ${v.colorName}`),
        ...(log.details?.variantChanges?.modified || []).map(v => `${v.colorCode} ${v.colorName}`),
        ...(log.details?.variantChanges?.removed || []).map(v => `${v.colorCode} ${v.colorName}`),
        // Diğer detaylar
        log.details?.brandName || '',
        log.details?.categoryName || ''
      ].join(' ').toLowerCase();
      
      const words = searchableText.split(' ').filter(word => word.length > 0);
      
      let totalScore = 0;
      let foundTerms = 0;
      
      searchTerms.forEach(term => {
        let bestScore = 0;
        let termFound = false;
        
        words.forEach(word => {
          if (word === term) {
            // Tam kelime eşleşmesi
            bestScore = Math.max(bestScore, 100);
            termFound = true;
          } else if (word.startsWith(term)) {
            // Kelime başlangıcı eşleşmesi
            bestScore = Math.max(bestScore, 80);
            termFound = true;
          } else if (word.includes(term)) {
            // Kelime içi eşleşme
            bestScore = Math.max(bestScore, 50);
            termFound = true;
          } else if (term.length >= 3) {
            // Fuzzy matching
            const similarity = calculateSimilarity(term, word);
            if (similarity > 0.7) {
              bestScore = Math.max(bestScore, similarity * 40);
              termFound = true;
            }
          }
        });
        
        if (termFound) {
          foundTerms++;
          totalScore += bestScore;
        }
      });
      
      // En az terimlerin yarısı bulunmuş olmalı
      const relevanceThreshold = foundTerms >= Math.ceil(searchTerms.length / 2);
      
      return {
        ...log,
        searchScore: relevanceThreshold ? totalScore : 0,
        isVisible: relevanceThreshold
      };
    });
    
    // Score'a göre sırala
    return scoredLogs.sort((a, b) => b.searchScore - a.searchScore);
  };

  // Arama işlevi değiştiğinde - gerçek zamanlı filtreleme
  const handleSearchChange = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    
    // Sadece search bar'da loading göster
    setIsSearching(true);
    
    // Küçük bir debounce ile arama
    setTimeout(() => {
      const baseResults = getBaseFilteredLogs(logs);
      
      if (query.trim() !== '') {
        const results = getSearchResults(baseResults, query);
        setSearchResults(results);
        setFilteredLogs(results);
      } else {
        setSearchResults([]);
        setFilteredLogs(baseResults);
      }
      
      setIsSearching(false);
    }, 200);
  };

  // Arama temizleme
  const clearSearch = () => {
    setIsSearching(false);
    setSearchResults([]);
    setSearchQuery('');
    setFilteredLogs(getBaseFilteredLogs(logs));
  };

  // Temel filtreleme (zaman ve işlem türü)
  const getBaseFilteredLogs = (logs) => {
    let filtered = [...logs];
    
    // Zaman filtresi
    if (filter !== 'all') {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      let cutoffDate;
      
      switch (filter) {
        case 'today':
          cutoffDate = startOfDay;
          break;
        case 'week':
          cutoffDate = new Date(startOfDay.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          cutoffDate = new Date(startOfDay.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          cutoffDate = null;
      }
      
      if (cutoffDate) {
        filtered = filtered.filter(log => new Date(log.timestamp) >= cutoffDate);
      }
    }
    
    // İşlem türü filtresi
    if (actionFilter !== 'all') {
      const actionMap = {
        'created': 'PRODUCT_CREATED',
        'updated': 'PRODUCT_UPDATED', 
        'deleted': 'PRODUCT_DELETED'
      };
      
      if (actionMap[actionFilter]) {
        filtered = filtered.filter(log => log.action === actionMap[actionFilter]);
      }
    }
    
    return filtered;
  };

  // Filtreler değiştiğinde
  useEffect(() => {
    const baseFiltered = getBaseFilteredLogs(logs);
    
    if (searchQuery.trim()) {
      const results = getSearchResults(baseFiltered, searchQuery);
      setSearchResults(results);
      setFilteredLogs(results);
    } else {
      setFilteredLogs(baseFiltered);
    }
  }, [filter, actionFilter, logs]);

  // Tarih formatı
  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMinutes = Math.floor((now - date) / (1000 * 60));
    
    if (diffInMinutes < 1) {
      return 'Az önce';
    } else if (diffInMinutes < 60) {
      return `${diffInMinutes} dakika önce`;
    } else if (diffInMinutes < 1440) { // 24 saat
      const hours = Math.floor(diffInMinutes / 60);
      return `${hours} saat önce`;
    } else {
      return date.toLocaleDateString('tr-TR', {
        day: '2-digit',
        month: '2-digit', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  };

  // İşlem türüne göre ikon
  const getActionIcon = (action) => {
    switch (action) {
      case 'PRODUCT_CREATED':
        return '➕';
      case 'PRODUCT_UPDATED':
        return '✏️';
      case 'PRODUCT_DELETED':
        return '🗑️';
      default:
        return '📝';
    }
  };

  // İşlem türüne göre renk sınıfı
  const getActionClass = (action) => {
    switch (action) {
      case 'PRODUCT_CREATED':
        return 'action-created';
      case 'PRODUCT_UPDATED':
        return 'action-updated';
      case 'PRODUCT_DELETED':
        return 'action-deleted';
      default:
        return 'action-default';
    }
  };

  // Modal dışına tıklama ile kapatma
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

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
            <div className="logs-search-icon">
              {isSearching ? (
                <div className="logs-inline-spinner"></div>
              ) : (
                '🔍'
              )}
            </div>
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
                            {/* Eklenen varyantlar */}
                            {log.details.variantChanges.added && log.details.variantChanges.added.map((variant, index) => (
                              <span key={`added-${index}`} className="detail-item variant-added">
                                ➕ {variant.colorCode} {variant.colorName} ({variant.quantity} adet)
                              </span>
                            ))}
                            
                            {/* Değişen varyantlar */}
                            {log.details.variantChanges.modified && log.details.variantChanges.modified.map((change, index) => (
                              <span key={`modified-${index}`} className="detail-item variant-modified">
                                ✏️ {change.colorCode} {change.colorName}: {change.oldQuantity} → {change.newQuantity}
                              </span>
                            ))}
                            
                            {/* Silinen varyantlar */}
                            {log.details.variantChanges.removed && log.details.variantChanges.removed.map((variant, index) => (
                              <span key={`removed-${index}`} className="detail-item variant-removed">
                                🗑️ {variant.colorCode} {variant.colorName} ({variant.quantity} adet)
                              </span>
                            ))}
                          </div>
                        )}
                        
                        {log.details.nameChanged && (
                          <span className="detail-item name-changed">
                            İsim değiştirildi
                          </span>
                        )}
                        
                        {log.details.categoryChanged && (
                          <span className="detail-item category-changed">
                            Kategori değiştirildi
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