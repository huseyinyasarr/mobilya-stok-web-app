import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useCategories } from '../contexts/CategoriesContext';
import { detectIntraVariantConflicts } from '../utils/productService';
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
 * mode='quantity'      → Yeni ürün: renk alanları düzenlenebilir, değer ≥ 0
 * mode='delta'         → Stok güncelleme: mevcut renkler salt-okunur, delta +/−
 *                         isNew:true olan satırlar düzenlenebilir (yeni renk ekleme)
 *
 * onEditProductInfo    → Delta modda header'da kalem butonu gösterir; tıklanınca çağrılır
 */
export function VariantsEditor({ variants, onChange, mode = 'quantity', disabled = false, onEditProductInfo = null, onConflictsChange = null, perVariantReason = false }) {
  const updateVariant = (idx, field, val) =>
    onChange(variants.map((v, i) => (i === idx ? { ...v, [field]: val } : v)));

  const addVariant = () => {
    const reasonDefaults = perVariantReason
      ? { stockReason: '', returnReason: '', returnDescription: '' }
      : {};
    if (mode === 'quantity') {
      onChange([...variants, { colorCode: '', colorName: '', varyans: '', quantity: '', ...reasonDefaults }]);
    } else {
      onChange([...variants, { colorCode: '', colorName: '', varyans: '', currentQty: null, delta: '', isNew: true, ...reasonDefaults }]);
    }
  };

  const updateReason = (idx, reasonVal) =>
    onChange(variants.map((v, i) => (i === idx ? { ...v, ...reasonVal } : v)));

  const removeVariant = (idx) => {
    const v = variants[idx];
    // Delta modda mevcut (yeni olmayan) varyantı sil → delta'yı -currentQty yap
    // Böylece stok sebebi seçilebilir ve işlem kuyruğa eklenebilir
    if (mode === 'delta' && !v.isNew) {
      const currentQty = v.currentQty || 0;
      if (currentQty > 0) {
        onChange(variants.map((item, i) =>
          i === idx
            ? {
                ...item,
                delta: String(-currentQty),
                isDeleting: true,
                stockReason: '',
                returnReason: '',
                returnDescription: '',
              }
            : item
        ));
        return;
      }
      // currentQty = 0 ise direkt sil (stokta hiçbir şey yok)
    }
    onChange(variants.filter((_, i) => i !== idx));
  };

  // Silme işlemini geri al — delta'yı sıfırla
  const undoDelete = (idx) =>
    onChange(variants.map((v, i) =>
      i === idx ? { ...v, delta: '', isDeleting: false } : v
    ));

  // Delta modda: mevcut stok + delta = gösterilen değer
  const getDisplayVal = (v) => {
    if (mode !== 'delta' || v.isNew) return v[mode === 'quantity' ? 'quantity' : 'delta'];
    const base = v.currentQty || 0;
    const d = parseInt(v.delta) || 0;
    return String(base + d);
  };

  // Delta modda input değiştiğinde: delta = yeniGösterilen - currentQty
  const handleDisplayChange = (idx, rawVal, v) => {
    if (mode === 'quantity') { updateVariant(idx, 'quantity', rawVal); return; }
    if (v.isNew) { updateVariant(idx, 'delta', rawVal); return; }
    if (rawVal === '') { updateVariant(idx, 'delta', ''); return; }
    const parsed = parseInt(rawVal);
    if (!isNaN(parsed)) {
      updateVariant(idx, 'delta', String(Math.max(0, parsed) - (v.currentQty || 0)));
    }
  };

  const handleMinus = (idx, v) => {
    if (mode === 'quantity') {
      updateVariant(idx, 'quantity', Math.max(0, (parseInt(v.quantity) || 0) - 1));
    } else if (v.isNew) {
      updateVariant(idx, 'delta', Math.max(0, (parseInt(v.delta) || 0) - 1));
    } else {
      const cur = (v.currentQty || 0) + (parseInt(v.delta) || 0);
      const next = Math.max(0, cur - 1);
      updateVariant(idx, 'delta', String(next - (v.currentQty || 0)));
    }
  };

  const handlePlus = (idx, v) => {
    if (mode === 'quantity') {
      updateVariant(idx, 'quantity', (parseInt(v.quantity) || 0) + 1);
    } else if (v.isNew) {
      updateVariant(idx, 'delta', (parseInt(v.delta) || 0) + 1);
    } else {
      const cur = (v.currentQty || 0) + (parseInt(v.delta) || 0);
      updateVariant(idx, 'delta', String(cur + 1 - (v.currentQty || 0)));
    }
  };

  const total = variants.reduce((sum, v) => {
    if (mode === 'quantity') return sum + (parseInt(v.quantity) || 0);
    if (v.isNew) return sum + (parseInt(v.delta) || 0);
    return sum + (v.currentQty || 0) + (parseInt(v.delta) || 0);
  }, 0);

  const totalBadgeClass = 'edit-total-quantity';
  const totalLabel = `Toplam: ${total} adet`;

  // Form içi varyant çakışmalarını tespit et
  const intraConflicts = useMemo(
    () => detectIntraVariantConflicts(variants),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(variants.map((v) => ({ c: v.colorCode, n: v.colorName, v: v.varyans })))]
  );
  const conflictIndices = useMemo(
    () => new Set(intraConflicts.flatMap((c) => c.indices)),
    [intraConflicts]
  );

  // Üst bileşene çakışma durumunu bildir
  useEffect(() => {
    onConflictsChange?.(intraConflicts.length > 0);
  }, [intraConflicts.length, onConflictsChange]);

  return (
    <div className="edit-variants-section">
      <div className="edit-variants-header">
        <label>
          Renk Çeşitleri{mode === 'quantity' ? ' *' : ''}
        </label>
        <div className="edit-variants-header-right">
          {mode === 'delta' && onEditProductInfo && (
            <button
              type="button"
              className="edit-variants-info-btn"
              onClick={onEditProductInfo}
              title="Ürün adı / kategori düzenle"
            >
              ✏
            </button>
          )}
          <span className={totalBadgeClass}>{totalLabel}</span>
        </div>
      </div>

      <div className="edit-variants-list">
        {variants.map((v, idx) => {
          // Delta modda: delta ≠ 0; quantity modda: adet > 0
          const activeQty = mode === 'delta'
            ? (parseInt(v.delta) || 0)
            : (parseInt(v.quantity) || 0);
          const showReason = perVariantReason && activeQty !== 0;
          // InlineReasonSelector için: quantity modda her zaman arttırma yönünde
          const reasonDelta = mode === 'delta' ? activeQty : 1;

          return (
            <div key={idx} className={`edit-variant-group${showReason ? ' has-reason' : ''}`}>
              <div
                className={`edit-variant-row${mode === 'delta' ? ' edit-variant-row--delta' : ''}${v.isNew ? ' edit-variant-row--new' : ''}${v.isDeleting ? ' edit-variant-row--deleting' : ''}${conflictIndices.has(idx) ? ' edit-variant-row--conflict' : ''}`}
              >
                <div className="edit-variant-inputs">
                  <input
                    type="text"
                    placeholder="Varyans (ölçü, boyut vb.)"
                    value={v.varyans || ''}
                    onChange={(e) => updateVariant(idx, 'varyans', e.target.value)}
                    disabled={disabled}
                    className="edit-varyans-input"
                  />
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

                  <div className="edit-quantity-container">
                    <button
                      type="button"
                      className="edit-quantity-btn minus"
                      onClick={() => handleMinus(idx, v)}
                      disabled={disabled || parseInt(getDisplayVal(v)) === 0}
                    >
                      −
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="Adet"
                      value={getDisplayVal(v)}
                      onChange={(e) => handleDisplayChange(idx, e.target.value, v)}
                      disabled={disabled}
                      className="edit-quantity-input"
                      style={{ textAlign: 'center' }}
                    />
                    <button
                      type="button"
                      className="edit-quantity-btn plus"
                      onClick={() => handlePlus(idx, v)}
                      disabled={disabled}
                    >
                      +
                    </button>
                  </div>
                </div>

                {v.isDeleting ? (
                  <button
                    type="button"
                    className="edit-remove-variant-btn edit-remove-variant-btn--undo"
                    onClick={() => undoDelete(idx)}
                    disabled={disabled}
                    title="Silmeyi geri al"
                  >
                    ↩ Geri Al
                  </button>
                ) : (
                  <button
                    type="button"
                    className="edit-remove-variant-btn"
                    onClick={() => removeVariant(idx)}
                    disabled={disabled || (mode === 'quantity' && variants.length === 1)}
                    title="Bu rengi sil"
                  >
                    Sil
                  </button>
                )}
              </div>

              {showReason && (
                <InlineReasonSelector
                  value={{ stockReason: v.stockReason, returnReason: v.returnReason, returnDescription: v.returnDescription }}
                  onChange={(val) => updateReason(idx, val)}
                  delta={reasonDelta}
                  disabled={disabled}
                />
              )}
            </div>
          );
        })}
        {intraConflicts.length > 0 && (
          <div className="edit-variants-conflict-summary">
            {intraConflicts.map((c, i) => (
              <div key={i} className={`edit-variant-conflict-msg edit-variant-conflict-msg--${c.type}`}>
                ⚠ {c.detail}
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        className="edit-add-variant-btn"
        onClick={addVariant}
        disabled={disabled}
      >
        + Yeni Renk Ekle
      </button>
    </div>
  );
}

/**
 * InlineReasonSelector — Her varyant satırı için kompakt stok sebebi seçici (delta modu)
 *
 * delta > 0  → increase modunda seçenekler (Satın Alım / Ürün İade)
 * delta < 0  → decrease modunda seçenekler (Ürün Satıldı / Firmaya İade)
 * delta === 0 → render edilmez (çağıran tarafından kontrol edilmeli)
 */
const PLACEHOLDER_LABEL = 'Satın alım/satım nedenini seçiniz';

export function InlineReasonSelector({ value, onChange, delta = 0, disabled = false }) {
  const { stockReason = '', returnReason = '', returnDescription = '' } = value || {};
  const mode = Number(delta) >= 0 ? 'increase' : 'decrease';

  const options =
    mode === 'increase'
      ? [{ value: 'purchase', label: 'Satın Alım' }, { value: 'return', label: 'Ürün İade' }]
      : [{ value: 'sold', label: 'Ürün Satıldı' }, { value: 'return_to_supplier', label: 'Firmaya İade' }];

  const effectiveReason = options.some((o) => o.value === stockReason) ? stockReason : '';

  const showReturnDetail =
    effectiveReason === 'return' || effectiveReason === 'return_to_supplier';

  return (
    <div className="inline-reason-selector">
      <select
        value={effectiveReason}
        onChange={(e) => onChange({ stockReason: e.target.value, returnReason: '', returnDescription: '' })}
        disabled={disabled}
        className="inline-reason-select"
      >
        <option value="">{PLACEHOLDER_LABEL}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {showReturnDetail && (
        <select
          value={returnReason}
          onChange={(e) => onChange({ stockReason: effectiveReason, returnReason: e.target.value, returnDescription: '' })}
          disabled={disabled}
          className="inline-reason-select"
        >
          <option value="">İade sebebi seçin...</option>
          <option value="wrong_product">Yanlış Ürün</option>
          <option value="damaged">Bozuk Ürün</option>
          <option value="other">Diğer</option>
        </select>
      )}

      {returnReason === 'other' && (
        <input
          type="text"
          value={returnDescription}
          onChange={(e) => onChange({ stockReason: effectiveReason, returnReason, returnDescription: e.target.value })}
          placeholder="İade açıklaması..."
          disabled={disabled}
          className="inline-reason-desc"
        />
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
  const blurTimeoutRef = useRef(null);

  const trimmed = value.trim();
  const filtered = brands
    .filter((b) =>
      !trimmed ? true : b.toLowerCase().includes(trimmed.toLowerCase())
    )
    .sort((a, b) => a.localeCompare(b, 'tr'));

  // Tam eşleşme yoksa ve bir şey yazılmışsa "Yeni ekle" seçeneği göster
  const hasExact = brands.some((b) => b.toLowerCase() === trimmed.toLowerCase());
  const showNewOption = show && trimmed.length > 0 && !hasExact;
  const showList = show && (filtered.length > 0 || showNewOption);

  const updatePos = () => {
    if (!inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    const itemCount = filtered.length + (showNewOption ? 1 : 0);
    const dropH = Math.min(itemCount * 42 + 8, 220);
    const spaceBelow = window.innerHeight - r.bottom;
    setDropStyle({
      width: r.width,
      left: r.left,
      ...(spaceBelow >= dropH
        ? { top: r.bottom + 4 }
        : { top: r.top - dropH - 4 }),
    });
  };

  const handleSelect = (val) => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
    onChange(val);
    setShow(false);
  };

  const handleBlur = () => {
    blurTimeoutRef.current = setTimeout(() => setShow(false), 200);
  };

  useEffect(() => () => {
    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
  }, []);

  const handleItemPointerDown = (e) => {
    if (e.pointerType === 'mouse') e.preventDefault();
  };

  return (
    <div className="brand-input-wrapper">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); updatePos(); }}
        onFocus={() => { updatePos(); setShow(true); }}
        onBlur={handleBlur}
        placeholder={placeholder || 'Örn: Özgür Mobilya'}
        disabled={disabled}
        autoComplete="off"
      />
      {showList &&
        createPortal(
          <ul className="brand-suggestions-list" style={dropStyle}>
            {filtered.map((b) => {
              const isExact = b.toLowerCase() === trimmed.toLowerCase();
              return (
                <li
                  key={b}
                  className={isExact ? 'brand-exact' : ''}
                  onPointerDown={handleItemPointerDown}
                  onClick={() => handleSelect(b)}
                >
                  {isExact && <span className="brand-check-icon">✓</span>}
                  {b}
                </li>
              );
            })}
            {showNewOption && (
              <li
                className="brand-new-option"
                onPointerDown={handleItemPointerDown}
                onClick={() => handleSelect(trimmed)}
              >
                <span className="brand-new-icon">＋</span>
                <span>
                  "<strong>{trimmed}</strong>" yeni marka olarak ekle
                </span>
              </li>
            )}
          </ul>,
          document.body
        )}
    </div>
  );
}

/**
 * CategoryInput — Aranabilir + yeni kategori oluşturulabilir seçici
 *
 * Kategoriler CategoriesContext'ten okunur (Firebase).
 * Odaklanınca tüm kategoriler listelenir; yazıldıkça filtrelenir.
 * Eşleşme yoksa "＋ Yeni kategori ekle" seçeneği gösterilir.
 *
 * value: category ID  |  onChange: (id: string) => void
 */
export function CategoryInput({ value, onChange, disabled = false }) {
  const { categories, addCategory } = useCategories();

  const [inputText, setInputText] = useState(
    () => categories.find((c) => c.id === value)?.name || ''
  );
  const [show, setShow] = useState(false);
  const [userTyped, setUserTyped] = useState(false);
  const [dropStyle, setDropStyle] = useState({});
  const [adding, setAdding] = useState(false);
  const inputRef = useRef(null);
  const blurTimeoutRef = useRef(null);

  // Dışarıdan value veya categories değişirse görünen metni güncelle
  useEffect(() => {
    if (!show) {
      const cat = categories.find((c) => c.id === value);
      setInputText(cat?.name || '');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, categories]);

  const trimmed = inputText.trim();

  const filtered = categories.filter((c) =>
    !userTyped || !trimmed
      ? true
      : c.name.toLowerCase().includes(trimmed.toLowerCase())
  );

  // Tam eşleşme yoksa "+ Yeni kategori ekle" göster
  const hasExact = categories.some(
    (c) => c.name.toLowerCase() === trimmed.toLowerCase()
  );
  const showNewOption = show && userTyped && trimmed.length > 0 && !hasExact;
  const showList = show && (filtered.length > 0 || showNewOption);

  const updatePos = () => {
    if (!inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    const itemCount = filtered.length + (showNewOption ? 1 : 0);
    const dropH = Math.min(itemCount * 42 + 8, 260);
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
    setInputText('');
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
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
    onChange(cat.id);
    setInputText(cat.name);
    setUserTyped(false);
    setShow(false);
  };

  const handleAddNew = async () => {
    if (!trimmed || adding) return;
    setAdding(true);
    try {
      const newId = await addCategory(trimmed);
      onChange(newId);
      setInputText(trimmed);
    } catch (err) {
      console.error('Kategori eklenemedi:', err);
    } finally {
      setAdding(false);
      setShow(false);
      setUserTyped(false);
    }
  };

  const handleBlur = () => {
    blurTimeoutRef.current = setTimeout(() => {
      const match = categories.find(
        (c) => c.name.toLowerCase() === trimmed.toLowerCase()
      );
      if (match) {
        onChange(match.id);
        setInputText(match.name);
      } else {
        const current = categories.find((c) => c.id === value);
        setInputText(current?.name || '');
      }
      setShow(false);
      setUserTyped(false);
      blurTimeoutRef.current = null;
    }, 200);
  };

  useEffect(() => () => {
    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
  }, []);

  return (
    <div className="brand-input-wrapper">
      <input
        ref={inputRef}
        type="text"
        value={inputText}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder="Kategori Seçiniz"
        disabled={disabled || adding}
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
                    if (e.pointerType === 'mouse') {
                      e.preventDefault();
                      handleSelect(c);
                    }
                  }}
                  onClick={() => handleSelect(c)}
                >
                  {isSelected && <span className="brand-check-icon">✓</span>}
                  {c.icon && <span className="cat-option-icon">{c.icon}</span>}
                  {c.name}
                </li>
              );
            })}
            {showNewOption && (
              <li
                className="brand-new-option"
                onPointerDown={(e) => {
                  if (e.pointerType === 'mouse') {
                    e.preventDefault();
                    handleAddNew();
                  }
                }}
                onClick={() => handleAddNew()}
              >
                <span className="brand-new-icon">＋</span>
                <span>
                  "<strong>{trimmed}</strong>" yeni kategori olarak ekle
                </span>
              </li>
            )}
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
