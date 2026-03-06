// Ürünleri listeleyen component
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { List, Grid } from 'react-window';
import ProductEditModal from './ProductEditModal';
import { scoreSearchTerms, formatRelativeDate } from '../utils/fuzzySearch';
import './ProductList.css';

// Virtualization sabitleri - sabit yükseklik = eşit boşluk
const LIST_ITEM_HEIGHT = 130;
const LIST_ITEM_GAP = 4;
const GRID_ROW_HEIGHT = 175;
const GRID_CARD_MIN_WIDTH = 320;
const GRID_GAP = 10;
const GRID_PADDING = 50;

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
  const listContainerRef = useRef(null);
  // Mobilde ilk render'da doğru genişlik için window kullan (800 sabit mobilde üst üste binmeye neden oluyordu)
  const [containerWidth, setContainerWidth] = useState(() =>
    typeof window !== 'undefined' ? Math.min(800, window.innerWidth - 40) : 400
  );

  const openEditModal = (product) => setEditModalProduct(product);
  const closeEditModal = () => setEditModalProduct(null);
  const handleProductUpdated = () => {};

  useEffect(() => {
    const el = listContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width } = entries[0]?.contentRect ?? {};
      if (typeof width === 'number') setContainerWidth(width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const finalProducts = useMemo(() => {
    const safeProducts = products || [];
    const searched = getSearchResults(safeProducts, searchQuery);
    return getSortedProducts(searched, searchQuery ? 'relevance' : sortBy);
  }, [products, searchQuery, sortBy]);

  const availableBrands = useMemo(() => {
    const safe = products || [];
    const set = new Set();
    safe.forEach((p) => { if (p.brand?.trim()) set.add(p.brand.trim()); });
    return [...set].sort((a, b) => a.localeCompare(b, 'tr'));
  }, [products]);

  const gridColumnCount = useMemo(() => {
    const w = containerWidth - GRID_PADDING;
    return Math.max(1, Math.floor(w / (GRID_CARD_MIN_WIDTH + GRID_GAP)));
  }, [containerWidth]);

  const gridRowCount = useMemo(() => {
    return Math.ceil(finalProducts.length / gridColumnCount);
  }, [finalProducts.length, gridColumnCount]);

  const [virtualListHeight, setVirtualListHeight] = useState(() =>
    typeof window !== 'undefined' ? Math.max(400, window.innerHeight - 320) : 500
  );
  useEffect(() => {
    const update = () => setVirtualListHeight(Math.max(400, window.innerHeight - 320));
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Mobilde liste satırları daha yüksek (stacked layout) - sabit 130px üst üste binmeye neden oluyordu
  const [listRowHeight, setListRowHeight] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 240 : LIST_ITEM_HEIGHT + LIST_ITEM_GAP
  );
  useEffect(() => {
    const update = () =>
      setListRowHeight(window.innerWidth < 768 ? 240 : LIST_ITEM_HEIGHT + LIST_ITEM_GAP);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

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
      
      <div ref={listContainerRef} className="product-list-virtual-wrapper">
        {viewMode === 'grid' ? (
          <Grid
            columnCount={gridColumnCount}
            columnWidth={Math.max(200, (containerWidth - GRID_PADDING - (gridColumnCount - 1) * GRID_GAP) / gridColumnCount)}
            rowCount={gridRowCount}
            rowHeight={GRID_ROW_HEIGHT + GRID_GAP}
            cellComponent={({ columnIndex, rowIndex, style, products, columnCount, renderItem }) => {
              const index = rowIndex * columnCount + columnIndex;
              const product = products[index];
              if (!product) return null;
              return (
                <div style={style} className="virtual-grid-cell">
                  {renderItem(product)}
                </div>
              );
            }}
            cellProps={{
              products: finalProducts,
              columnCount: gridColumnCount,
              renderItem: renderGridItem,
            }}
            className="products-grid-virtual"
            overscanCount={2}
            style={{ height: virtualListHeight, width: '100%' }}
          />
        ) : (
          <List
            rowCount={finalProducts.length}
            rowHeight={listRowHeight}
            rowComponent={({ index, style, products, renderItem }) => (
              <div style={style} className="virtual-list-row">
                {renderItem(products[index])}
              </div>
            )}
            rowProps={{
              products: finalProducts,
              renderItem: renderListItem,
            }}
            className="products-list-virtual"
            overscanCount={3}
            style={{ height: virtualListHeight, width: '100%' }}
          />
        )}
      </div>

      {/* Edit Modal */}
      {editModalProduct && (
        <ProductEditModal
          product={editModalProduct}
          onClose={closeEditModal}
          onProductUpdated={handleProductUpdated}
          brands={availableBrands}
        />
      )}
    </div>
  );
}

export default ProductList; 