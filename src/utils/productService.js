import { ref, push, get, runTransaction } from 'firebase/database';
import { db } from '../firebase';
import { createLog, LOG_ACTIONS } from './logging';

// ── Renk varyantı çakışma tespiti ─────────────────────────────────────────────

/**
 * Tek bir varyant listesi içindeki (form içi) çakışmaları tespit eder.
 *
 * Çakışma tipleri:
 *   - duplicate              : Aynı renk kodu veya (kodsuz) aynı renk adı birden fazla satırda
 *   - code_name_mismatch     : Aynı renk kodu, farklı dolu renk adları
 *   - name_only_code_asymmetry: Aynı renk adı, birinde kod var diğerinde yok
 *
 * @param {Array} variants - { colorCode, colorName, ... }[]
 * @returns {Array} conflicts — [{ indices: [i, j], type, detail }]
 */
export function detectIntraVariantConflicts(variants) {
  const conflicts = [];

  for (let i = 0; i < variants.length; i++) {
    const a = variants[i];
    const aCode = (a.colorCode || '').trim();
    const aName = (a.colorName || '').trim();
    if (!aCode && !aName) continue;

    for (let j = i + 1; j < variants.length; j++) {
      const b = variants[j];
      const bCode = (b.colorCode || '').trim();
      const bName = (b.colorName || '').trim();
      if (!bCode && !bName) continue;

      if (aCode && bCode && aCode === bCode) {
        if (aName && bName && aName.toLowerCase() !== bName.toLowerCase()) {
          conflicts.push({
            indices: [i, j],
            type: 'code_name_mismatch',
            detail: `"${aCode}" renk kodu aynı ama adlar farklı ("${aName}" / "${bName}")`,
          });
        } else {
          conflicts.push({
            indices: [i, j],
            type: 'duplicate',
            detail: `"${aCode}" renk kodu birden fazla satırda kullanılmış`,
          });
        }
        continue;
      }

      if (!aCode && !bCode && aName && bName && aName.toLowerCase() === bName.toLowerCase()) {
        conflicts.push({
          indices: [i, j],
          type: 'duplicate',
          detail: `"${aName}" renk adı birden fazla satırda kullanılmış`,
        });
        continue;
      }

      if (
        aName && bName &&
        aName.toLowerCase() === bName.toLowerCase() &&
        !!aCode !== !!bCode
      ) {
        conflicts.push({
          indices: [i, j],
          type: 'name_only_code_asymmetry',
          detail: `"${aName}" renk adı hem kodlu hem kodsuz satırda var`,
        });
      }
    }
  }

  return conflicts;
}

/**
 * Yeni varyantları mevcut ürünün varyantlarıyla karşılaştırarak çakışmaları döndürür.
 *
 * Eşleştirme önceliği (sadece o ürün bağlamında geçerlidir):
 *   1. Renk kodu varsa → koda göre eşleştir (ada bakılmaksızın)
 *   2. Renk kodu yoksa → ada göre eşleştir (ikisinde de kod yoksa)
 *
 * Çakışma tipleri:
 *   - code_name_mismatch     : Aynı kod, her ikisinde de ad var ama adlar farklı
 *   - name_only_code_asymmetry: Aynı ad, birinde kod var diğerinde yok
 *
 * @returns {Array} conflicts
 */
export function detectVariantConflicts(newVariants, existingVariants) {
  const conflicts = [];
  const matchedExistingIndices = new Set();

  for (let i = 0; i < newVariants.length; i++) {
    const nv = newVariants[i];
    const nvCode = (nv.colorCode || '').trim();
    const nvName = (nv.colorName || '').trim();

    if (nvCode) {
      // 1. Renk koduna göre eşleştir
      const existingIdx = existingVariants.findIndex(
        (ev, idx) => !matchedExistingIndices.has(idx) && (ev.colorCode || '').trim() === nvCode
      );

      if (existingIdx !== -1) {
        const ev = existingVariants[existingIdx];
        const evName = (ev.colorName || '').trim();

        if (evName && nvName && evName.toLowerCase() !== nvName.toLowerCase()) {
          // Çakışma: Aynı renk kodu, farklı dolu adlar
          conflicts.push({
            type: 'code_name_mismatch',
            newVariantIndex: i,
            existingVariant: ev,
            newVariant: nv,
          });
        } else {
          matchedExistingIndices.add(existingIdx);
        }
        continue;
      }
    }

    // 2. Renk adına göre eşleştir (ikisinde de renk kodu yoksa veya kod bulunamadıysa)
    if (nvName) {
      const existingIdx = existingVariants.findIndex(
        (ev, idx) =>
          !matchedExistingIndices.has(idx) &&
          (ev.colorName || '').trim().toLowerCase() === nvName.toLowerCase()
      );

      if (existingIdx !== -1) {
        const ev = existingVariants[existingIdx];
        const evCode = (ev.colorCode || '').trim();

        if ((evCode && !nvCode) || (!evCode && nvCode)) {
          // Çakışma: Aynı ad, biri renk kodlu diğeri değil
          conflicts.push({
            type: 'name_only_code_asymmetry',
            newVariantIndex: i,
            existingVariant: ev,
            newVariant: nv,
          });
        } else {
          // İkisinde de kod yok, aynı ad → eşleşme (sorunsuz)
          matchedExistingIndices.add(existingIdx);
        }
      }
    }
  }

  return conflicts;
}

/**
 * Kullanıcı seçimlerini uygulayarak düzeltilmiş varyant listesini döndürür.
 *
 * @param {Array}  variants    - Orijinal yeni varyantlar
 * @param {Array}  conflicts   - detectVariantConflicts() çıktısı
 * @param {Array}  resolutions - Her çakışma için seçim:
 *   code_name_mismatch    → 'keep_existing_name' | 'use_new_name'
 *   name_only_code_asymmetry → 'same' | 'separate'
 */
export function applyConflictResolutions(variants, conflicts, resolutions) {
  const resolved = variants.map((v) => ({ ...v }));

  for (let i = 0; i < conflicts.length; i++) {
    const conflict = conflicts[i];
    const resolution = resolutions[i];
    const idx = conflict.newVariantIndex;

    if (conflict.type === 'code_name_mismatch') {
      if (resolution === 'keep_existing_name') {
        resolved[idx] = { ...resolved[idx], colorName: conflict.existingVariant.colorName };
      }
      // 'use_new_name' → varyant olduğu gibi; transaction renk koduna göre eşleşecek
    } else if (conflict.type === 'name_only_code_asymmetry') {
      if (resolution === 'same') {
        // Mevcut ürünün renk kodunu al → transaction koda göre eşleşecek
        resolved[idx] = { ...resolved[idx], colorCode: conflict.existingVariant.colorCode };
      } else if (resolution === 'separate') {
        // Zorla yeni varyant olarak ekle (eşleştirmeyi atla)
        resolved[idx] = { ...resolved[idx], _forceNew: true };
      }
    }
  }

  return resolved;
}

// ── Genel giriş noktası ────────────────────────────────────────────────────────

/**
 * Yeni ürün ekler veya aynı isim+marka+kategori olan ürünün stoğunu artırır.
 * Renk varyantı çakışması varsa { action: 'conflict', ... } döndürür.
 */
export async function saveProduct({
  name,
  brand,
  category,
  description = '',
  variants,
  // Eski global reason alanları geriye dönük uyumluluk için tutuldu
  stockReason,
  returnReason = '',
  returnDescription = '',
  currentUser,
}) {
  const productsRef = ref(db, 'products');

  // Per-variant reason alanlarını koruyarak temizle (Firebase'e yazılmadan önce soyulur)
  const cleanVariants = variants
    .map((v) => ({
      colorCode: (v.colorCode || '').trim(),
      colorName: (v.colorName || '').trim(),
      quantity: parseInt(v.quantity) || 0,
      // Per-variant reason alanları (eğer yoksa global reason fallback)
      stockReason: v.stockReason || stockReason || 'purchase',
      returnReason: v.returnReason || returnReason || '',
      returnDescription: v.returnDescription || returnDescription || '',
    }))
    .filter((v) => v.quantity > 0);

  // Aynı isim + marka + kategori kombinasyonunu ara (büyük/küçük harf duyarsız)
  const snapshot = await get(productsRef);
  let existingId = null;
  let existingData = null;

  if (snapshot.exists()) {
    const nameLower = name.trim().toLowerCase();
    const brandLower = brand.trim().toLowerCase();

    snapshot.forEach((child) => {
      if (existingId) return;
      const p = child.val();
      if (
        p.name?.toLowerCase() === nameLower &&
        p.brand?.toLowerCase() === brandLower &&
        p.category === category
      ) {
        existingId = child.key;
        existingData = p;
      }
    });
  }

  if (existingId) {
    // Çakışma kontrolü (reason alanları çakışma tespitinde kullanılmaz)
    const conflictCheckVariants = cleanVariants.map(({ stockReason: _sr, returnReason: _rr, returnDescription: _rd, ...v }) => v);
    const conflicts = detectVariantConflicts(conflictCheckVariants, existingData.variants || []);
    if (conflicts.length > 0) {
      return { action: 'conflict', conflicts, existingProductId: existingId };
    }
    return await performStockUpdate({
      existingId,
      name: existingData.name,
      brand: existingData.brand,
      addVariants: cleanVariants,
      currentUser,
    });
  }

  return await performCreate({
    name,
    brand,
    category,
    description,
    cleanVariants,
    currentUser,
  });
}

/**
 * Çakışma çözüldükten sonra çağrılır. Conflict kontrolü atlanır,
 * direkt stok güncellemesi yapılır.
 */
export async function saveProductResolved({
  existingProductId,
  name,
  brand,
  resolvedVariants,
  // Geriye dönük uyumluluk için global reason alanları
  stockReason,
  returnReason = '',
  returnDescription = '',
  currentUser,
}) {
  const cleanVariants = resolvedVariants
    .map((v) => ({
      colorCode: (v.colorCode || '').trim(),
      colorName: (v.colorName || '').trim(),
      quantity: parseInt(v.quantity) || 0,
      stockReason: v.stockReason || stockReason || 'purchase',
      returnReason: v.returnReason || returnReason || '',
      returnDescription: v.returnDescription || returnDescription || '',
      ...(v._forceNew ? { _forceNew: true } : {}),
    }))
    .filter((v) => v.quantity > 0);

  return await performStockUpdate({
    existingId: existingProductId,
    name,
    brand,
    addVariants: cleanVariants,
    currentUser,
  });
}

// ── Kullanıcı referansı yardımcısı ────────────────────────────────────────────

export function buildUserRef(user) {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || 'Bilinmeyen Kullanıcı',
  };
}

// ── İç yardımcı fonksiyonlar ──────────────────────────────────────────────────

/**
 * Mevcut varyantlar arasında eşleşen indeksi bulur.
 * Önce renk koduna göre, sonra (her ikisinde de kod yoksa) ada göre arar.
 */
function findMatchingVariantIdx(existingVariants, newVariant) {
  if (newVariant._forceNew) return -1;

  const nvCode = (newVariant.colorCode || '').trim();
  const nvName = (newVariant.colorName || '').trim();

  if (nvCode) {
    const idx = existingVariants.findIndex((ev) => (ev.colorCode || '').trim() === nvCode);
    if (idx !== -1) return idx;
  }

  if (nvName) {
    return existingVariants.findIndex(
      (ev) =>
        !(ev.colorCode || '').trim() &&
        !nvCode &&
        (ev.colorName || '').trim().toLowerCase() === nvName.toLowerCase()
    );
  }

  return -1;
}

async function performStockUpdate({
  existingId,
  name,
  brand,
  addVariants,
  currentUser,
}) {
  const productRef = ref(db, `products/${existingId}`);
  const now = new Date().toISOString();
  let resultData = null;

  await runTransaction(productRef, (currentData) => {
    if (!currentData) return currentData;

    let existingVariants = currentData.variants ? [...currentData.variants] : [];
    // variantChanges artık _ref ile reason bilgisini taşır (gruplama için)
    const variantChanges = [];

    for (const v of addVariants) {
      const idx = findMatchingVariantIdx(existingVariants, v);

      if (idx !== -1) {
        const oldQty = existingVariants[idx].quantity || 0;
        const newQty = oldQty + v.quantity;
        const resolvedName = v.colorName || existingVariants[idx].colorName;

        variantChanges.push({
          colorCode: existingVariants[idx].colorCode,
          colorName: resolvedName,
          quantityChange: v.quantity,
          oldQuantity: oldQty,
          newQuantity: newQty,
          _dvRef: v, // per-variant reason için
        });
        existingVariants[idx] = {
          ...existingVariants[idx],
          quantity: newQty,
          colorName: resolvedName,
        };
      } else {
        // Yeni varyant (eşleşme yok veya forceNew)
        const { _forceNew, stockReason: _sr, returnReason: _rr, returnDescription: _rd, ...cleanV } = v;
        existingVariants.push(cleanV);
        variantChanges.push({
          colorCode: v.colorCode,
          colorName: v.colorName,
          quantityChange: v.quantity,
          oldQuantity: 0,
          newQuantity: v.quantity,
          _dvRef: v,
        });
      }
    }

    const addedQty = addVariants.reduce((s, v) => s + v.quantity, 0);
    const oldTotal = currentData.totalQuantity || 0;
    const newTotal = oldTotal + addedQty;

    // Per-variant reason: aynı sebepteki varyantları grupla
    const reasonGroups = new Map();
    for (const vc of variantChanges) {
      const dv = vc._dvRef || {};
      const reason = dv.stockReason || 'purchase';
      const key = `${reason}|${dv.returnReason || ''}`;
      if (!reasonGroups.has(key)) {
        reasonGroups.set(key, {
          stockReason: reason,
          returnReason: dv.returnReason || '',
          returnDescription: dv.returnDescription || '',
          quantity: 0,
          variantChanges: [],
        });
      }
      const g = reasonGroups.get(key);
      g.quantity += vc.quantityChange;
      const { _dvRef, ...vcClean } = vc;
      g.variantChanges.push(vcClean);
    }

    const stockEntries = [...reasonGroups.values()].map((g) =>
      buildStockEntry({
        type: 'increase',
        stockReason: g.stockReason,
        returnReason: g.returnReason,
        returnDescription: g.returnDescription,
        quantity: g.quantity,
        remainingStock: newTotal,
        variantChanges: g.variantChanges,
        currentUser,
        now,
      })
    );

    resultData = { totalQuantity: newTotal, oldTotal, stockReason: addVariants[0]?.stockReason || 'purchase' };

    return {
      ...currentData,
      variants: existingVariants,
      totalQuantity: newTotal,
      lastUpdated: now,
      stockHistory: [...(currentData.stockHistory || []), ...stockEntries],
    };
  });

  await createLog(
    LOG_ACTIONS.PRODUCT_UPDATED,
    currentUser,
    { id: existingId, name, brand, totalQuantity: resultData?.totalQuantity },
    {
      quantityChange: { from: resultData?.oldTotal, to: resultData?.totalQuantity },
      stockChangeType: 'increase',
      stockChangeReason: 'per_variant',
    }
  );

  return { id: existingId, action: 'updated', totalQuantity: resultData?.totalQuantity };
}

async function performCreate({
  name,
  brand,
  category,
  description,
  cleanVariants,
  currentUser,
}) {
  const now = new Date().toISOString();
  const productsRef = ref(db, 'products');
  const totalQuantity = cleanVariants.reduce((s, v) => s + v.quantity, 0);

  // Per-variant reason: aynı sebepteki varyantları grupla → ayrı stok geçmişi
  const reasonGroups = new Map();
  for (const v of cleanVariants) {
    const reason = v.stockReason || 'purchase';
    const key = `${reason}|${v.returnReason || ''}`;
    if (!reasonGroups.has(key)) {
      reasonGroups.set(key, {
        stockReason: reason,
        returnReason: v.returnReason || '',
        returnDescription: v.returnDescription || '',
        variants: [],
      });
    }
    reasonGroups.get(key).variants.push(v);
  }

  const stockHistory = [...reasonGroups.values()].map((g) => {
    const groupQty = g.variants.reduce((s, v) => s + v.quantity, 0);
    return buildStockEntry({
      type: 'increase',
      stockReason: g.stockReason,
      returnReason: g.returnReason,
      returnDescription: g.returnDescription,
      quantity: groupQty,
      remainingStock: totalQuantity,
      variantChanges: g.variants.map((v) => ({
        colorCode: v.colorCode,
        colorName: v.colorName,
        quantityChange: v.quantity,
        oldQuantity: 0,
        newQuantity: v.quantity,
      })),
      currentUser,
      now,
    });
  });

  // Reason alanları Firebase'e yazılmaz
  const variantsToStore = cleanVariants.map(
    ({ stockReason: _sr, returnReason: _rr, returnDescription: _rd, ...v }) => v
  );

  const productData = {
    name: name.trim(),
    brand: brand.trim(),
    category,
    description: description.trim(),
    variants: variantsToStore,
    totalQuantity,
    createdAt: now,
    lastUpdated: now,
    createdBy: buildUserRef(currentUser),
    stockHistory,
  };

  const newRef = await push(productsRef, productData);

  await createLog(
    LOG_ACTIONS.PRODUCT_CREATED,
    currentUser,
    { id: newRef.key, name: productData.name, brand: productData.brand, category, totalQuantity },
    { stockReason: 'per_variant' }
  );

  return { id: newRef.key, action: 'created', totalQuantity };
}

/**
 * Toplu giriş kuyruğundaki stok güncelleme kaydını Firebase'e yazar.
 * BulkProductEntry tarafından çağrılır.
 */
export async function syncBulkStockUpdate(entry, currentUser) {
  const d = entry.data;
  const productRef = ref(db, `products/${d.productId}`);
  const now = new Date().toISOString();
  let updatedProduct = null;
  const totalDelta = (d.deltaVariants || []).reduce((s, v) => s + (v.delta || 0), 0);

  await runTransaction(productRef, (currentData) => {
    if (!currentData) return currentData;

    let variants = currentData.variants ? [...currentData.variants] : [];
    const variantChanges = [];

    for (const dv of (d.deltaVariants || [])) {
      // Eşleştirme: önce originalColorCode/Name kullan (kullanıcı kodu değiştirmişse orijinal ile bul)
      // isNew ise doğrudan yeni varyant olarak ekle
      const matchCode = dv.isNew ? null : (dv.originalColorCode ?? dv.colorCode);
      const matchName = dv.isNew ? null : (dv.originalColorName ?? dv.colorName);
      const matchKey = `${matchCode}_${matchName}`;

      const idx = dv.isNew
        ? -1
        : variants.findIndex((v) => `${v.colorCode}_${v.colorName}` === matchKey);

      if (idx !== -1) {
        const oldQty = variants[idx].quantity || 0;
        const newQty = Math.max(0, oldQty + (dv.delta || 0));
        // Sadece miktar değişmişse log'a ekle; dvRef ile stok sebebini eşleştirmek için tut
        if (dv.delta !== 0) {
          variantChanges.push({
            colorCode: dv.colorCode,
            colorName: dv.colorName,
            quantityChange: dv.delta,
            oldQuantity: oldQty,
            newQuantity: newQty,
            _dvRef: dv, // reason gruplama için
          });
        }
        // Renk kodu/adı değiştiyse güncelle, yoksa orijinali koru
        variants[idx] = {
          ...variants[idx],
          quantity: newQty,
          ...(dv.colorCode !== matchCode && { colorCode: dv.colorCode }),
          ...(dv.colorName !== matchName && { colorName: dv.colorName }),
        };
      } else if (dv.isNew && (dv.delta || 0) > 0) {
        variantChanges.push({
          colorCode: dv.colorCode, colorName: dv.colorName,
          quantityChange: dv.delta, oldQuantity: 0, newQuantity: dv.delta,
          _dvRef: dv,
        });
        variants.push({ colorCode: dv.colorCode, colorName: dv.colorName, quantity: dv.delta });
      }
    }

    const oldTotal = currentData.totalQuantity || 0;
    const newTotal = Math.max(0, oldTotal + totalDelta);

    const existingHistory = currentData.stockHistory
      ? Object.values(currentData.stockHistory)
      : [];

    // Her varyant kendi stok sebebini taşır → aynı sebebe sahip varyantlar gruplandırılır
    const reasonGroups = new Map();
    for (const vc of variantChanges) {
      const dv = vc._dvRef || {};
      const reason = dv.stockReason || (vc.quantityChange >= 0 ? 'purchase' : 'sold');
      const key = `${reason}|${dv.returnReason || ''}`;
      if (!reasonGroups.has(key)) {
        reasonGroups.set(key, {
          stockReason: reason,
          returnReason: dv.returnReason || null,
          returnDescription: dv.returnDescription || null,
          quantityChange: 0,
          variantChanges: [],
        });
      }
      const group = reasonGroups.get(key);
      group.quantityChange += vc.quantityChange;
      // _dvRef'i log'a taşımayalım
      const { _dvRef, ...vcClean } = vc;
      group.variantChanges.push(vcClean);
    }

    const newEntries = [...reasonGroups.values()].map((g) =>
      buildStockEntry({
        type: g.quantityChange >= 0 ? 'increase' : 'decrease',
        stockReason: g.stockReason,
        returnReason: g.returnReason,
        returnDescription: g.returnDescription,
        quantity: Math.abs(g.quantityChange),
        remainingStock: newTotal,
        variantChanges: g.variantChanges,
        currentUser,
        now,
      })
    );

    const updatedHistory = newEntries.length > 0
      ? [...existingHistory, ...newEntries]
      : existingHistory;

    // Stoku sıfıra düşen varyantları temizle (tamamen silinen renkler)
    const cleanedVariants = variants.filter((v) => (v.quantity || 0) > 0);

    updatedProduct = {
      ...currentData,
      // Ürün adı / marka / kategori override'ları
      ...(d.nameOverride && { name: d.nameOverride }),
      ...(d.brandOverride && { brand: d.brandOverride }),
      ...(d.categoryOverride && { category: d.categoryOverride }),
      variants: cleanedVariants,
      totalQuantity: newTotal,
      lastUpdated: now,
      quantity: null,
      stockHistory: updatedHistory,
    };

    return updatedProduct;
  });

  if (updatedProduct) {
    const newTotal = updatedProduct.totalQuantity;
    await createLog(
      LOG_ACTIONS.PRODUCT_UPDATED,
      currentUser,
      { id: d.productId, name: d.productName, brand: d.brand, category: d.category, totalQuantity: newTotal },
      {
        quantityChange: { from: newTotal - totalDelta, to: newTotal },
        stockChangeType: totalDelta >= 0 ? 'increase' : 'decrease',
        stockChangeReason: totalDelta !== 0 ? 'per_variant' : null,
      }
    );
  }
}

export function buildStockEntry({
  type,
  stockReason,
  returnReason,
  returnDescription,
  quantity,
  remainingStock,
  variantChanges,
  currentUser,
  now,
}) {
  const entry = {
    date: now,
    type,
    reason: stockReason,
    quantity,
    remainingStock,
    variantChanges,
    user: buildUserRef(currentUser),
  };

  if (stockReason === 'return') {
    entry.returnReason = returnReason;
    if (returnReason === 'other' && returnDescription) {
      entry.returnDescription = returnDescription;
    }
  }

  return entry;
}
