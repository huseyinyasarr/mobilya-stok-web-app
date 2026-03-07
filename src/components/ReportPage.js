// Özet / Rapor sayfası — tüm ürünler listelenir, marka/kategoriye göre gruplanabilir
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, onValue, orderByChild, query } from 'firebase/database';
import { db } from '../firebase';
import { generateStockPDF } from '../utils/pdfExport';
import './ReportPage.css';

const SORT_OPTIONS = [
  { value: 'alphabetical', label: 'Alfabeye göre (A-Z)' },
  { value: 'alphabetical-desc', label: 'Alfabeye göre (Z-A)' },
  { value: 'quantity-desc', label: 'Stok miktarına göre (çoktan aza)' },
  { value: 'quantity-asc', label: 'Stok miktarına göre (azdan çoğa)' },
];

const GROUP_OPTIONS = [
  { value: 'none', label: 'Gruplama yok' },
  { value: 'brand', label: 'Markaya göre grupla' },
  { value: 'category', label: 'Kategoriye göre grupla' },
];

const VIEW_OPTIONS = [
  { value: 'list', label: 'Liste (kompakt)' },
  { value: 'detail', label: 'Detay (renk, varyant vb.)' },
];

function ReportPage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('alphabetical');
  const [groupBy, setGroupBy] = useState('none');
  const [viewMode, setViewMode] = useState('list');
  const [selectedBrands, setSelectedBrands] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [pdfLoading, setPdfLoading] = useState(false);

  React.useEffect(() => {
    const productsRef = ref(db, 'products');
    const q = query(productsRef, orderByChild('name'));
    const unsub = onValue(q, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setProducts(Object.keys(data).map((key) => ({ id: key, ...data[key] })));
      } else {
        setProducts([]);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const availableBrands = useMemo(
    () => [...new Set(products.map((p) => p.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')),
    [products]
  );

  const availableCategories = useMemo(
    () => [...new Set(products.map((p) => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')),
    [products]
  );

  const filteredProducts = useMemo(() => {
    let list = [...products];
    if (selectedBrands.length > 0) {
      list = list.filter((p) => selectedBrands.includes(p.brand || ''));
    }
    if (selectedCategories.length > 0) {
      list = list.filter((p) => selectedCategories.includes(p.category || ''));
    }
    switch (sortBy) {
      case 'alphabetical':
        list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'tr'));
        break;
      case 'alphabetical-desc':
        list.sort((a, b) => (b.name || '').localeCompare(a.name || '', 'tr'));
        break;
      case 'quantity-desc':
        list.sort((a, b) => (b.totalQuantity ?? b.quantity ?? 0) - (a.totalQuantity ?? a.quantity ?? 0));
        break;
      case 'quantity-asc':
        list.sort((a, b) => (a.totalQuantity ?? a.quantity ?? 0) - (b.totalQuantity ?? b.quantity ?? 0));
        break;
      default:
        break;
    }
    return list;
  }, [products, sortBy, selectedBrands, selectedCategories]);

  const groupedProducts = useMemo(() => {
    if (groupBy === 'none') return [{ key: '_all', label: 'Tümü', items: filteredProducts }];
    const groups = {};
    filteredProducts.forEach((p) => {
      const key = groupBy === 'brand' ? (p.brand || 'Markasız') : (p.category || 'Kategorisiz');
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    });
    const keys = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'tr'));
    return keys.map((key) => ({ key, label: key, items: groups[key] }));
  }, [filteredProducts, groupBy]);

  const toggleBrand = (brand) => {
    setSelectedBrands((prev) =>
      prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand]
    );
  };

  const toggleCategory = (cat) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const getProductQty = (p) => p.totalQuantity ?? p.quantity ?? 0;

  const handleExportPDF = async () => {
    setPdfLoading(true);
    try {
      await generateStockPDF({
        groupedProducts,
        groupBy,
        viewMode,
        filteredProducts,
        selectedBrands,
        selectedCategories,
        sortBy,
      });
    } catch (err) {
      console.error('PDF oluşturulamadı:', err);
      alert('PDF oluşturulurken hata oluştu.');
    } finally {
      setPdfLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="report-page">
        <div className="report-loading">Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div className="report-page">
      <header className="report-header">
        <div className="report-header-left">
          <button className="report-back-btn" onClick={() => navigate('/')} title="Geri">
            ←
          </button>
          <img
            src={process.env.PUBLIC_URL + '/logo.png'}
            alt="Şeref Mobilya Logo"
            className="report-navbar-logo"
          />
          <h1>Şeref Mobilya</h1>
        </div>
        <div className="report-header-right">
          <span className="report-header-subtitle">Özet / Rapor</span>
          <button
            className="report-pdf-btn"
            onClick={handleExportPDF}
            disabled={pdfLoading || filteredProducts.length === 0}
            title="PDF olarak indir"
          >
            {pdfLoading ? (
              <span className="report-pdf-spinner" />
            ) : (
              <span>📄</span>
            )}
            <span>{pdfLoading ? 'Hazırlanıyor...' : 'PDF İndir'}</span>
          </button>
        </div>
      </header>

      <div className="report-controls">
        <div className="report-control-group">
          <label>Görünüm</label>
          <select value={viewMode} onChange={(e) => setViewMode(e.target.value)}>
            {VIEW_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="report-control-group">
          <label>Grupla</label>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
            {GROUP_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="report-control-group">
          <label>Sırala</label>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="report-filters">
        <div className="report-filter-section">
          <label>Marka filtresi</label>
          <div className="report-filter-chips">
            {availableBrands.map((b) => (
              <button
                key={b}
                type="button"
                className={`report-filter-chip ${selectedBrands.includes(b) ? 'active' : ''}`}
                onClick={() => toggleBrand(b)}
              >
                {b}
              </button>
            ))}
            {selectedBrands.length > 0 && (
              <button
                type="button"
                className="report-filter-chip report-filter-chip--clear"
                onClick={() => setSelectedBrands([])}
              >
                Temizle
              </button>
            )}
          </div>
        </div>
        <div className="report-filter-section">
          <label>Kategori filtresi</label>
          <div className="report-filter-chips">
            {availableCategories.map((c) => (
              <button
                key={c}
                type="button"
                className={`report-filter-chip ${selectedCategories.includes(c) ? 'active' : ''}`}
                onClick={() => toggleCategory(c)}
              >
                {c}
              </button>
            ))}
            {selectedCategories.length > 0 && (
              <button
                type="button"
                className="report-filter-chip report-filter-chip--clear"
                onClick={() => setSelectedCategories([])}
              >
                Temizle
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="report-summary-bar">
        Toplam {filteredProducts.length} ürün
      </div>

      <div className="report-content">
        {groupedProducts.map(({ key, label, items }) => (
          <div key={key} className={`report-group report-group--${groupBy} ${groupBy !== 'none' ? 'report-group--bordered' : ''}`}>
            {groupBy !== 'none' && (
              <div className="report-group-header">{label}</div>
            )}
            <div className="report-list-header">
              <span className="report-header-col report-header-name">Ürün Adı</span>
              {groupBy !== 'brand' && <span className="report-header-col report-header-brand">Marka</span>}
              {groupBy !== 'category' && <span className="report-header-col report-header-category">Kategori</span>}
              <span className="report-header-col report-header-qty">Adet</span>
            </div>
            <ul className={`report-product-list report-product-list--${viewMode}`}>
              {items.map((p) => (
                <li key={p.id} className={`report-product-item report-product-item--${viewMode}`}>
                  {viewMode === 'list' ? (
                    <>
                      <span className="report-product-name">{p.name}</span>
                      {groupBy !== 'brand' && (
                        <span className="report-product-brand">{p.brand || '—'}</span>
                      )}
                      {groupBy !== 'category' && (
                        <span className="report-product-category">{p.category || '—'}</span>
                      )}
                      <span className="report-product-qty">{getProductQty(p)} adet</span>
                    </>
                  ) : (
                    <div className="report-detail-card">
                      <div className="report-detail-row">
                        <span className="report-product-name">{p.name}</span>
                        {groupBy !== 'brand' && (
                          <span className="report-product-brand">{p.brand || '—'}</span>
                        )}
                        {groupBy !== 'category' && (
                          <span className="report-product-category">{p.category || '—'}</span>
                        )}
                        <span className="report-product-qty">{getProductQty(p)} adet</span>
                      </div>
                      {p.variants && p.variants.length > 0 && (
                        <div className="report-detail-variants">
                          {[...p.variants].sort((a, b) => (a.varyans || '').localeCompare(b.varyans || '', 'tr')).map((v, i) => {
                            const colorInfo = [v.colorCode, v.colorName, v.varyans].filter(Boolean).join(' — ');
                            if (!colorInfo) return null;
                            return (
                              <span key={i} className="report-detail-variant">
                                {colorInfo}: {v.quantity ?? 0} adet
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {p.description && (
                        <p className="report-detail-desc">{p.description}</p>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ReportPage;
