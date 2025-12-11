// Ürünleri listeleyen component
import React, { useState } from 'react';
import ProductEditModal from './ProductEditModal';
import './ProductList.css';

function ProductList({ products, loading, onProductsChange, viewMode = 'grid', searchQuery = '', sortBy = 'alphabetical' }) {
  const [editModalProduct, setEditModalProduct] = useState(null);

  // Modal işlemleri
  const openEditModal = (product) => {
    setEditModalProduct(product);
  };

  const closeEditModal = () => {
    setEditModalProduct(null);
  };

  const handleProductUpdated = () => {
    // onProductsChange(); // Realtime listener otomatik güncelleme yapacak
  };

  // Stok durumu kontrolü
  const getStockStatus = (quantity) => {
    if (quantity === 0) return 'out-of-stock';
    if (quantity <= 5) return 'low-stock';
    return 'in-stock';
  };

  // Renk bilgisi varlığını kontrol et
  const hasColorInfo = (variants) => {
    if (!variants || variants.length === 0) return false;
    return variants.some(variant => 
      (variant.colorCode && variant.colorCode.trim()) || 
      (variant.colorName && variant.colorName.trim())
    );
  };

  // Tarih formatı
  const formatDate = (timestamp) => {
    if (!timestamp) return null;
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMinutes = Math.floor((now - date) / (1000 * 60));
    
    if (diffInMinutes < 1) {
      return 'Az önce güncellendi';
    } else if (diffInMinutes < 60) {
      return `${diffInMinutes} dakika önce güncellendi`;
    } else if (diffInMinutes < 1440) { // 24 saat
      const hours = Math.floor(diffInMinutes / 60);
      return `${hours} saat önce güncellendi`;
    } else {
      return `${date.toLocaleDateString('tr-TR', {
        day: '2-digit',
        month: '2-digit', 
        year: 'numeric'
      })} tarihinde güncellendi`;
    }
  };

  // Sıralama fonksiyonu
  const getSortedProducts = (products, sortType) => {
    if (!products || !Array.isArray(products) || products.length === 0) return [];
    
    const sortedProducts = [...products];
    
    switch (sortType) {
      case 'alphabetical':
        return sortedProducts.sort((a, b) => {
          const nameA = (a?.name || '').toLowerCase();
          const nameB = (b?.name || '').toLowerCase();
          return nameA.localeCompare(nameB, 'tr-TR');
        });
        
      case 'date-newest':
        return sortedProducts.sort((a, b) => {
          const dateA = new Date(a?.lastUpdated || a?.createdAt || 0);
          const dateB = new Date(b?.lastUpdated || b?.createdAt || 0);
          return dateB - dateA; // En yeni önce
        });
        
      case 'date-oldest':
        return sortedProducts.sort((a, b) => {
          const dateA = new Date(a?.lastUpdated || a?.createdAt || 0);
          const dateB = new Date(b?.lastUpdated || b?.createdAt || 0);
          return dateA - dateB; // En eski önce
        });

      case 'relevance':
        // Arama sonuçları zaten score'a göre sıralı gelir
        return sortedProducts;
        
      default:
        return sortedProducts;
    }
  };

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
  const getSearchResults = (products, query) => {
    if (!products || !Array.isArray(products)) return [];
    if (!query || query.trim() === '') return products;
    
    const searchTerms = query.toLowerCase()
      .split(' ')
      .filter(term => term.length > 0);
    
    if (searchTerms.length === 0) return products;
    
    // Her ürün için relevance score hesapla
    const scoredProducts = products.map(product => {
      if (!product || typeof product !== 'object') {
        return { ...product, searchScore: 0 };
      }
      
      const productText = `${product.name || ''} ${product.brand || ''} ${product.category || ''}`.toLowerCase();
      const words = productText.split(' ').filter(word => word.length > 0);
      
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
        ...product,
        searchScore: relevanceThreshold ? totalScore : 0
      };
    });
    
    // Score'a göre filtrele ve sırala
    return scoredProducts
      .filter(product => product.searchScore > 0)
      .sort((a, b) => b.searchScore - a.searchScore);
  };

  // Loading durumu kontrolü
  if (loading) {
    return (
      <div className="product-list-container">
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Ürünler yükleniyor...</p>
        </div>
      </div>
    );
  }

  // Products yoksa boş array kullan
  const safeProducts = products || [];

  // Ürün yoksa empty state göster
  if (safeProducts.length === 0) {
    return (
      <div className="product-list-container">
        <div className="empty-state">
          <div className="empty-icon">📦</div>
          <h3>Henüz ürün eklenmemiş</h3>
          <p>İlk ürününüzü eklemek için "Yeni Ürün Ekle" butonunu kullanın.</p>
        </div>
      </div>
    );
  }

  // Önce arama sonuçlarını al, sonra sırala
  const searchResults = getSearchResults(safeProducts, searchQuery);
  const finalProducts = getSortedProducts(searchResults, searchQuery ? 'relevance' : sortBy);

  // Arama sonucunda ürün bulunamadı
  if (searchQuery && finalProducts.length === 0) {
    return (
      <div className="product-list-container">
        <div className="search-empty-state">
          <div className="empty-icon">🔍</div>
          <h3>Arama sonucu bulunamadı</h3>
          <p>
            "<strong>{searchQuery}</strong>" için eşleşen ürün bulunamadı.<br/>
            Farklı kelimeler deneyebilir veya aramayı temizleyebilirsiniz.
          </p>
        </div>
      </div>
    );
  }

  // Liste görünümü için ürün render fonksiyonu
  const renderListItem = (product) => {
    const totalQuantity = product.totalQuantity || product.quantity || 0;
    const isOutOfStock = totalQuantity === 0;
    const itemClass = `product-list-item ${isOutOfStock ? 'out-of-stock-item' : ''}`;
    
    return (
      <div key={product.id} className={itemClass}>
      <div className="list-item-content">
        <div className="list-item-main">
          <div className="list-item-info">
            <h3 className="list-item-name">{product.name}</h3>
            <div className="list-item-meta">
              {product.brand && <span className="list-item-brand">{product.brand}</span>}
              <span className="list-item-category">{product.category}</span>
            </div>
            {product.description && (
              <p className="list-item-description">{product.description}</p>
            )}
          </div>
        
          <div className="list-item-quantities">
            {/* Yeni varyant sistemi */}
            {product.variants && product.variants.length > 0 ? (
              <div className="list-variants-info">
                {/* Mobil için ürün adı + marka ve kategori etiketleri */}
                <div className="mobile-header">
                  <h3 className="mobile-product-name">{product.name}</h3>
                  <div className="mobile-meta">
                    {product.brand && <span className="mobile-brand">{product.brand}</span>}
                    <span className="mobile-category">{product.category}</span>
                  </div>
                </div>
                
                <div className="list-total-quantity">
                  <span className="list-quantity-label">Toplam:</span>
                  <span className={`list-quantity-value ${getStockStatus(product.totalQuantity || 0)}`}>
                    {product.totalQuantity || 0}
                  </span>
                </div>
                
                <div className="list-variants-detail">
                  {hasColorInfo(product.variants) && product.variants.map((variant, variantIndex) => {
                    const currentQuantity = variant.quantity || 0;
                    const showColorInfo = (variant.colorCode && variant.colorCode.trim()) || 
                                         (variant.colorName && variant.colorName.trim());
                    
                    return (
                      <div key={variantIndex} className="list-variant-item">
                        {showColorInfo && (
                          <span className="list-variant-color">
                            <strong>{variant.colorCode}</strong> - {variant.colorName}
                          </span>
                        )}
                        <span className={`list-variant-quantity ${getStockStatus(currentQuantity)}`}>
                          {currentQuantity}
                        </span>
                      </div>
                    );
                  })}
                  
                  {/* Düzenleme butonu - varyantlarla aynı hizada */}
                  <button 
                    onClick={() => openEditModal(product)}
                    className="list-edit-btn mobile-edit-btn-inline"
                    title="Düzenle"
                  >
                    ✏️
                  </button>
                </div>
              </div>
            ) : (
              /* Eski sistem - backward compatibility */
              <div className="list-quantity-info">
                {/* Mobil için ürün adı + marka ve kategori etiketleri */}
                <div className="mobile-header">
                  <h3 className="mobile-product-name">{product.name}</h3>
                  <div className="mobile-meta">
                    {product.brand && <span className="mobile-brand">{product.brand}</span>}
                    <span className="mobile-category">{product.category}</span>
                  </div>
                </div>
                
                <div className="quantity-row">
                  <span className="list-quantity-label">Adet:</span>
                  <span className={`list-quantity-value ${getStockStatus(product.quantity)}`}>
                    {product.quantity}
                  </span>
                  
                  {/* Düzenleme butonu - adet bilgisiyle aynı hizada */}
                  <button 
                    onClick={() => openEditModal(product)}
                    className="list-edit-btn mobile-edit-btn-inline"
                    title="Düzenle"
                  >
                    ✏️
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Masaüstü düzenleme butonu */}
        <button 
          onClick={() => openEditModal(product)}
          className="list-edit-btn desktop-edit-btn"
          title="Düzenle"
        >
          ✏️
        </button>
      </div>
      
      {/* Son güncelleme tarihi - Kutunun en alt kısmında */}
      {(product.lastUpdated || product.createdAt) && (
        <div className="list-item-date-bottom">
          {formatDate(product.lastUpdated || product.createdAt)}
        </div>
      )}
    </div>
  );
  };

  // Grid görünümü için ürün render fonksiyonu (mevcut tasarım)
  const renderGridItem = (product) => {
    const totalQuantity = product.totalQuantity || product.quantity || 0;
    const isOutOfStock = totalQuantity === 0;
    const cardClass = `product-card ${isOutOfStock ? 'out-of-stock-item' : ''}`;
    
    return (
      <div key={product.id} className={cardClass}>
      <div className="product-header" onClick={() => openEditModal(product)}>
        <h3 className="product-name" title="Düzenlemek için tıklayın">
          {product.name} ✏️
        </h3>
        <div className="product-meta">
          {product.brand && <span className="product-brand">{product.brand}</span>}
          <span className="product-category">{product.category}</span>
        </div>
      </div>

      <div className="product-info">
        {/* Yeni varyant sistemi */}
        {product.variants && product.variants.length > 0 ? (
          <div className="variants-info">
            <div className="total-quantity-info">
              <span className="quantity-label">Toplam:</span>
              <span className={`quantity-value ${getStockStatus(product.totalQuantity || 0)}`}>
                {product.totalQuantity || 0}
              </span>
            </div>
            
            {hasColorInfo(product.variants) && (
              <div className="variants-list">
                {product.variants.map((variant, variantIndex) => {
                  const currentQuantity = variant.quantity || 0;
                  const showColorInfo = (variant.colorCode && variant.colorCode.trim()) || 
                                       (variant.colorName && variant.colorName.trim());
                  
                  return (
                    <div key={variantIndex} className="variant-item">
                      <div className="variant-info">
                        {showColorInfo && (
                          <span className="variant-color">
                            <strong>{variant.colorCode}</strong> - {variant.colorName}
                          </span>
                        )}
                        <span className={`quantity-value ${getStockStatus(currentQuantity)}`}>
                          {currentQuantity}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Eski sistem - backward compatibility */
          <div className="quantity-info">
            <span className="quantity-label">Adet:</span>
            <span className={`quantity-value ${getStockStatus(product.quantity)}`}>
              {product.quantity}
            </span>
          </div>
        )}

        {product.description && (
          <div className="product-description" onClick={() => openEditModal(product)}>
            <p title="Düzenlemek için tıklayın">{product.description}</p>
          </div>
        )}

        {/* Son güncelleme tarihi */}
        {(product.lastUpdated || product.createdAt) && (
          <div className="product-date">
            {formatDate(product.lastUpdated || product.createdAt)}
          </div>
        )}
      </div>
    </div>
  );
  };

  return (
    <div className="product-list-container">
      <div className="product-list-header">
        <h2>
          Ürün Listesi ({finalProducts.length}
          {searchQuery && finalProducts.length !== safeProducts.length ? ` / ${safeProducts.length}` : ''} ürün)
        </h2>
        
        {searchQuery && (
          <div className="search-info">
            {finalProducts.length > 0 ? (
              <span className="search-results-count">
                "{searchQuery}" için {finalProducts.length} sonuç bulundu
              </span>
            ) : (
              <span className="no-results">
                "{searchQuery}" için sonuç bulunamadı
              </span>
            )}
          </div>
        )}
      </div>
      
      {viewMode === 'grid' ? (
        <div className="products-grid">
          {finalProducts.map(renderGridItem)}
        </div>
      ) : (
        <div className="products-list">
          {finalProducts.map(renderListItem)}
        </div>
      )}

      {/* Edit Modal */}
      {editModalProduct && (
        <ProductEditModal 
          product={editModalProduct}
          onClose={closeEditModal}
          onProductUpdated={handleProductUpdated}
        />
      )}
    </div>
  );
}

export default ProductList; 