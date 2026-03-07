import jsPDF from 'jspdf';
import { applyPlugin } from 'jspdf-autotable';

applyPlugin(jsPDF);

let fontCache = { regular: null, bold: null };
let logoCache = null; // küçültülmüş JPEG data URL

function ab2b64(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function ensureFonts() {
  if (fontCache.regular) return;
  try {
    const base = process.env.PUBLIC_URL || '';
    const [r, b] = await Promise.all([
      fetch(`${base}/fonts/Roboto-Regular.ttf`),
      fetch(`${base}/fonts/Roboto-Bold.ttf`),
    ]);
    if (r.ok) fontCache.regular = ab2b64(await r.arrayBuffer());
    if (b.ok) fontCache.bold = ab2b64(await b.arrayBuffer());
  } catch { /* fallback Helvetica */ }
}

// Logo'yu 80x80 JPEG'e küçültür — ~2-4 KB
async function ensureLogo() {
  if (logoCache) return logoCache;
  try {
    const base = process.env.PUBLIC_URL || '';
    const res = await fetch(`${base}/logo.png`);
    if (!res.ok) return null;
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob);
    const size = 80;
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(bmp, 0, 0, size, size);
    const outBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
    const buf = await outBlob.arrayBuffer();
    logoCache = 'data:image/jpeg;base64,' + ab2b64(buf);
    return logoCache;
  } catch {
    return null;
  }
}

function setupFont(doc) {
  if (fontCache.regular) {
    doc.addFileToVFS('Roboto-Regular.ttf', fontCache.regular);
    doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
  }
  if (fontCache.bold) {
    doc.addFileToVFS('Roboto-Bold.ttf', fontCache.bold);
    doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
  }
  if (fontCache.regular) { doc.setFont('Roboto'); return true; }
  return false;
}

function sanitize(text) {
  if (!text) return text;
  return text
    .replace(/ş/g, 's').replace(/Ş/g, 'S')
    .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
    .replace(/ı/g, 'i').replace(/İ/g, 'I');
}

function getQty(p) { return p.totalQuantity ?? p.quantity ?? 0; }

const SORT_LABELS = {
  'alphabetical': 'Alfabetik (A-Z)',
  'alphabetical-desc': 'Alfabetik (Z-A)',
  'quantity-desc': 'Stok (çoktan aza)',
  'quantity-asc': 'Stok (azdan çoğa)',
};
const GROUP_LABELS = {
  'none': 'Gruplama yok',
  'brand': 'Markaya göre',
  'category': 'Kategoriye göre',
};

// ─── İçerik yüksekliğini önceden hesapla (tek sayfa boyutu için) ───
function estimateHeight(groupedProducts, groupBy, viewMode, margin, pageW) {
  let h = 50; // başlık + tarih + filtre alanı

  for (const group of groupedProducts) {
    if (groupBy !== 'none') h += 12; // grup başlığı

    if (viewMode === 'detail') {
      for (const p of group.items) {
        let cardH = 14; // temel kart (isim satırı + padding)
        const variants = (p.variants || [])
          .filter(v => [v.colorCode, v.colorName, v.varyans].filter(Boolean).length > 0)
          .sort((a, b) => (a.varyans || '').localeCompare(b.varyans || '', 'tr'));
        if (variants.length > 0) {
          const chipsPerRow = Math.max(1, Math.floor((pageW - margin * 2 - 10) / 35));
          const rows = Math.ceil(variants.length / chipsPerRow);
          cardH += 5 + rows * 7;
        }
        if (p.description) cardH += 5;
        h += cardH + 3;
      }
      h += 12; // toplam satırı
    } else {
      // Liste: her satır ~8mm, header ~10mm, toplam ~8mm
      h += 10 + group.items.length * 8 + 8;
    }
    h += 8; // grup arası boşluk
  }

  h += 20; // genel toplam + alt boşluk
  return h;
}

// ─── Detay kartı çiz ───
function drawDetailCard(doc, p, x, y, cardW, groupBy, t, ff) {
  const padX = 4;
  const lineH = 5;

  let contentH = lineH;
  const variants = (p.variants || [])
    .filter(v => [v.colorCode, v.colorName, v.varyans].filter(Boolean).length > 0)
    .sort((a, b) => (a.varyans || '').localeCompare(b.varyans || '', 'tr'));
  if (variants.length > 0) {
    contentH += 3;
    const chipRowW = cardW - padX * 2 - 4;
    let rowW = 0, rows = 1;
    doc.setFontSize(7);
    for (const v of variants) {
      const info = [v.colorCode, v.colorName, v.varyans].filter(Boolean).join(' — ');
      const tw = doc.getTextWidth(t(`${info}: ${v.quantity ?? 0} adet`)) + 6;
      if (rowW + tw + 2 > chipRowW && rowW > 0) { rows++; rowW = 0; }
      rowW += tw + 2;
    }
    contentH += rows * 7;
  }
  if (p.description) contentH += lineH;
  const totalH = contentH + padX * 2;

  // Kart arka planı
  doc.setFillColor(250, 251, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(x, y, cardW, totalH, 2, 2, 'FD');

  // Sol mor çizgi
  doc.setFillColor(102, 126, 234);
  doc.rect(x, y + 1, 1.2, totalH - 2, 'F');

  let cx = x + padX + 2;
  let cy = y + padX + 3;

  // Ürün adı
  doc.setFontSize(9);
  doc.setFont(ff, 'bold');
  doc.setTextColor(26, 32, 44);
  doc.text(t(p.name || ''), cx, cy);
  let bx = cx + doc.getTextWidth(t(p.name || '')) + 3;

  // Marka badge
  if (groupBy !== 'brand' && p.brand) {
    doc.setFontSize(6.5); doc.setFont(ff, 'normal');
    const bt = t(p.brand), bw = doc.getTextWidth(bt) + 4;
    doc.setFillColor(219, 234, 254);
    doc.roundedRect(bx, cy - 3, bw, 4, 1, 1, 'F');
    doc.setTextColor(29, 78, 216);
    doc.text(bt, bx + 2, cy - 0.5);
    bx += bw + 2;
  }

  // Kategori badge
  if (groupBy !== 'category' && p.category) {
    doc.setFontSize(6.5); doc.setFont(ff, 'normal');
    const ct = t(p.category), cw = doc.getTextWidth(ct) + 4;
    doc.setFillColor(226, 232, 240);
    doc.roundedRect(bx, cy - 3, cw, 4, 1, 1, 'F');
    doc.setTextColor(74, 85, 104);
    doc.text(ct, bx + 2, cy - 0.5);
  }

  // Adet (sağda)
  const qt = `${getQty(p)} adet`;
  doc.setFontSize(9); doc.setFont(ff, 'bold'); doc.setTextColor(5, 150, 105);
  doc.text(qt, x + cardW - padX - doc.getTextWidth(qt), cy);

  cy += lineH;

  // Varyant chip'leri
  if (variants.length > 0) {
    doc.setDrawColor(226, 232, 240);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(cx, cy - 1, x + cardW - padX, cy - 1);
    doc.setLineDashPattern([], 0);
    cy += 2;

    const chipH = 4.5, chipGap = 2, chipRowW = cardW - padX * 2 - 4;
    let rx = cx;
    for (const v of variants) {
      const info = [v.colorCode, v.colorName, v.varyans].filter(Boolean).join(' — ');
      const label = `${info}: ${v.quantity ?? 0} adet`;
      doc.setFontSize(7); doc.setFont(ff, 'normal');
      const tw = doc.getTextWidth(t(label)) + 6;
      if (rx + tw - cx > chipRowW && rx > cx) { rx = cx; cy += chipH + chipGap; }
      doc.setFillColor(224, 231, 255);
      doc.roundedRect(rx, cy - 3, tw, chipH, 1, 1, 'F');
      doc.setTextColor(67, 56, 202);
      doc.text(t(label), rx + 3, cy - 0.3);
      rx += tw + chipGap;
    }
    cy += chipH + chipGap;
  }

  if (p.description) {
    doc.setFontSize(7.5); doc.setFont(ff, 'normal'); doc.setTextColor(100, 116, 139);
    doc.text(t(p.description), cx, cy);
  }

  doc.setTextColor(0, 0, 0);
  return y + totalH + 3;
}


export async function generateStockPDF({
  groupedProducts, groupBy, viewMode, filteredProducts,
  selectedBrands = [], selectedCategories = [], sortBy = 'alphabetical',
}) {
  await Promise.all([ensureFonts(), ensureLogo()]);

  const A4W = 210; // mm
  const margin = 14;
  const contentW = A4W;

  // İçerik yüksekliğini hesapla → tek sayfa
  const estH = estimateHeight(groupedProducts, groupBy, viewMode, margin, contentW);
  const pageH = Math.max(estH + 30, 100); // minimum 100mm

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [contentW, pageH],
    compress: true,
  });

  const hasTR = setupFont(doc);
  const t = (text) => (hasTR ? String(text ?? '') : sanitize(String(text ?? '')));
  const ff = hasTR ? 'Roboto' : 'helvetica';
  const pageW = doc.internal.pageSize.getWidth();

  // ─── Başlık: Logo + Firma adı ───
  let titleX = margin;
  if (logoCache) {
    try {
      doc.addImage(logoCache, 'JPEG', margin, 10, 10, 10);
      titleX = margin + 13;
    } catch { /* atla */ }
  }

  doc.setFontSize(16); doc.setFont(ff, 'bold'); doc.setTextColor(26, 32, 44);
  doc.text(t('Şeref Mobilya'), titleX, 15.5);
  doc.setFontSize(10); doc.setFont(ff, 'normal'); doc.setTextColor(100, 116, 139);
  doc.text(t('Stok Raporu'), titleX, 20.5);

  doc.setDrawColor(102, 126, 234); doc.setLineWidth(0.5);
  doc.line(margin, 24, pageW - margin, 24);

  // ─── Tarih, özet, filtre ───
  const now = new Date();
  const dateStr = now.toLocaleDateString('tr-TR');
  const timeStr = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  doc.setFontSize(8.5); doc.setFont(ff, 'normal'); doc.setTextColor(100, 116, 139);
  doc.text(t(`Tarih: ${dateStr}  ${timeStr}`), margin, 29);

  const totalVariety = filteredProducts.length;
  const totalQty = filteredProducts.reduce((s, p) => s + getQty(p), 0);
  doc.text(t(`Toplam ${totalVariety} ürün çeşidi — ${totalQty} adet`), margin, 34);

  const fp = [];
  if (selectedBrands.length > 0) fp.push(`Marka: ${selectedBrands.join(', ')}`);
  if (selectedCategories.length > 0) fp.push(`Kategori: ${selectedCategories.join(', ')}`);
  fp.push(`Sıralama: ${SORT_LABELS[sortBy] || sortBy}`);
  fp.push(`Gruplama: ${GROUP_LABELS[groupBy] || groupBy}`);
  doc.setFontSize(7.5);
  doc.text(t(fp.join('  |  ')), margin, 39);
  doc.setTextColor(0, 0, 0);

  let cursorY = 45;

  // ─── Gruplar ───
  for (const group of groupedProducts) {
    if (groupBy !== 'none') {
      doc.setFillColor(241, 245, 249); doc.setDrawColor(226, 232, 240);
      doc.roundedRect(margin, cursorY, pageW - margin * 2, 8, 2, 2, 'FD');
      doc.setFontSize(10); doc.setFont(ff, 'bold'); doc.setTextColor(51, 65, 85);
      doc.text(t(group.label), margin + 4, cursorY + 5.5);

      const gT = group.items.reduce((s, p) => s + getQty(p), 0);
      const gInfo = t(`${group.items.length} ürün — ${gT} adet`);
      doc.setFontSize(8); doc.setFont(ff, 'normal'); doc.setTextColor(100, 116, 139);
      doc.text(gInfo, pageW - margin - doc.getTextWidth(gInfo) - 4, cursorY + 5.5);
      doc.setTextColor(0, 0, 0);
      cursorY += 12;
    }

    if (viewMode === 'detail') {
      const cardW = pageW - margin * 2;
      for (const p of group.items) {
        cursorY = drawDetailCard(doc, p, margin, cursorY, cardW, groupBy, t, ff);
      }

      // Grup toplam
      const gT = group.items.reduce((s, p) => s + getQty(p), 0);
      const cardW2 = pageW - margin * 2;
      doc.setFillColor(224, 231, 255);
      doc.roundedRect(margin, cursorY, cardW2, 7, 1.5, 1.5, 'F');
      doc.setFontSize(9); doc.setFont(ff, 'bold'); doc.setTextColor(67, 56, 202);
      doc.text(t('TOPLAM'), margin + 4, cursorY + 4.8);
      doc.text(String(gT), margin + cardW2 - 4 - doc.getTextWidth(String(gT)), cursorY + 4.8);
      doc.setTextColor(0, 0, 0);
      cursorY += 12;

    } else {
      // ─── LİSTE: autoTable ───
      const head = [t('Ürün Adı')];
      if (groupBy !== 'brand') head.push(t('Marka'));
      if (groupBy !== 'category') head.push(t('Kategori'));
      head.push(t('Adet'));

      const colCount = head.length;
      const body = [];
      for (const p of group.items) {
        const row = [t(p.name || '')];
        if (groupBy !== 'brand') row.push(t(p.brand || '—'));
        if (groupBy !== 'category') row.push(t(p.category || '—'));
        row.push(String(getQty(p)));
        body.push(row);
      }

      const gTotal = group.items.reduce((s, p) => s + getQty(p), 0);
      const totalRow = [t('TOPLAM')];
      for (let i = 1; i < colCount - 1; i++) totalRow.push('');
      totalRow.push(String(gTotal));
      const totalIdx = body.length;
      body.push(totalRow);

      doc.autoTable({
        startY: cursorY,
        head: [head],
        body,
        margin: { left: margin, right: margin },
        tableWidth: 'auto',
        styles: { font: ff, fontSize: 9, cellPadding: 3, lineColor: [226, 232, 240], lineWidth: 0.2 },
        headStyles: { fillColor: [102, 126, 234], textColor: 255, fontStyle: 'bold', fontSize: 9 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: { 0: { cellWidth: 'auto' }, [colCount - 1]: { halign: 'right', fontStyle: 'bold', cellWidth: 22 } },
        didParseCell: (data) => {
          if (data.section !== 'body') return;
          if (data.row.index === totalIdx) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [224, 231, 255];
            data.cell.styles.textColor = [67, 56, 202];
          }
        },
      });
      cursorY = doc.lastAutoTable.finalY + 8;
    }
  }

  // ─── GENEL TOPLAM KUTUSU ───
  const uniqueBrands = new Set(filteredProducts.map(p => p.brand).filter(Boolean));
  const uniqueCategories = new Set(filteredProducts.map(p => p.category).filter(Boolean));
  const boxW = pageW - margin * 2;
  const boxH = 12;

  doc.setFillColor(102, 126, 234);
  doc.roundedRect(margin, cursorY, boxW, boxH, 2, 2, 'F');

  doc.setFontSize(10); doc.setFont(ff, 'bold'); doc.setTextColor(255, 255, 255);
  doc.text(t('GENEL TOPLAM'), margin + 5, cursorY + 5);

  // Kategori ve marka sayıları (orta kısım)
  doc.setFontSize(8); doc.setFont(ff, 'normal');
  const statsText = t(`${uniqueCategories.size} kategori  ·  ${uniqueBrands.size} marka  ·  ${totalVariety} ürün çeşidi`);
  doc.text(statsText, margin + 5, cursorY + 9.5);

  // Toplam adet (sağda, büyük)
  doc.setFontSize(12); doc.setFont(ff, 'bold');
  const totalText = t(`${totalQty} adet`);
  doc.text(totalText, margin + boxW - 5 - doc.getTextWidth(totalText), cursorY + 7.5);

  doc.setTextColor(0, 0, 0);

  // ─── Kaydet ───
  const fileDate = now.toISOString().slice(0, 10);
  doc.save(`seref-mobilya-stok-raporu-${fileDate}.pdf`);
}
