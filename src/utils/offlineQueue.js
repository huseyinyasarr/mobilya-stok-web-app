const QUEUE_KEY = 'mobilya_offline_queue';
const CACHE_KEY = 'mobilya_products_cache';

// UUID üretici (crypto API yoksa fallback)
const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

// --- Offline Kuyruk İşlemleri ---

export const getQueue = () => {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveQueue = (queue) => {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.error('Kuyruk kaydedilemedi:', err);
  }
};

export const addToQueue = (entry) => {
  const queue = getQueue();
  const newEntry = {
    id: generateId(),
    status: 'pending',
    createdAt: new Date().toISOString(),
    ...entry
  };
  queue.push(newEntry);
  saveQueue(queue);
  return newEntry;
};

export const removeFromQueue = (id) => {
  const queue = getQueue().filter((e) => e.id !== id);
  saveQueue(queue);
};

export const updateQueueEntry = (id, updates) => {
  const queue = getQueue().map((e) => (e.id === id ? { ...e, ...updates } : e));
  saveQueue(queue);
};

export const clearQueue = () => {
  localStorage.removeItem(QUEUE_KEY);
};

export const getPendingCount = () => {
  return getQueue().filter((e) => e.status === 'pending').length;
};

// --- Ürün Önbelleği İşlemleri ---

export const getProductsCache = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const setProductsCache = (products) => {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ lastUpdated: new Date().toISOString(), products })
    );
  } catch (err) {
    console.error('Ürün önbelleği kaydedilemedi:', err);
  }
};
