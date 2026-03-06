import React, { createContext, useContext, useState, useEffect } from 'react';
import { ref, onValue, set, remove, update } from 'firebase/database';
import { db } from '../firebase';

export const DEFAULT_CATEGORIES = [
  { id: 'yatak',    name: 'Yatak',      icon: '🛏️', order: 1 },
  { id: 'kanepe',   name: 'Kanepe',     icon: '🛋️', order: 2 },
  { id: 'koltuk',   name: 'Koltuk',     icon: '💺',  order: 3 },
  { id: 'masa',     name: 'Masa/Sehpa', icon: '🪑',  order: 4 },
  { id: 'sandalye', name: 'Sandalye',   icon: '🪑',  order: 5 },
  { id: 'dolap',    name: 'Dolap',      icon: '🗄️', order: 6 },
  { id: 'diger',    name: 'Diğer',      icon: '📦',  order: 7 },
];

const CategoriesContext = createContext(null);

// Türkçe karakterleri latin'e çevirip slug üretir
function toSlug(str) {
  return str
    .toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function CategoriesProvider({ children }) {
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const catRef = ref(db, 'categories');
    const unsub = onValue(catRef, async (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const cats = Object.keys(data).map((id) => ({ id, ...data[id] }));
        cats.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
        setCategories(cats);
      } else {
        // Veritabanında kategori yoksa varsayılanları ekle
        const seed = {};
        DEFAULT_CATEGORIES.forEach((cat) => {
          const { id, ...rest } = cat;
          seed[id] = rest;
        });
        try {
          await set(catRef, seed);
        } catch (err) {
          console.error('Varsayılan kategoriler yazılamadı:', err);
        }
        setCategories(DEFAULT_CATEGORIES);
      }
      setLoaded(true);
    });
    return () => unsub();
  }, []);

  /** Yeni kategori ekler; benzersiz ID üretir ve ID'yi döner */
  const addCategory = async (name, icon = '📦') => {
    let baseId = toSlug(name) || 'kategori';
    const existingIds = new Set(categories.map((c) => c.id));
    let id = baseId;
    let n = 2;
    while (existingIds.has(id)) {
      id = `${baseId}-${n}`;
      n++;
    }
    const order = categories.length > 0
      ? Math.max(...categories.map((c) => c.order ?? 0)) + 1
      : 1;
    try {
      await set(ref(db, `categories/${id}`), { name, icon, order });
    } catch (err) {
      console.error('Kategori eklenemedi:', err);
      throw err;
    }
    return id;
  };

  /** Kategori adı/ikonunu günceller */
  const updateCategory = async (id, updates) => {
    try {
      await update(ref(db, `categories/${id}`), updates);
    } catch (err) {
      console.error('Kategori güncellenemedi:', err);
      throw err;
    }
  };

  /** Kategoriyi siler */
  const deleteCategory = async (id) => {
    try {
      await remove(ref(db, `categories/${id}`));
    } catch (err) {
      console.error('Kategori silinemedi:', err);
      throw err;
    }
  };

  return (
    <CategoriesContext.Provider
      value={{ categories, addCategory, updateCategory, deleteCategory, loaded }}
    >
      {children}
    </CategoriesContext.Provider>
  );
}

export function useCategories() {
  const ctx = useContext(CategoriesContext);
  if (!ctx) throw new Error('useCategories must be used within CategoriesProvider');
  return ctx;
}
