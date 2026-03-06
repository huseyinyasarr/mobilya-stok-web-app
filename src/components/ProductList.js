// Ürünleri listeleyen component
import React, { useState, useMemo } from 'react';
import ProductEditModal from './ProductEditModal';
import { scoreSearchTerms, formatRelativeDate } from '../utils/fuzzySearch';
import './ProductList.css';

// ── Modül scope saf fonksiyonlar ─────────────────────────────────────────────

function getStockStatus(quantity) {
  if (quantity === 0) return 'out-of-stock';
  if (quantity <= 5) return 'low-stock';
  return 'in-stock';
}

function hasColorInfo(variants) {
  if (!variants || variants.length === 0) return false;
  return variants.some(
    (v) => (v.colorCode && v.colorCode.trim()) || (v.colorName && v.colorName.trim())
  );
}

function formatDate(timestamp) {
  return formatRelativeDate(timestamp, ' güncellendi');
}

function getSortedProducts(products, sortType) {
  if (!products || products.length === 0) return [];
  const sorted = [...products];
  switch (sortType) {
    case 'alphabetical':
      return sorted.sort((a, b) =>
        (a?.name || '').toLowerCase().localeCompare((b?.name || '').toLowerCase(), 'tr-TR')
      );
    case 'date-newest':
      return sorted.sort(
        (a, b) =>
          new Date(b?.lastUpdated || b?.createdAt || 0) -
          new Date(a?.lastUpdated || a?.createdAt || 0)
      );
    case 'date-oldest':
      return sorted.sort(
        (a, b) =>
          new Date(a?.lastUpdated || a?.createdAt || 0) -
          new Date(b?.lastUpdated || b?.createdAt || 0)
      );
    default:
      return sorted;
  }
}

function getSearchResults(products, query) {
  if (!products || !Array.isArray(products)) return [];
  if (!query || query.trim() === '') return products;

  const searchTerms = query.toLowerCase().split(' ').filter((t) => t.length > 0);
  if (searchTerms.length === 0) return products;

  return products
    .map((product) => {
      if (!product || typeof product !== 'object') return { ...product, searchScore: 0 };
      const text = `${product.name || ''} ${product.brand || ''} ${product.category || ''}`.toLowerCase();
      const words = text.split(' ').filter((w) => w.length > 0);
      const { totalScore, foundTerms } = scoreSearchTerms(words, searchTerms);
      const passes = foundTerms >= Math.ceil(searchTerms.length / 2);
      return { ...product, searchScore: passes ? totalScore : 0 };
    })
    .filter((p) => p.searchScore > 0)
    .sort((a, b) => b.searchScore - a.searchScore);
}

// ── Component ─────────────────────────────────────────────────────────────────

function ProductList({ products, loading, onProductsChange, viewMode = 'grid', searchQuery = '', sortBy = 'alphabetical' }) {
  const [editModalProduct, setEditModalProduct] = useState(null);

  const openEditModal = (product) => setEditModalProduct(product);
  const closeEditModal = () => setEditModalProduct(null);
  const handleProductUpdated = () => {};

  const finalProducts = useMemo(() => {
    const safeProducts = products || [];
    const searched = getSearchResults(safeProducts, searchQuery);
    return getSortedProducts(searched, searchQuery ? 'relevance' : sortBy);
  }, [products, searchQuery, sortBy]);

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

  if (!products || products.length === 0) {
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
          {searchQuery && finalProducts.length !== (products || []).length ? ` / ${(products || []).length}` : ''} ürün)
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