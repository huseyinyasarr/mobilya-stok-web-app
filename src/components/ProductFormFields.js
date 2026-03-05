import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './ProductFormFields.css';

export const CATEGORIES = [
  { id: 'yatak',    name: 'Yatak' },
  { id: 'kanepe',   name: 'Kanepe' },
  { id: 'koltuk',   name: 'Koltuk' },
  { id: 'masa',     name: 'Masa/Sehpa' },
  { id: 'sandalye', name: 'Sandalye' },
  { id: 'dolap',    name: 'Dolap' },
  { id: 'diger',    name: 'Diğer' },
];

/**
 * VariantsEditor — Paylaşılan varyant editörü
 *
 * mode='quantity'  → Yeni ürün: renk alanları düzenlenebilir, değer ≥ 0
 * mode='delta'     → Stok güncelleme: renk alanları salt-okunur, değer +/−
 */
export function VariantsEditor({ variants, onChange, mode = 'quantity', disabled = false }) {
  const valueField = mode === 'quantity' ? 'quantity' : 'delta';

  const updateVariant = (idx, field, val) =>
    onChange(variants.map((v, i) => (i === idx ? { ...v, [field]: val } : v)));

  const addVariant = () =>
    onChange([...variants, { colorCode: '', colorName: '', quantity: '' }]);

  const removeVariant = (idx) =>
    onChange(variants.filter((_, i) => i !== idx));

  const total = variants.reduce((sum, v) => sum + (parseInt(v[valueField]) || 0), 0);

  const totalBadgeClass = mode === 'delta'
    ? `edit-total-quantity${total > 0 ? ' delta-positive' : total < 0 ? ' delta-negative' : ''}`
    : 'edit-total-quantity';

  const totalLabel = mode === 'quantity'
    ? `Toplam: ${total} adet`
    : `${total > 0 ? '+' : ''}${total} adet`;

  return (
    <div className="edit-variants-section">
      <div className="edit-variants-header">
        <label>
          {mode === 'quantity' ? 'Renk Çeşitleri *' : 'Varyant Bazlı Delta Girişi'}
        </label>
        <span className={totalBadgeClass}>{totalLabel}</span>
      </div>

      <div className="edit-variants-list">
        {variants.map((v, idx) => (
          <div
            key={idx}
            className={`edit-variant-row${mode === 'delta' ? ' edit-variant-row--delta' : ''}`}
          >
            <div className="edit-variant-inputs">
              {mode === 'quantity' ? (
                <>
                  <input
                    type="text"
                    placeholder="Renk kodu (isteğe bağlı)"
                    value={v.colorCode}
                    onChange={(e) => updateVariant(idx, 'colorCode', e.target.value)}
                    disabled={disabled}
                    className="edit-color-code-input"
                  />
                  <input
                    type="text"
                    placeholder="Renk adı (isteğe bağlı)"
                    value={v.colorName}
                    onChange={(e) => updateVariant(idx, 'colorName', e.target.value)}
                    disabled={disabled}
                    className="edit-color-name-input"
                  />
                </>
              ) : (
                <span className="edit-variant-label-text">
                  <span className="edit-variant-label-color">
                    {[v.colorCode, v.colorName].filter(Boolean).join(' — ') || 'Renksiz'}
                  </span>
                  {v.currentQty !== undefined && (
                    <span className="edit-variant-label-stock">{v.currentQty} adet</span>
                  )}
                </span>
              )}

              <div className="edit-quantity-container">
                <button
                  type="button"
                  className="edit-quantity-btn minus"
                  onClick={() =>
                    updateVariant(
                      idx,
                      valueField,
                      mode === 'quantity'
                        ? Math.max(0, (parseInt(v[valueField]) || 0) - 1)
                        : (parseInt(v[valueField]) || 0) - 1
                    )
                  }
                  disabled={
                    disabled || (mode === 'quantity' && (parseInt(v[valueField]) || 0) === 0)
                  }
                >
                  −
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder={mode === 'quantity' ? 'Adet' : '±'}
                  value={v[valueField]}
                  onChange={(e) => updateVariant(idx, valueField, e.target.value)}
                  disabled={disabled}
                  className={`edit-quantity-input${
                    mode === 'delta'
                      ? parseInt(v[valueField]) > 0
                        ? ' delta-positive'
                        : parseInt(v[valueField]) < 0
                        ? ' delta-negative'
                        : ''
                      : ''
                  }`}
                  style={{ textAlign: 'center' }}
                />
                <button
                  type="button"
                  className="edit-quantity-btn plus"
                  onClick={() =>
                    updateVariant(idx, valueField, (parseInt(v[valueField]) || 0) + 1)
                  }
                  disabled={disabled}
                >
                  +
                </button>
              </div>
            </div>

            {mode === 'quantity' && (
              <button
                type="button"
                className="edit-remove-variant-btn"
                onClick={() => removeVariant(idx)}
                disabled={disabled || variants.length === 1}
                title="Bu rengi sil"
              >
                Sil
              </button>
            )}
          </div>
        ))}
      </div>

      {mode === 'quantity' && (
        <button
          type="button"
          className="edit-add-variant-btn"
          onClick={addVariant}
          disabled={disabled}
        >
          + Yeni Renk Ekle
        </button>
      )}
    </div>
  );
}

/**
 * BrandInput — Marka girişi + mevcut markalardan otomatik tamamlama
 *
 * Öneri listesi React portal ile document.body'ye render edilir;
 * böylece overflow:hidden/auto olan parent container'lar listeyi kesmez.
 *
 * brands: string[]  — mevcut marka listesi
 * value / onChange  — kontrollü input değeri
 */
export function BrandInput({ value, onChange, brands = [], placeholder, disabled = false }) {
  const [show, setShow] = useState(false);
  const [dropStyle, setDropStyle] = useState({});
  const inputRef = useRef(null);

  const filtered = brands
    .filter((b) =>
      !value.trim()
        ? true
        : b.toLowerCase().includes(value.toLowerCase())
    )
    .sort((a, b) => a.localeCompare(b, 'tr'));

  const showList = show && filtered.length > 0;

  const updatePos = () => {
    if (!inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    const dropH = Math.min(filtered.length * 42 + 8, 200);
    const spaceBelow = window.innerHeight - r.bottom;

    setDropStyle({
      width: r.width,
      left: r.left,
      ...(spaceBelow >= dropH
        ? { top: r.bottom + 4 }
        : { top: r.top - dropH - 4 }),
    });
  };

  return (
    <div className="brand-input-wrapper">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => { updatePos(); setShow(true); }}
        onBlur={() => setShow(false)}
        placeholder={placeholder || 'Örn: Özgür, Vivinza'}
        disabled={disabled}
        autoComplete="off"
      />
      {showList &&
        createPortal(
          <ul className="brand-suggestions-list" style={dropStyle}>
            {filtered.map((b) => {
              const isExact = b.toLowerCase() === value.toLowerCase();
              return (
                <li
                  key={b}
                  className={isExact ? 'brand-exact' : ''}
                  onPointerDown={(e) => {
                    e.preventDefault(); // blur tetiklenmesini engelle
                    onChange(b);
                    setShow(false);
                  }}
                >
                  {isExact && <span className="brand-check-icon">✓</span>}
                  {b}
                </li>
              );
            })}
          </ul>,
          document.body
        )}
    </div>
  );
}

/**
 * CategoryInput — Aranabilir kategori seçici
 *
 * Sabit CATEGORIES listesini portal dropdown olarak gösterir.
 * Odaklanınca tüm kategoriler listelenir; yazıldıkça filtrelenir.
 * Yalnızca listede var olan kategoriler seçilebilir.
 *
 * value: category ID ('yatak', 'kanepe', …)
 * onChange: (id: string) => void
 */
export function CategoryInput({ value, onChange, disabled = false }) {
  const [inputText, setInputText] = useState(
    () => CATEGORIES.find((c) => c.id === value)?.name || ''
  );
  const [show, setShow] = useState(false);
  const [userTyped, setUserTyped] = useState(false);
  const [dropStyle, setDropStyle] = useState({});
  const inputRef = useRef(null);

  // Dışarıdan value değişirse görünen metni güncelle
  useEffect(() => {
    if (!show) {
      const cat = CATEGORIES.find((c) => c.id === value);
      setInputText(cat?.name || '');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const filtered = CATEGORIES.filter((c) =>
    !userTyped || !inputText.trim()
      ? true
      : c.name.toLowerCase().includes(inputText.toLowerCase())
  );

  const showList = show && filtered.length > 0;

  const updatePos = () => {
    if (!inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    const dropH = Math.min(filtered.length * 42 + 8, 220);
    const spaceBelow = window.innerHeight - r.bottom;
    setDropStyle({
      width: r.width,
      left: r.left,
      ...(spaceBelow >= dropH
        ? { top: r.bottom + 4 }
        : { top: r.top - dropH - 4 }),
    });
  };

  const handleFocus = () => {
    setInputText('');   // sıfırla → tüm kategoriler görünsün
    setUserTyped(false);
    updatePos();
    setShow(true);
  };

  const handleChange = (e) => {
    setInputText(e.target.value);
    setUserTyped(true);
    updatePos();
  };

  const handleSelect = (cat) => {
    onChange(cat.id);
    setInputText(cat.name);
    setUserTyped(false);
    setShow(false);
  };

  const handleBlur = () => {
    // Tam eşleşme varsa güncelle; yoksa mevcut geçerli değere dön
    const match = CATEGORIES.find(
      (c) => c.name.toLowerCase() === inputText.toLowerCase()
    );
    if (match) {
      onChange(match.id);
      setInputText(match.name);
    } else {
      const current = CATEGORIES.find((c) => c.id === value);
      setInputText(current?.name || '');
    }
    setShow(false);
    setUserTyped(false);
  };

  return (
    <div className="brand-input-wrapper">
      <input
        ref={inputRef}
        type="text"
        value={inputText}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder="Kategori seçin..."
        disabled={disabled}
        autoComplete="off"
      />
      {showList &&
        createPortal(
          <ul className="brand-suggestions-list" style={dropStyle}>
            {filtered.map((c) => {
              const isSelected = c.id === value;
              return (
                <li
                  key={c.id}
                  className={isSelected ? 'brand-exact' : ''}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    handleSelect(c);
                  }}
                >
                  {isSelected && <span className="brand-check-icon">✓</span>}
                  {c.name}
                </li>
              );
            })}
          </ul>,
          document.body
        )}
    </div>
  );
}

/**
 * StockReasonSelector — Paylaşılan stok sebebi seçici
 *
 * mode='increase' → Satın Alım / Ürün İade
 * mode='decrease' → Ürün Satıldı / Firmaya İade
 *
 * value: { stockReason, returnReason, returnDescription }
 * onChange: (newValue) => void
 */
export function StockReasonSelector({ value, onChange, mode = 'increase', disabled = false }) {
  const { stockReason = '', returnReason = '', returnDescription = '' } = value || {};

  const options =
    mode === 'increase'
      ? [
          { value: 'purchase', label: 'Satın Alım' },
          { value: 'return',   label: 'Ürün İade' },
        ]
      : [
          { value: 'sold',               label: 'Ürün Satıldı' },
          { value: 'return_to_supplier', label: 'Firmaya İade' },
        ];

  // Geçerli bir seçenek yoksa ilk seçeneği varsayılan olarak kullan
  const effectiveReason = options.some((o) => o.value === stockReason)
    ? stockReason
    : options[0].value;

  const showReturnDetail =
    effectiveReason === 'return' || effectiveReason === 'return_to_supplier';

  return (
    <>
      <div className="edit-form-group">
        <label>Stok {mode === 'increase' ? 'Giriş' : 'Çıkış'} Sebebi *</label>
        <select
          value={effectiveReason}
          onChange={(e) =>
            onChange({ stockReason: e.target.value, returnReason: '', returnDescription: '' })
          }
          disabled={disabled}
          required
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {showReturnDetail && (
        <>
          <div className="edit-form-group">
            <label>İade Sebebi *</label>
            <select
              value={returnReason}
              onChange={(e) =>
                onChange({
                  stockReason: effectiveReason,
                  returnReason: e.target.value,
                  returnDescription: '',
                })
              }
              disabled={disabled}
              required
            >
              <option value="">Seçiniz...</option>
              <option value="wrong_product">Yanlış Ürün</option>
              <option value="damaged">Bozuk Ürün</option>
              <option value="other">Diğer</option>
            </select>
          </div>

          {returnReason === 'other' && (
            <div className="edit-form-group">
              <label>İade Açıklaması *</label>
              <textarea
                value={returnDescription}
                onChange={(e) =>
                  onChange({
                    stockReason: effectiveReason,
                    returnReason,
                    returnDescription: e.target.value,
                  })
                }
                placeholder="İade sebebini açıklayın..."
                rows={3}
                disabled={disabled}
                required
              />
            </div>
          )}
        </>
      )}
    </>
  );
}
