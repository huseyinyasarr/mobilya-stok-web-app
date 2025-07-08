// Ürünleri listeleyen component
import React, { useState } from 'react';
import ProductEditModal from './ProductEditModal';
import './ProductList.css';

function ProductList({ products, loading, onProductsChange, viewMode = 'grid' }) {
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

  // Liste görünümü için ürün render fonksiyonu
  const renderListItem = (product) => (
    <div key={product.id} className="product-list-item">
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

                {/* Eski absolute düzenleme butonunu kaldır */}
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

                {/* Eski absolute düzenleme butonunu kaldır */}
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
    </div>
  );

  // Grid görünümü için ürün render fonksiyonu (mevcut tasarım)
  const renderGridItem = (product) => (
    <div key={product.id} className="product-card">
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
      </div>
    </div>
  );

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

  if (products.length === 0) {
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

  return (
    <div className="product-list-container">
      <h2>Ürün Listesi ({products.length} ürün)</h2>
      
      {viewMode === 'grid' ? (
        <div className="products-grid">
          {products.map(renderGridItem)}
        </div>
      ) : (
        <div className="products-list">
          {products.map(renderListItem)}
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