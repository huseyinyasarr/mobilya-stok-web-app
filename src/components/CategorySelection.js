import React from 'react';
import { useCategories } from '../contexts/CategoriesContext';
import './CategorySelection.css';

function CategorySelection({ onCategorySelect, products }) {
  const { categories } = useCategories();

  const getCount = (id) =>
    id === 'all'
      ? products.length
      : products.filter((p) => p.category === id).length;

  return (
    <div className="category-selection">
      <div className="category-header">
        <h2>Kategori Seçin</h2>
        <p>Hangi kategori ürünlerini görüntülemek istiyorsunuz?</p>
      </div>

      <div className="category-grid">
        {/* Tüm Ürünler kartı */}
        <div
          className="category-card all-products"
          onClick={() => onCategorySelect('all')}
        >
          <div className="category-icon">📦</div>
          <div className="category-info">
            <h3>Tüm Ürünler</h3>
            <span className="category-count">{getCount('all')} ürün</span>
          </div>
        </div>

        {/* Context'ten gelen dinamik kategoriler */}
        {categories.map((cat) => {
          const count = getCount(cat.id);
          return (
            <div
              key={cat.id}
              className={`category-card${count === 0 ? ' empty-category' : ''}`}
              onClick={() => onCategorySelect(cat.id)}
            >
              <div className="category-icon">{cat.icon || '📦'}</div>
              <div className="category-info">
                <h3>{cat.name}</h3>
                <span className="category-count">{count} ürün</span>
              </div>
            </div>
          );
        })}
      </div>

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