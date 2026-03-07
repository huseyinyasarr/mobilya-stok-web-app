// Ürünleri listeleyen component — sayfa scroll'u ile virtualization (@tanstack/react-virtual)
import React, { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import ProductEditModal from './ProductEditModal';
import { scoreSearchTerms, formatRelativeDate } from '../utils/fuzzySearch';
import './ProductList.css';

// Virtualization sabitleri
const LIST_ITEM_HEIGHT = 134;
const GRID_ROW_HEIGHT = 185;
const GRID_CARD_MIN_WIDTH = 320;
const GRID_GAP = 10;
const GRID_PADDING = 50;

// ── Modül scope saf fonksiyonlar ─────────────────────────────────────────────

function getStockStatus(quantity) {
  if (quantity === 0) return 'out-of-stock';
  if (quantity <= 5) return 'low-stock';
  return 'in-stock';
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

  // Sayfa scroll'u için scroll margin (list container'ın doküman üstünden offset'i)
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    const update = () => {
      const el = listContainerRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        setScrollMargin(rect.top + window.scrollY);
      }
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    const ro = new ResizeObserver(update);
    if (listContainerRef.current) ro.observe(listContainerRef.current);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      ro.disconnect();
    };
  }, [finalProducts.length]);

  // Mobilde liste satırı daha yüksek
  const [listRowHeight, setListRowHeight] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 240 : LIST_ITEM_HEIGHT
  );
  useEffect(() => {
    const update = () => setListRowHeight(window.innerWidth < 768 ? 240 : LIST_ITEM_HEIGHT);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Liste görünümü — sayfa scroll ile virtualization
  const listVirtualizer = useWindowVirtualizer({
    count: finalProducts.length,
    estimateSize: () => listRowHeight,
    overscan: 5,
    scrollMargin,
  });

  // Grid görünümü — satır bazlı virtualization (her satır N sütun)
  const gridVirtualizer = useWindowVirtualizer({
    count: gridRowCount,
    estimateSize: () => GRID_ROW_HEIGHT + GRID_GAP,
    overscan: 2,
    scrollMargin,
  });

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
                  {[...product.variants].sort((a, b) => (a.varyans || '').localeCompare(b.varyans || '', 'tr')).map((variant, variantIndex) => {
                    const currentQuantity = variant.quantity || 0;
                    const colorPart = [variant.colorCode, variant.colorName].filter(Boolean).join(' - ') || null;
                    const varyansPart = (variant.varyans || '').trim() || null;
                    const displayLabel = [colorPart, varyansPart].filter(Boolean).join(' · ') || '—';
                    return (
                      <div key={variantIndex} className="list-variant-item">
                        <span className="list-variant-color">{displayLabel}</span>
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
            
            <div className="variants-list">
              {[...product.variants].sort((a, b) => (a.varyans || '').localeCompare(b.varyans || '', 'tr')).map((variant, variantIndex) => {
                const currentQuantity = variant.quantity || 0;
                const colorPart = [variant.colorCode, variant.colorName].filter(Boolean).join(' - ') || null;
                const varyansPart = (variant.varyans || '').trim() || null;
                const displayLabel = [colorPart, varyansPart].filter(Boolean).join(' · ') || '—';
                return (
                  <div key={variantIndex} className="variant-item">
                    <div className="variant-info">
                      <span className="variant-color">{displayLabel}</span>
                      <span className={`quantity-value ${getStockStatus(currentQuantity)}`}>
                          {currentQuantity}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
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
          <div
            style={{
              height: `${gridVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {gridVirtualizer.getVirtualItems().map((virtualRow) => (
              <div
                key={virtualRow.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start - gridVirtualizer.options.scrollMargin}px)`,
                }}
                className="virtual-grid-row"
              >
                <div className="products-grid products-grid-virtual" style={{ padding: 0, display: 'grid', gridTemplateColumns: `repeat(${gridColumnCount}, 1fr)`, gap: GRID_GAP }}>
                  {Array.from({ length: gridColumnCount }).map((_, colIndex) => {
                    const index = virtualRow.index * gridColumnCount + colIndex;
                    const product = finalProducts[index];
                    if (!product) return null;
                    return (
                      <div key={product.id} className="virtual-grid-cell">
                        {renderGridItem(product)}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              height: `${listVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {listVirtualizer.getVirtualItems().map((virtualRow) => (
              <div
                key={virtualRow.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start - listVirtualizer.options.scrollMargin}px)`,
                }}
                className="virtual-list-row"
              >
                {renderListItem(finalProducts[virtualRow.index])}
              </div>
            ))}
          </div>
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