// Ana kontrol paneli - Stok takip ekranı
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ProductList from './ProductList';
import AddProductForm from './AddProductForm';
import { ref, onValue, orderByChild, query } from 'firebase/database';
import { db } from '../firebase';
import './Dashboard.css';

function Dashboard() {
  const { currentUser, logout } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedBrand, setSelectedBrand] = useState('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showCategoryDetails, setShowCategoryDetails] = useState(false);
  const [showBrandDetails, setShowBrandDetails] = useState(false);

  // Kategoriler listesi
  const categories = ['all', 'yatak', 'kanepe', 'koltuk', 'masa', 'sandalye', 'dolap', 'diğer'];

  // Ürünleri Realtime Database'den getir
  const fetchProducts = () => {
    try {
      const productsRef = ref(db, 'products');
      const q = query(productsRef, orderByChild('name'));
      
      onValue(q, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const productsData = Object.keys(data).map(key => ({
            id: key,
            ...data[key]
          }));
          setProducts(productsData);
        } else {
          setProducts([]);
        }
        setLoading(false);
      }, (error) => {
        console.error('Ürünler getirilirken hata oluştu:', error);
        setProducts([]);
        setLoading(false);
      });
      
    } catch (error) {
      console.error('Database bağlantı hatası:', error);
      setProducts([]);
      setLoading(false);
    }
  };

  // Component yüklendiğinde ürünleri getir
  useEffect(() => {
    fetchProducts();
  }, []);

  // Kategoriye ve markaya göre filtrelenmiş ürünler
  const filteredProducts = products.filter(product => {
    const categoryMatch = selectedCategory === 'all' || product.category === selectedCategory;
    const brandMatch = selectedBrand === 'all' || product.brand === selectedBrand;
    return categoryMatch && brandMatch;
  });

  // Mevcut markaları al
  const availableBrands = [...new Set(products.map(p => p.brand).filter(Boolean))].sort();

  // Çıkış yapma
  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Çıkış yaparken hata oluştu:', error);
    }
  };

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-content">
          <h1>🪑 Mobilya Stok Takip</h1>
          <div className="user-info">
            <span>Hoş geldin {currentUser.displayName}</span>
            <button onClick={handleLogout} className="logout-btn">
              Çıkış Yap
            </button>
          </div>
        </div>
      </header>

      <div className="dashboard-content">
        {/* Kontrol Paneli */}
        <div className="controls">
          <div className="filters">
            <div className="filter-group">
              <label htmlFor="category-filter">Kategori:</label>
              <select 
                id="category-filter"
                value={selectedCategory} 
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="category-select"
              >
                <option value="all">Tüm Kategoriler</option>
                {categories.slice(1).map(category => (
                  <option key={category} value={category}>
                    {category.charAt(0).toUpperCase() + category.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="filter-group">
              <label htmlFor="brand-filter">Marka:</label>
              <select 
                id="brand-filter"
                value={selectedBrand} 
                onChange={(e) => setSelectedBrand(e.target.value)}
                className="brand-select"
              >
                <option value="all">Tüm Markalar</option>
                {availableBrands.map(brand => (
                  <option key={brand} value={brand}>
                    {brand}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button 
            onClick={() => setShowAddForm(true)}
            className="add-product-btn"
          >
            + Yeni Ürün Ekle
          </button>
        </div>

        {/* İstatistikler */}
        <div className="stats">
          <div className="stat-card">
            <h3>Toplam Ürün Sayısı</h3>
            <span className="stat-number">
              {products.reduce((total, product) => {
                // Yeni varyant sistemi
                if (product.variants && product.variants.length > 0) {
                  return total + (product.totalQuantity || 0);
                }
                // Eski sistem - backward compatibility
                return total + (product.quantity || 0);
              }, 0)}
            </span>
          </div>
          <div className="stat-card">
            <h3>Kaç Kalem Ürün Var</h3>
            <span className="stat-number">{products.length}</span>
          </div>
          <div className="stat-card categories-detail">
            <div 
              className="category-header" 
              onClick={() => setShowCategoryDetails(!showCategoryDetails)}
            >
              <h3>Kategori Detayları</h3>
              <span className={`toggle-icon ${showCategoryDetails ? 'open' : ''}`}>▼</span>
            </div>
            
            {showCategoryDetails && (
              <div className="category-breakdown">
                {categories.slice(1).map(category => {
                  const categoryProducts = products.filter(p => p.category === category);
                  const categoryCount = categoryProducts.length; // Kaç çeşit ürün var
                  const categoryTotal = categoryProducts.reduce((total, product) => {
                    // Yeni varyant sistemi
                    if (product.variants && product.variants.length > 0) {
                      return total + (product.totalQuantity || 0);
                    }
                    // Eski sistem - backward compatibility
                    return total + (product.quantity || 0);
                  }, 0);
                  if (categoryTotal === 0) return null;
                  return (
                    <div key={category} className="category-item">
                      <span className="category-name">
                        {category.charAt(0).toUpperCase() + category.slice(1)}:
                      </span>
                      <span className="category-count">
                        <span className="variety-count">{categoryCount}</span>
                        <span className="separator">/</span>
                        <span className="total-count">{categoryTotal}</span>
                      </span>
                      <span className="category-detail">
                        ({categoryCount} çeşit, {categoryTotal} adet)
                      </span>
                    </div>
                  );
                })}
                {products.length === 0 && (
                  <span className="no-categories">Henüz ürün yok</span>
                )}
              </div>
            )}
          </div>
          
          <div className="stat-card brands-detail">
            <div 
              className="brand-header" 
              onClick={() => setShowBrandDetails(!showBrandDetails)}
            >
              <h3>Marka Detayları</h3>
              <span className={`toggle-icon ${showBrandDetails ? 'open' : ''}`}>▼</span>
            </div>
            
            {showBrandDetails && (
              <div className="brand-breakdown">
                {availableBrands.map(brand => {
                  const brandProducts = products.filter(p => p.brand === brand);
                  const brandCount = brandProducts.length; // Kaç çeşit ürün var
                  const brandTotal = brandProducts.reduce((total, product) => {
                    // Yeni varyant sistemi
                    if (product.variants && product.variants.length > 0) {
                      return total + (product.totalQuantity || 0);
                    }
                    // Eski sistem - backward compatibility
                    return total + (product.quantity || 0);
                  }, 0);
                  if (brandTotal === 0) return null;
                  return (
                    <div key={brand} className="brand-item">
                      <span className="brand-name">
                        {brand}:
                      </span>
                      <span className="brand-count">
                        <span className="variety-count">{brandCount}</span>
                        <span className="separator">/</span>
                        <span className="total-count">{brandTotal}</span>
                      </span>
                      <span className="brand-detail">
                        ({brandCount} çeşit, {brandTotal} adet)
                      </span>
                    </div>
                  );
                })}
                {availableBrands.length === 0 && (
                  <span className="no-brands">Henüz marka yok</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Ürün Listesi */}
        <ProductList 
          products={filteredProducts} 
          loading={loading}
          onProductsChange={fetchProducts}
        />

        {/* Ürün Ekleme Formu Modal */}
        {showAddForm && (
          <AddProductForm 
            onClose={() => setShowAddForm(false)}
            onProductAdded={fetchProducts}
          />
        )}
      </div>
    </div>
  );
}

export default Dashboard; 