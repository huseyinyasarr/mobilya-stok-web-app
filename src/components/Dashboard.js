// Ana kontrol paneli - Stok takip ekranı
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ProductList from './ProductList';
import AddProductForm from './AddProductForm';
import CategorySelection from './CategorySelection';
import ActivityLogs from './ActivityLogs';
import BulkProductEntry from './BulkProductEntry';
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
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState(''); // Arama sorgusu
  const [sortBy, setSortBy] = useState('alphabetical'); // Sıralama seçeneği

  // Mobil kontrolü için window width'i kontrol et
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Scroll'a dönünce menüyü kapat
  useEffect(() => {
    if (!isScrolled) setShowMobileMenu(false);
  }, [isScrolled]);

  // Menü dışına tıklayınca kapat
  useEffect(() => {
    if (!showMobileMenu) return;
    const handleOutside = (e) => {
      if (!e.target.closest('.mobile-menu-wrapper')) setShowMobileMenu(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [showMobileMenu]);

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
          setProductsCache(data); // Offline kullanım için önbelleğe al
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
      <header className={`dashboard-header ${isScrolled && isMobile ? 'scrolled' : ''}`}>
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
            {(!isScrolled || !isMobile) && (
              <span>{currentUser.displayName}</span>
            )}

            {isScrolled && isMobile ? (
              /* Scroll'da mobil: hamburger menü */
              <div className="mobile-menu-wrapper">
                <button
                  className={`mobile-menu-btn${showMobileMenu ? ' open' : ''}`}
                  onClick={() => setShowMobileMenu((v) => !v)}
                  aria-label="Menü"
                >
                  {showMobileMenu ? '✕' : '☰'}
                </button>
                {showMobileMenu && (
                  <div className="mobile-menu-dropdown">
                    <button
                      className="mobile-menu-item"
                      onClick={() => { setShowBulkEntry(true); setShowMobileMenu(false); }}
                    >
                      <span>📦</span> Toplu Giriş
                    </button>
                    {!showCategorySelection && (
                      <button
                        className="mobile-menu-item"
                        onClick={() => { setShowActivityLogs(true); setShowMobileMenu(false); }}
                      >
                        <span>📋</span> Geçmiş
                      </button>
                    )}
                    <button
                      className="mobile-menu-item logout"
                      onClick={handleLogout}
                    >
                      <span>⏻</span> Çıkış Yap
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Normal görünüm */
              <>
                <button
                  onClick={() => setShowBulkEntry(true)}
                  className="bulk-entry-btn"
                  title="Toplu Ürün Girişi"
                >
                  📦 Toplu Giriş
                </button>
                {!showCategorySelection && (
                  <button
                    onClick={() => setShowActivityLogs(true)}
                    className="logs-btn"
                    title="İşlem Geçmişi"
                  >
                    📋 Geçmiş
                  </button>
                )}
                <button onClick={handleLogout} className="logout-btn">
                  Çıkış Yap
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="dashboard-content">
        {/* Kategori Seçim Ekranı veya Ürün Listesi */}
        {showCategorySelection ? (
          <CategorySelection 
            categories={categories}
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
              onProductsChange={fetchProducts}
              viewMode={currentViewMode}
              searchQuery={searchQuery}
              sortBy={sortBy}
            />

            {/* Ürün Ekleme Formu Modal */}
            {showAddForm && (
              <AddProductForm
                onClose={() => setShowAddForm(false)}
                onProductAdded={fetchProducts}
                brands={availableBrands}
              />
            )}
            
            {/* İşlem Geçmişi Modal */}
            {showActivityLogs && (
              <ActivityLogs onClose={() => setShowActivityLogs(false)} />
            )}
          </>
        )}
      </div>

      {/* Toplu Ürün Girişi Modal — kategori seçim ekranında da açılabilmesi için dışarıda */}
      {showBulkEntry && (
        <BulkProductEntry onClose={() => setShowBulkEntry(false)} />
      )}
    </div>
  );
}

export default Dashboard; 