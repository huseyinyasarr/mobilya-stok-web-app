// Ürünleri listeleyen component
import React, { useState } from 'react';
import ProductEditModal from './ProductEditModal';
import './ProductList.css';

function ProductList({ products, loading, onProductsChange }) {
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
      
      <div className="products-grid">
        {products.map(product => (
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
                  
                  <div className="variants-list">
                    {product.variants.map((variant, variantIndex) => {
                      const currentQuantity = variant.quantity || 0;
                      
                      return (
                        <div key={variantIndex} className="variant-item">
                          <div className="variant-info">
                            <span className="variant-color">
                              <strong>{variant.colorCode}</strong> - {variant.colorName}
                            </span>
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
            </div>
          </div>
        ))}
      </div>

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