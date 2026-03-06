import { ref, push, get, runTransaction } from 'firebase/database';
import { db } from '../firebase';
import { createLog, LOG_ACTIONS } from './logging';

// ── Renk varyantı çakışma tespiti ─────────────────────────────────────────────

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
  stockReason,
  returnReason = '',
  returnDescription = '',
  currentUser,
}) {
  const productsRef = ref(db, 'products');

  const cleanVariants = variants
    .map((v) => ({
      colorCode: (v.colorCode || '').trim(),
      colorName: (v.colorName || '').trim(),
      quantity: parseInt(v.quantity) || 0,
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
    // Çakışma kontrolü
    const conflicts = detectVariantConflicts(cleanVariants, existingData.variants || []);
    if (conflicts.length > 0) {
      return { action: 'conflict', conflicts, existingProductId: existingId };
    }
    return await performStockUpdate({
      existingId,
      name: existingData.name,
      brand: existingData.brand,
      addVariants: cleanVariants,
      stockReason,
      returnReason,
      returnDescription,
      currentUser,
    });
  }

  return await performCreate({
    name,
    brand,
    category,
    description,
    cleanVariants,
    stockReason,
    returnReason,
    returnDescription,
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
      ...(v._forceNew ? { _forceNew: true } : {}),
    }))
    .filter((v) => v.quantity > 0);

  return await performStockUpdate({
    existingId: existingProductId,
    name,
    brand,
    addVariants: cleanVariants,
    stockReason,
    returnReason,
    returnDescription,
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
  stockReason,
  returnReason,
  returnDescription,
  currentUser,
}) {
  const productRef = ref(db, `products/${existingId}`);
  const now = new Date().toISOString();
  let resultData = null;

  await runTransaction(productRef, (currentData) => {
    if (!currentData) return currentData;

    let existingVariants = currentData.variants ? [...currentData.variants] : [];
    const variantChanges = [];

    for (const v of addVariants) {
      const idx = findMatchingVariantIdx(existingVariants, v);

      if (idx !== -1) {
        const oldQty = existingVariants[idx].quantity || 0;
        const newQty = oldQty + v.quantity;
        // Renk adı: eğer yeni varyantta ad varsa kullan; yoksa mevcut adı koru
        const resolvedName = v.colorName || existingVariants[idx].colorName;

        variantChanges.push({
          colorCode: existingVariants[idx].colorCode,
          colorName: resolvedName,
          quantityChange: v.quantity,
          oldQuantity: oldQty,
          newQuantity: newQty,
        });
        existingVariants[idx] = {
          ...existingVariants[idx],
          quantity: newQty,
          colorName: resolvedName,
        };
      } else {
        // Yeni varyant (eşleşme yok veya forceNew)
        const { _forceNew, ...cleanV } = v;
        existingVariants.push(cleanV);
        variantChanges.push({
          colorCode: v.colorCode,
          colorName: v.colorName,
          quantityChange: v.quantity,
          oldQuantity: 0,
          newQuantity: v.quantity,
        });
      }
    }

    const addedQty = addVariants.reduce((s, v) => s + v.quantity, 0);
    const oldTotal = currentData.totalQuantity || 0;
    const newTotal = oldTotal + addedQty;

    const stockEntry = buildStockEntry({
      type: 'increase',
      stockReason,
      returnReason,
      returnDescription,
      quantity: addedQty,
      remainingStock: newTotal,
      variantChanges,
      currentUser,
      now,
    });

    resultData = { totalQuantity: newTotal, oldTotal };

    return {
      ...currentData,
      variants: existingVariants,
      totalQuantity: newTotal,
      lastUpdated: now,
      stockHistory: [...(currentData.stockHistory || []), stockEntry],
    };
  });

  await createLog(
    LOG_ACTIONS.PRODUCT_UPDATED,
    currentUser,
    { id: existingId, name, brand, totalQuantity: resultData?.totalQuantity },
    {
      quantityChange: { from: resultData?.oldTotal, to: resultData?.totalQuantity },
      stockChangeType: 'increase',
      stockChangeReason: stockReason,
      ...(stockReason === 'return' && returnReason === 'other' && returnDescription
        ? { stockChangeDescription: `other:${returnDescription}` }
        : stockReason === 'return' && returnReason
        ? { stockChangeDescription: returnReason }
        : {}),
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
  stockReason,
  returnReason,
  returnDescription,
  currentUser,
}) {
  const now = new Date().toISOString();
  const productsRef = ref(db, 'products');
  const totalQuantity = cleanVariants.reduce((s, v) => s + v.quantity, 0);

  const stockEntry = buildStockEntry({
    type: 'increase',
    stockReason,
    returnReason,
    returnDescription,
    quantity: totalQuantity,
    remainingStock: totalQuantity,
    variantChanges: cleanVariants.map((v) => ({
      colorCode: v.colorCode,
      colorName: v.colorName,
      quantityChange: v.quantity,
      oldQuantity: 0,
      newQuantity: v.quantity,
    })),
    currentUser,
    now,
  });

  const productData = {
    name: name.trim(),
    brand: brand.trim(),
    category,
    description: description.trim(),
    variants: cleanVariants,
    totalQuantity,
    createdAt: now,
    lastUpdated: now,
    createdBy: buildUserRef(currentUser),
    stockHistory: [stockEntry],
  };

  const newRef = await push(productsRef, productData);

  await createLog(
    LOG_ACTIONS.PRODUCT_CREATED,
    currentUser,
    { id: newRef.key, name: productData.name, brand: productData.brand, category, totalQuantity },
    {
      stockReason,
      returnReason: stockReason === 'return' ? returnReason : null,
      returnDescription:
        stockReason === 'return' && returnReason === 'other' ? returnDescription : null,
    }
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
  const totalDelta = d.deltaVariants.reduce((s, v) => s + v.delta, 0);

  await runTransaction(productRef, (currentData) => {
    if (!currentData) return currentData;

    let variants = currentData.variants ? [...currentData.variants] : [];
    const variantChanges = [];

    for (const dv of d.deltaVariants) {
      const key = `${dv.colorCode}_${dv.colorName}`;
      const idx = variants.findIndex((v) => `${v.colorCode}_${v.colorName}` === key);

      if (idx !== -1) {
        const oldQty = variants[idx].quantity || 0;
        const newQty = Math.max(0, oldQty + dv.delta);
        variantChanges.push({ colorCode: dv.colorCode, colorName: dv.colorName, quantityChange: dv.delta, oldQuantity: oldQty, newQuantity: newQty });
        variants[idx] = { ...variants[idx], quantity: newQty };
      } else if (dv.delta > 0) {
        variantChanges.push({ colorCode: dv.colorCode, colorName: dv.colorName, quantityChange: dv.delta, oldQuantity: 0, newQuantity: dv.delta });
        variants.push({ colorCode: dv.colorCode, colorName: dv.colorName, quantity: dv.delta });
      }
    }

    const oldTotal = currentData.totalQuantity || 0;
    const newTotal = Math.max(0, oldTotal + totalDelta);

    const stockEntry = buildStockEntry({
      type: totalDelta >= 0 ? 'increase' : 'decrease',
      stockReason: d.stockReason,
      returnReason: d.returnReason || null,
      returnDescription: d.returnDescription || null,
      quantity: Math.abs(totalDelta),
      remainingStock: newTotal,
      variantChanges,
      currentUser,
      now,
    });

    const existingHistory = currentData.stockHistory
      ? Object.values(currentData.stockHistory)
      : [];

    updatedProduct = {
      ...currentData,
      variants,
      totalQuantity: newTotal,
      lastUpdated: now,
      quantity: null,
      stockHistory: [...existingHistory, stockEntry],
    };

    return updatedProduct;
  });

  if (updatedProduct) {
    const newTotal = updatedProduct.totalQuantity;
    await createLog(
      LOG_ACTIONS.PRODUCT_UPDATED,
      currentUser,
      { id: d.productId, name: d.productName, brand: d.brand, category: d.category, totalQuantity: newTotal },
      { quantityChange: { from: newTotal - totalDelta, to: newTotal }, stockChangeType: totalDelta >= 0 ? 'increase' : 'decrease', stockChangeReason: d.stockReason }
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
