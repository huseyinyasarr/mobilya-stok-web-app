// Kategori seçim ekranı
import React from 'react';
import './CategorySelection.css';

function CategorySelection({ categories, onCategorySelect, products }) {
  // Her kategori için ürün sayısını hesapla
  const getCategoryCount = (category) => {
    if (category === 'all') {
      return products.length;
    }
    return products.filter(product => product.category === category).length;
  };

  // Kategori ikonu al
  const getCategoryIcon = (category) => {
    const icons = {
      'all': '📦',
      'yatak': '🛏️',
      'kanepe': '🛋️', 
      'koltuk': '🛋️',
      'masa': '⛩',
      'sandalye': '🪑',
      'dolap': '🗄️',
      'diğer': '📋'
    };
    return icons[category] || '📦';
  };

  // Kategori başlığını al
  const getCategoryTitle = (category) => {
    if (category === 'all') return 'Tüm Ürünler';
    if (category === 'koltuk') return 'Koltuk/Kanepe';
    return category.charAt(0).toUpperCase() + category.slice(1);
  };

  return (
    <div className="category-selection">
      <div className="category-header">
        <h2>Kategori Seçin</h2>
        <p>Hangi kategori ürünlerini görüntülemek istiyorsunuz?</p>
      </div>
      
      <div className="category-grid">
        {/* Tüm Ürünler kartı önce gelsin */}
        <div 
          key="all"
          className="category-card all-products"
          onClick={() => onCategorySelect('all')}
        >
          <div className="category-icon">📦</div>
          <div className="category-info">
            <h3>Tüm Ürünler</h3>
            <span className="category-count">{getCategoryCount('all')} ürün</span>
          </div>
        </div>

        {/* Diğer kategoriler */}
        {categories.filter(cat => cat !== 'all').map(category => {
          const count = getCategoryCount(category);
          
          return (
            <div 
              key={category}
              className={`category-card ${count === 0 ? 'empty-category' : ''}`}
              onClick={() => onCategorySelect(category)}
            >
              <div className="category-icon">
                {getCategoryIcon(category)}
              </div>
              <div className="category-info">
                <h3>{getCategoryTitle(category)}</h3>
                <span className="category-count">{count} ürün</span>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Kategori olmayan ürünler varsa bilgilendirme */}
      {products.length === 0 && (
        <div className="no-products">
          <p>Henüz hiç ürün eklenmemiş.</p>
          <p>Yeni ürün eklemek için yukarıdaki "Yeni Ürün Ekle" butonunu kullanabilirsiniz.</p>
        </div>
      )}
    </div>
  );
}

export default CategorySelection; 