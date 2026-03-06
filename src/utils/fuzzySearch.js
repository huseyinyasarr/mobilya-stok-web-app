/**
 * Paylaşımlı fuzzy-search yardımcıları.
 * ProductList ve ActivityLogs tarafından kullanılır.
 */

// ── Jaro benzerlik algoritması ────────────────────────────────────────────────
export function calculateSimilarity(str1, str2) {
  if (typeof str1 !== 'string' || typeof str2 !== 'string') return 0;
  if (str1 === str2) return 1;
  if (str1.length === 0 || str2.length === 0) return 0;

  const s1_matches = new Array(str1.length).fill(false);
  const s2_matches = new Array(str2.length).fill(false);
  const match_distance = Math.floor(Math.max(str1.length, str2.length) / 2) - 1;
  let matches_count = 0;

  for (let i = 0; i < str1.length; i++) {
    const start = Math.max(0, i - match_distance);
    const end = Math.min(i + match_distance + 1, str2.length);
    for (let j = start; j < end; j++) {
      if (s2_matches[j] || str1[i] !== str2[j]) continue;
      s1_matches[i] = s2_matches[j] = true;
      matches_count++;
      break;
    }
  }

  if (matches_count === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < str1.length; i++) {
    if (!s1_matches[i]) continue;
    while (!s2_matches[k]) k++;
    if (str1[i] !== str2[k]) transpositions++;
    k++;
  }

  return (
    matches_count / str1.length +
    matches_count / str2.length +
    (matches_count - transpositions / 2) / matches_count
  ) / 3;
}

// ── Arama terimleri için skor hesapla ─────────────────────────────────────────
/**
 * Kelime listesine karşı arama terimleri puanlar.
 * @param {string[]} words         - Aranacak metin kelimelere bölünmüş hâli
 * @param {string[]} searchTerms   - Kullanıcının girdiği terimler (küçük harf)
 * @returns {{ totalScore: number, foundTerms: number }}
 */
export function scoreSearchTerms(words, searchTerms) {
  let totalScore = 0;
  let foundTerms = 0;

  for (const term of searchTerms) {
    let bestScore = 0;
    let termFound = false;

    for (const word of words) {
      if (word === term) {
        bestScore = Math.max(bestScore, 100);
        termFound = true;
      } else if (word.startsWith(term)) {
        bestScore = Math.max(bestScore, 80);
        termFound = true;
      } else if (word.includes(term)) {
        bestScore = Math.max(bestScore, 50);
        termFound = true;
      } else if (term.length >= 3) {
        const sim = calculateSimilarity(term, word);
        if (sim > 0.7) {
          bestScore = Math.max(bestScore, sim * 40);
          termFound = true;
        }
      }
    }

    if (termFound) {
      foundTerms++;
      totalScore += bestScore;
    }
  }

  return { totalScore, foundTerms };
}

// ── Tarih formatı (Türkçe göreceli zaman) ────────────────────────────────────
/**
 * @param {string} timestamp   - ISO tarih dizesi
 * @param {string} [suffix=''] - Geçmiş zaman eki (örn. ' güncellendi')
 */
export function formatRelativeDate(timestamp, suffix = '') {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  const diffInMinutes = Math.floor((Date.now() - date) / (1000 * 60));

  if (diffInMinutes < 1) return `Az önce${suffix}`;
  if (diffInMinutes < 60) return `${diffInMinutes} dakika önce${suffix}`;
  if (diffInMinutes < 1440) {
    const hours = Math.floor(diffInMinutes / 60);
    return `${hours} saat önce${suffix}`;
  }
  return date.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }) + (suffix ? ` ${suffix}` : '');
}
