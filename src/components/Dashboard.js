// Ana kontrol paneli - Stok takip ekranı
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCategories } from '../contexts/CategoriesContext';
import ProductList from './ProductList';
import AddProductForm from './AddProductForm';
import CategorySelection from './CategorySelection';
import ActivityLogs from './ActivityLogs';
import BulkProductEntry from './BulkProductEntry';
import CategoriesManager from './CategoriesManager';
import ProductsManager from './ProductsManager';
import SettingsModal from './SettingsModal';
import { ref, onValue, orderByChild, query } from 'firebase/database';
import { db } from '../firebase';
import { setProductsCache } from '../utils/offlineQueue';
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
  const [isScrolled, setIsScrolled] = useState(false);
  const [showCategorySelection, setShowCategorySelection] = useState(true); // Kategori seçim ekranını kontrol eder
  const [showActivityLogs, setShowActivityLogs] = useState(false);
  const [showBulkEntry, setShowBulkEntry] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCategoriesManager, setShowCategoriesManager] = useState(false);
  const [showProductsManager, setShowProductsManager] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('alphabetical');

  // Scroll durumunu takip et
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      setIsScrolled(scrollTop > 50);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Mobilde her zaman liste görünümü kullan
  const currentViewMode = 'list';

  const { categories: contextCategories } = useCategories();

  // Ürünleri Realtime Database'den gerçek zamanlı dinle; unsubscribe döner
  const subscribeToProducts = useCallback(() => {
    try {
      const productsRef = ref(db, 'products');
      const q = query(productsRef, orderByChild('name'));
      const unsubscribe = onValue(q, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const productsData = Object.keys(data).map(key => ({
            id: key,
            ...data[key]
          }));
          setProducts(productsData);
          setProductsCache(data);
        } else {
          setProducts([]);
          setProductsCache({});
        }
        setLoading(false);
      }, (error) => {
        console.error('Ürünler getirilirken hata oluştu:', error);
        setProducts([]);
        setLoading(false);
      });
      return unsubscribe;
    } catch (error) {
      console.error('Database bağlantı hatası:', error);
      setProducts([]);
      setLoading(false);
      return () => {};
    }
  }, []);

  // Component yüklendiğinde dinleyiciyi başlat; unmount'ta temizle
  useEffect(() => {
    const unsubscribe = subscribeToProducts();
    return () => unsubscribe();
  }, [subscribeToProducts]);

  const filteredProducts = useMemo(() => products.filter((product) => {
    const categoryMatch = selectedCategory === 'all' || product.category === selectedCategory;
    const brandMatch = selectedBrand === 'all' || product.brand === selectedBrand;
    return categoryMatch && brandMatch;
  }), [products, selectedCategory, selectedBrand]);

  const availableBrands = useMemo(
    () => [...new Set(products.map((p) => p.brand).filter(Boolean))].sort(),
    [products]
  );

  // Arama işlevi değiştiğinde
  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
  };

  // Arama temizleme
  const clearSearch = () => {
    setSearchQuery('');
  };

  // Sıralama seçimi değiştiğinde
  const handleSortChange = (e) => {
    setSortBy(e.target.value);
  };

  // Kategori seçimi yapıldığında
  const handleCategorySelect = (category) => {
    setSelectedCategory(category);
    setShowCategorySelection(false);
  };

  // Kategori seçim ekranına geri dön
  const handleBackToCategories = () => {
    setShowCategorySelection(true);
    setSelectedCategory('all');
    setSelectedBrand('all');
    setSearchQuery(''); // Arama sorgusunu temizle
  };

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
      <header className={`dashboard-header ${isScrolled ? 'scrolled' : ''}`}>
        <div className="header-content">
          <div className="header-left">
            {!showCategorySelection && (
              <button onClick={handleBackToCategories} className="back-btn" title="Kategorilere Dön">
                ←
              </button>
            )}
            <img 
              src={process.env.PUBLIC_URL + '/logo.png'} 
              alt="Şeref Mobilya Logo" 
              className="navbar-logo"
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                objectFit: 'cover',
                marginRight: '10px',
                background: '#fff',
                border: '2px solid #e0e0e0',
                boxShadow: '0 2px 8px rgba(0,0,0,0.07)'
              }}
            />
            <h1>Şeref Mobilya</h1>
          </div>
          
          {/* Search Bar - sadece kategori seçili değilse göster */}
          {!showCategorySelection && (
            <div className="header-search">
              <div className="search-input-container">
                <input
                  type="text"
                  placeholder="Ürün ara..."
                  value={searchQuery}
                  onChange={handleSearchChange}
                  className="header-search-input"
                />
                {searchQuery && (
                  <button
                    onClick={clearSearch}
                    className="header-clear-search-btn"
                    title="Aramayı temizle"
                  >
                    ✕
                  </button>
                )}
                <div className="header-search-icon">🔍</div>
              </div>
            </div>
          )}
          
          <div className="user-info">
            <button
              onClick={() => setShowBulkEntry(true)}
              className="bulk-entry-btn"
              title="Toplu Ürün Girişi"
            >
              <span>📦</span>
              <span className="btn-text">Toplu Giriş</span>
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="settings-btn"
              title="Ayarlar"
            >
              ⚙
            </button>
          </div>
        </div>
      </header>

      <div className="dashboard-content">
        {/* Kategori Seçim Ekranı veya Ürün Listesi */}
        {showCategorySelection ? (
          <CategorySelection
            onCategorySelect={handleCategorySelect}
            products={products}
          />
        ) : (
          <>
            {/* Kontrol Paneli - Arama yaparken gizle */}
            <div className={`controls ${searchQuery ? 'search-hidden' : ''}`}>
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
                      {contextCategories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.icon} {cat.name}
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
                  
                  <div className="filter-group">
                    <label htmlFor="sort-filter">Sıralama:</label>
                    <select 
                      id="sort-filter"
                      value={sortBy} 
                      onChange={handleSortChange}
                      className="sort-select"
                    >
                      <option value="alphabetical">Alfabetik (A-Z)</option>
                      <option value="date-newest">Tarihe Göre (En Yeni)</option>
                      <option value="date-oldest">Tarihe Göre (En Eski)</option>
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

            {/* İstatistikler - Arama yaparken gizle */}
            <div className={`stats ${searchQuery ? 'search-hidden' : ''}`}>
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
                    {contextCategories.map(cat => {
                      const categoryProducts = products.filter(p => p.category === cat.id);
                      const categoryCount = categoryProducts.length;
                      const categoryTotal = categoryProducts.reduce((total, product) => {
                        if (product.variants && product.variants.length > 0) {
                          return total + (product.totalQuantity || 0);
                        }
                        return total + (product.quantity || 0);
                      }, 0);
                      if (categoryTotal === 0) return null;
                      return (
                        <div key={cat.id} className="category-item">
                          <span className="category-name">
                            {cat.icon} {cat.name}:
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

            {/* Arama yaparken kompakt yeni ürün ekleme butonu */}
            {searchQuery && (
              <div className="search-mode-controls">
                <button 
                  onClick={() => setShowAddForm(true)}
                  className="add-product-btn-compact"
                >
                  + Yeni Ürün Ekle
                </button>
              </div>
            )}

            {/* Ürün Listesi */}
            <ProductList 
              products={filteredProducts} 
              loading={loading}
              onProductsChange={() => {}}
              viewMode={currentViewMode}
              searchQuery={searchQuery}
              sortBy={sortBy}
            />

            {/* Ürün Ekleme Formu Modal */}
            {showAddForm && (
              <AddProductForm
                onClose={() => setShowAddForm(false)}
                onProductAdded={() => {}}
                brands={availableBrands}
              />
            )}
            
          </>
        )}
      </div>

      {/* İşlem Geçmişi Modal — her ekrandan açılabilsin */}
      {showActivityLogs && (
        <ActivityLogs onClose={() => setShowActivityLogs(false)} />
      )}

      {/* Toplu Ürün Girişi Modal */}
      {showBulkEntry && (
        <BulkProductEntry onClose={() => setShowBulkEntry(false)} />
      )}

      {/* Ayarlar Modalı */}
      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onOpenLogs={() => setShowActivityLogs(true)}
          onOpenCategories={() => setShowCategoriesManager(true)}
          onOpenProducts={() => setShowProductsManager(true)}
          onLogout={handleLogout}
          user={currentUser}
        />
      )}

      {/* Kategori Yönetim Modalı */}
      {showCategoriesManager && (
        <CategoriesManager
          onClose={() => setShowCategoriesManager(false)}
          products={products}
        />
      )}

      {/* Ürün Yönetim Modalı */}
      {showProductsManager && (
        <ProductsManager
          onClose={() => setShowProductsManager(false)}
          products={products}
        />
      )}
    </div>
  );
}

export default Dashboard; 