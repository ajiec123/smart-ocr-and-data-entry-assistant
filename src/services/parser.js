/**
 * Parser for Indonesian and general receipts/invoices.
 * Robust regex extraction with OCR fault tolerance (handling 0/O, 1/I, blurred dots).
 */

class ReceiptParser {
  /**
   * Parse raw OCR text into structured receipt model
   * @param {string} rawText
   * @returns {Object} Structured data
   */
  parse(rawText) {
    if (!rawText || typeof rawText !== 'string') {
      return this._emptyResult('');
    }

    const lines = rawText
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0);

    const merchant = this._extractMerchant(lines);
    const dateInfo = this._extractDate(lines);
    const invoiceNo = this._extractInvoiceNumber(lines);
    const cashier = this._extractCashier(lines);
    const paymentMethod = this._extractPaymentMethod(lines);
    
    // Financial numbers
    const totals = this._extractFinancials(lines);

    // Line items table
    const items = this._extractLineItems(lines, totals);

    // If items were found, recalculate verification check
    const itemsSum = items.reduce((sum, item) => sum + (item.total || 0), 0);
    const expectedTotal = totals.total || totals.subtotal || itemsSum;
    const isBalanced = items.length > 0 ? Math.abs(itemsSum - (totals.subtotal || totals.total || itemsSum)) <= 100 : true;

    return {
      rawText,
      merchant,
      date: dateInfo.date,
      time: dateInfo.time,
      invoiceNumber: invoiceNo,
      cashier,
      paymentMethod,
      category: this._guessCategory(merchant, items),
      subtotal: totals.subtotal || (items.length > 0 ? itemsSum : 0),
      tax: totals.tax || 0,
      serviceCharge: totals.service || 0,
      discount: totals.discount || 0,
      total: expectedTotal,
      items,
      validation: {
        itemsSum,
        expectedTotal,
        isBalanced,
        discrepancy: items.length > 0 ? (totals.total ? Math.abs(totals.total - itemsSum) : 0) : 0
      }
    };
  }

  _emptyResult(rawText) {
    return {
      rawText,
      merchant: '',
      date: '',
      time: '',
      invoiceNumber: '',
      cashier: '',
      paymentMethod: 'CASH',
      category: 'General',
      subtotal: 0,
      tax: 0,
      serviceCharge: 0,
      discount: 0,
      total: 0,
      items: [],
      validation: { itemsSum: 0, expectedTotal: 0, isBalanced: true, discrepancy: 0 }
    };
  }

  _extractMerchant(lines) {
    // The merchant is almost always in the first 1-4 lines.
    // Skip lines with dates, receipt headers like "SELAMAT DATANG", wifi, or phone numbers/addresses.
    const skipKeywords = ['SELAMAT', 'DATANG', 'WELCOME', 'STRUK', 'NOTA', 'INVOICE', 'TELP', 'PHONE', 'WIFI', 'PASSWORD', 'NPWP', 'CABANG', 'JL.', 'JALAN', 'POS1', 'POS2', 'CHECK'];
    
    for (let i = 0; i < Math.min(6, lines.length); i++) {
      const line = lines[i].trim();
      const upper = line.toUpperCase();
      
      const isPhoneOrAreaCode = /^\(?\d{2,5}\)?[-.\s]?\d*$/.test(line);
      const isDate = /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/.test(line);
      const shouldSkip = skipKeywords.some(kw => upper.includes(kw)) ||
        /^\d+$/.test(line) ||
        isPhoneOrAreaCode ||
        isDate ||
        line.length < 3;

      if (!shouldSkip) {
        // If line is a website like www.btdelivery.com -> turn into clean brand name
        if (/^www\.[a-z0-9-]+\.[a-z]+/i.test(line)) {
          const domain = line.replace(/^www\./i, '').split('.')[0];
          return domain.toUpperCase();
        }
        // Clean special characters often picked up by OCR on logo banners
        return line.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9\s.&'-]+$/g, '').trim();
      }
    }
    return lines[0] || 'Unknown Merchant';
  }

  _extractDate(lines) {
    let date = '';
    let time = '';

    // Matches DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD.MM.YY
    const dateRegex = /\b(\d{1,2})[-/.]([01]?\d|JAN|FEB|MAR|APR|MEI|MAY|JUN|JUL|AGS|AGU|AUG|SEP|OKT|OCT|NOV|DES|DEC)[-/.](20\d{2}|\d{2})\b/i;
    // Matches DD Month YY/YYYY e.g. "10 May 19" or "10 May 2019" or "25 Okt 2024"
    const textDateRegex = /\b(\d{1,2})\s+(JAN|FEB|MAR|APR|MEI|MAY|JUN|JUL|AGS|AGU|AUG|SEP|OKT|OCT|NOV|DES|DEC|JANUARI|FEBRUARI|MARET|APRIL|JUNI|JULI|AGUSTUS|SEPTEMBER|OKTOBER|NOVEMBER|DESEMBER)\s+(\d{2,4})\b/i;
    // Matches HH:mm or HH:mm:ss
    const timeRegex = /\b([01]?\d|2[0-3]):([0-5]\d)(:([0-5]\d))?\b/;

    for (const line of lines) {
      if (!date) {
        const dMatch = line.match(dateRegex);
        if (dMatch) {
          date = this._normalizeDate(dMatch[0]);
        } else {
          const tm = line.match(textDateRegex);
          if (tm) {
            date = this._normalizeTextDate(tm[1], tm[2], tm[3]);
          }
        }
      }
      if (!time) {
        const tMatch = line.match(timeRegex);
        if (tMatch) {
          time = tMatch[0];
        }
      }
      if (date && time) break;
    }

    return {
      date: date || new Date().toISOString().split('T')[0],
      time: time || ''
    };
  }

  _normalizeTextDate(day, monthStr, yearStr) {
    let y = yearStr;
    if (y.length === 2) {
      y = (parseInt(y, 10) > 70 ? '19' : '20') + y;
    }
    const months = {
      JAN: '01', JANUARI: '01',
      FEB: '02', FEBRUARI: '02',
      MAR: '03', MARET: '03',
      APR: '04', APRIL: '04',
      MEI: '05', MAY: '05',
      JUN: '06', JUNI: '06',
      JUL: '07', JULI: '07',
      AGS: '08', AGU: '08', AUG: '08', AGUSTUS: '08',
      SEP: '09', SEPTEMBER: '09',
      OKT: '10', OCT: '10', OKTOBER: '10',
      NOV: '11', NOVEMBER: '11',
      DES: '12', DEC: '12', DESEMBER: '12'
    };
    const m = months[monthStr.toUpperCase()] || '01';
    const d = day.padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  _normalizeDate(raw) {
    // Normalizes separators to standard YYYY-MM-DD if numeric
    const parts = raw.split(/[-/.]/);
    if (parts.length === 3) {
      let [d, m, y] = parts;
      if (y.length === 2) y = '20' + y;
      
      const months = {
        JAN: '01', FEB: '02', MAR: '03', APR: '04', MEI: '05', MAY: '05',
        JUN: '06', JUL: '07', AGS: '08', AGU: '08', AUG: '08', SEP: '09',
        OKT: '10', OCT: '10', NOV: '11', DES: '12', DEC: '12'
      };

      if (isNaN(m) && months[m.toUpperCase()]) {
        m = months[m.toUpperCase()];
      } else if (!isNaN(m)) {
        m = m.padStart(2, '0');
      }
      d = d.padStart(2, '0');

      // Check if first part was year (YYYY-MM-DD)
      if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      }
      return `${y}-${m}-${d}`;
    }
    return raw;
  }

  _extractInvoiceNumber(lines) {
    const patterns = [
      /(?:CHECK|CHECK\s*NO|CHEQUE)[.\s:#-]+([A-Za-z0-9\/-]{3,35})/i,
      /(?:NO\.?\s*TRANSAKSI|NO\.?\s*STRUK|NO\.?\s*FAKTUR|NO\.?\s*INVOICE|NO\.?\s*NOTA)[:\s]+([A-Za-z0-9\/-]{3,35})/i,
      /(?:STRUK|NOTA|BON|INVOICE|INV|TRANSACTION|RECEIPT|BILL|ORDER)[.\s:#-]+([A-Za-z0-9\/-]{4,30})/i,
      /(?:NO|NOMOR)[.\s:#-]+([A-Za-z0-9\/-]{4,30})/i,
      /#\s*([A-Za-z0-9\/-]{4,25})/i
    ];

    for (const line of lines) {
      for (const pat of patterns) {
        const match = line.match(pat);
        if (match && match[1]) {
          const val = match[1].trim();
          const upperVal = val.toUpperCase();
          if (upperVal !== 'TRANSAKSI' && upperVal !== 'STRUK' && upperVal !== 'NOTA' && !/^\d{2}[-/]\d{2}/.test(val)) {
            return val;
          }
        }
      }
    }
    return '';
  }

  _extractCashier(lines) {
    const cashierPattern = /(?:KASIR|CASHIER|OPERATOR|USER|PETUGAS)[:\s]+([A-Za-z0-9\s]{2,25})/i;
    for (const line of lines) {
      const match = line.match(cashierPattern);
      if (match && match[1]) {
        return match[1].trim();
      }
      // Matches pattern like "1 POS1 1506551 WINDA APRIANI P"
      const posMatch = line.match(/\bPOS\d+\s+\d+\s+([A-Za-z\s]{3,25})/i);
      if (posMatch && posMatch[1]) {
        return posMatch[1].trim();
      }
    }
    return '';
  }

  _extractPaymentMethod(lines) {
    const upperText = lines.join(' ').toUpperCase();
    if (upperText.includes('QRIS')) return 'QRIS';
    if (upperText.includes('BCA')) return 'Debit/Credit BCA';
    if (upperText.includes('MANDIRI')) return 'Mandiri';
    if (upperText.includes('DEBIT') || upperText.includes('KREDIT')) return 'Debit/Credit Card';
    if (upperText.includes('GOPAY')) return 'GoPay';
    if (upperText.includes('SHOPEEPAY') || upperText.includes('SHOPEE PAY')) return 'ShopeePay';
    if (upperText.includes('OVO')) return 'OVO';
    if (upperText.includes('TUNAI') || upperText.includes('CASH')) return 'TUNAI (Cash)';
    return 'CASH';
  }

  _cleanAmount(str) {
    if (!str) return 0;
    // Strip "Rp", "IDR", dots/commas
    // Indonesian format: 15.000,00 or 15.000 or 15000
    let clean = str.replace(/[RrpP\s$IDRidr]/g, '');
    
    // If format is like 12.500,00 -> remove dot, replace comma with dot
    if (/\d+\.\d{3},\d{2}/.test(clean)) {
      clean = clean.replace(/\./g, '').replace(',', '.');
    } else if (/\d+,\d{3}\.\d{2}/.test(clean)) {
      clean = clean.replace(/,/g, '');
    } else if (/\d+\.\d{3}$/.test(clean)) {
      // 15.000 -> 15000
      clean = clean.replace(/\./g, '');
    } else if (/\d+,\d{3}$/.test(clean)) {
      // 15,000 -> 15000
      clean = clean.replace(/,/g, '');
    } else {
      // replace commas with nothing
      clean = clean.replace(/,/g, '');
    }

    const num = parseFloat(clean);
    return isNaN(num) ? 0 : Math.round(num);
  }

  _extractFinancials(lines) {
    const result = {
      subtotal: 0,
      tax: 0,
      service: 0,
      discount: 0,
      total: 0
    };

    const findAmountInLine = (line) => {
      // Find trailing number pattern: e.g. 15.000 or 150,000 or Rp 50.000
      const match = line.match(/(?:Rp\.?\s*)?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?|\d+)\s*$/i);
      return match ? this._cleanAmount(match[1]) : 0;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const upper = line.toUpperCase();

      if (/^(?:GRAND\s*TOTAL|TOTAL\s*AKHIR|TOTAL\s*BAYAR|TOTAL\s*BELANJA|TOTAL)\b/i.test(upper) &&
          !upper.includes('SUB') && !upper.includes('ITEM') && !upper.includes('QTY')) {
        const amt = findAmountInLine(line);
        if (amt > 0 && amt > result.total) {
          result.total = amt;
        }
      } else if (/^(?:SUB\s*TOTAL|SUBTOTAL|JUMLAH\s*HARGA)\b/i.test(upper)) {
        const amt = findAmountInLine(line);
        if (amt > 0) result.subtotal = amt;
      } else if (/\b(?:PAYMENT|BAYAR|DITERIMA)\b/i.test(upper) && !upper.includes('METODE') && !upper.includes('METHOD')) {
        const amt = findAmountInLine(line);
        if (amt > 0) result.payment = amt;
      } else if (/\b(?:PPN|PB1|TAX|PAJAK)\b/i.test(upper)) {
        const amt = findAmountInLine(line);
        if (amt > 0) result.tax = amt;
      } else if (/\b(?:SERVICE|LAYANAN)\b/i.test(upper)) {
        const amt = findAmountInLine(line);
        if (amt > 0) result.service = amt;
      } else if (/\b(?:DISKON|DISCOUNT|HEMAT|POTONGAN)\b/i.test(upper)) {
        const amt = findAmountInLine(line);
        if (amt > 0) result.discount = amt;
      }
    }

    // If total was missing or lower than subtotal due to OCR truncation
    if (result.total === 0 || (result.subtotal > 0 && result.total < result.subtotal)) {
      result.total = result.subtotal || result.payment || result.total;
    }
    if (result.subtotal === 0 && result.total > 0) {
      result.subtotal = result.total;
    }

    return result;

    return result;
  }

  _extractLineItems(lines, totals = {}) {
    const items = [];
    
    // Stop keywords where line items end
    const stopKeywords = [
      'SUBTOTAL', 'SUB TOTAL', 'TOTAL', 'HARGA JUAL', 'PPN', 'TAX', 'PAJAK', 
      'SERVICE', 'DISKON', 'DISCOUNT', 'TUNAI', 'CASH', 'KEMBALI', 'CHANGE', 
      'KARTU', 'TERIMA KASIH', 'THANK YOU', 'BARANG YG SUDAH DIBELI'
    ];

    let started = false;

    for (let i = 0; i < lines.length; i++) {
      let rawLine = lines[i].trim();
      // Clean leading non-alphanumeric characters (e.g. '{1', '[1', '(1', '| 1', '~ 1')
      let line = rawLine.replace(/^[^\w\d]+/, '').trim();
      // If leading digit 1 was misread as lowercase 'l' or uppercase 'I' or '|' before letters
      line = line.replace(/^[lI|]\s+([A-Za-z])/i, '1 $1');
      const upper = line.toUpperCase();

      // Check if we hit footer totals
      if (started && stopKeywords.some(kw => upper.startsWith(kw) || upper.includes(` ${kw}`))) {
        break;
      }

      // Pattern A: Multi-line receipt (common in Indomaret / Alfamart / Cafes):
      // Line i: "ITEM NAME"
      // Line i+1: "2 x 15.000      30.000" or "2 X 15000 30000"
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim().replace(/^[^\w\d]+/, '');
        const multiQtyMatch = nextLine.match(/^(\d+(?:[.,]\d+)?)\s*[xX*]\s*([0-9.,]+)\s+([0-9.,]+)$/);
        if (multiQtyMatch) {
          const qty = parseFloat(multiQtyMatch[1].replace(',', '.'));
          const unitPrice = this._cleanAmount(multiQtyMatch[2]);
          const lineTotal = this._cleanAmount(multiQtyMatch[3]);

          if (lineTotal > 0 && line.length > 1 && !this._isHeaderOrMetadata(line)) {
            items.push({
              description: this._cleanItemName(line),
              qty: qty || 1,
              unitPrice: unitPrice || (lineTotal / (qty || 1)),
              total: lineTotal
            });
            started = true;
            i++; // skip next line
            continue;
          }
        }
      }

      // Pattern B: Single line: "ITEM NAME    1    15.000" or "ITEM NAME  2 x 15000  30000"
      const singleQtyMatch = line.match(/^(.+?)\s+(\d+)\s*[xX*]\s*([0-9.,]+)\s+([0-9.,]+)$/);
      if (singleQtyMatch) {
        const desc = singleQtyMatch[1].trim();
        const qty = parseInt(singleQtyMatch[2], 10);
        const unitPrice = this._cleanAmount(singleQtyMatch[3]);
        const lineTotal = this._cleanAmount(singleQtyMatch[4]);

        if (desc.length > 1 && !this._isHeaderOrMetadata(desc)) {
          items.push({
            description: this._cleanItemName(desc),
            qty: qty || 1,
            unitPrice: unitPrice,
            total: lineTotal
          });
          started = true;
          continue;
        }
      }

      // Pattern C: "1 ITEM NAME   15.000" (Leading quantity, item name, line total)
      const leadingQtyMatch = line.match(/^(\d{1,3})\s+([A-Za-z0-9/&.,'()\s-]{2,40}?)\s+([0-9.,]{3,})$/);
      if (leadingQtyMatch) {
        const qty = parseInt(leadingQtyMatch[1], 10);
        const desc = this._cleanItemName(leadingQtyMatch[2]);
        const lineTotal = this._cleanAmount(leadingQtyMatch[3]);

        // Guard against summary totals misread as items (e.g. "i 3 43.500" or single letter lines)
        const currentSum = items.reduce((s, it) => s + it.total, 0);
        const isLikelySubtotal = items.length > 0 && Math.abs(lineTotal - currentSum) <= 50;
        const isGarbageDesc = desc.length < 3 || /^[a-z]\s*\d+$/i.test(desc) || /^[^a-zA-Z]+$/.test(desc);

        if (lineTotal > 100 && !isGarbageDesc && !isLikelySubtotal && !this._isHeaderOrMetadata(desc) && !stopKeywords.some(kw => desc.toUpperCase().includes(kw))) {
          items.push({
            description: desc,
            qty: qty || 1,
            unitPrice: Math.round(lineTotal / (qty || 1)),
            total: lineTotal
          });
          started = true;
          continue;
        } else if (isLikelySubtotal && !totals.subtotal) {
          // It's the subtotal line!
          totals.subtotal = lineTotal;
          if (!totals.total) totals.total = lineTotal;
        }
      }

      // Pattern D: "ITEM NAME   1   15.000" (Qty + Total)
      const qtyPriceMatch = line.match(/^(.+?)\s+(\d+)\s+([0-9.,]{3,})$/);
      if (qtyPriceMatch) {
        const desc = this._cleanItemName(qtyPriceMatch[1]);
        const qty = parseInt(qtyPriceMatch[2], 10);
        const lineTotal = this._cleanAmount(qtyPriceMatch[3]);

        const currentSum = items.reduce((s, it) => s + it.total, 0);
        const isLikelySubtotal = items.length > 0 && Math.abs(lineTotal - currentSum) <= 50;
        const isGarbageDesc = desc.length < 3 || /^[a-z]\s*\d+$/i.test(desc) || /^[^a-zA-Z]+$/.test(desc);

        if (lineTotal > 100 && !isGarbageDesc && !isLikelySubtotal && !this._isHeaderOrMetadata(desc)) {
          items.push({
            description: desc,
            qty: qty || 1,
            unitPrice: Math.round(lineTotal / (qty || 1)),
            total: lineTotal
          });
          started = true;
          continue;
        } else if (isLikelySubtotal && !totals.subtotal) {
          totals.subtotal = lineTotal;
          if (!totals.total) totals.total = lineTotal;
        }
      }

      // Pattern E: "ITEM NAME   15.000" (implied qty = 1)
      const simplePriceMatch = line.match(/^([A-Za-z0-9\s/&.-]{2,35})\s+([0-9.,]{4,})$/);
      if (simplePriceMatch) {
        const desc = this._cleanItemName(simplePriceMatch[1]);
        const lineTotal = this._cleanAmount(simplePriceMatch[2]);

        const currentSum = items.reduce((s, it) => s + it.total, 0);
        const isLikelySubtotal = items.length > 0 && Math.abs(lineTotal - currentSum) <= 50;
        const isGarbageDesc = desc.length < 3 || /^[a-z]\s*\d+$/i.test(desc) || /^[^a-zA-Z]+$/.test(desc);

        if (lineTotal > 100 && !isGarbageDesc && !isLikelySubtotal && !this._isHeaderOrMetadata(desc) && !stopKeywords.some(kw => desc.toUpperCase().includes(kw))) {
          items.push({
            description: desc,
            qty: 1,
            unitPrice: lineTotal,
            total: lineTotal
          });
          started = true;
          continue;
        } else if (isLikelySubtotal && !totals.subtotal) {
          totals.subtotal = lineTotal;
          if (!totals.total) totals.total = lineTotal;
        }
      }
    }

    return items;
  }

  _isHeaderOrMetadata(text) {
    const upper = text.toUpperCase();
    return (
      upper.includes('JL.') || upper.includes('JALAN') || upper.includes('TELP') ||
      upper.includes('STRUK') || upper.includes('INVOICE') || upper.includes('KASIR') ||
      upper.includes('TANGGAL') || upper.includes('DATE') || upper.includes('WAKTU') ||
      upper.includes('NPWP') || upper.includes('KODE') || upper.includes('ITEM') ||
      upper.includes('HARGA') || upper.includes('DESKRIPSI') || upper.includes('QTY')
    );
  }

  _cleanItemName(name) {
    return name
      .replace(/^[*\s.\-~|{}[\]()]+/g, '')
      .replace(/[*\s.\-~|{}[\]()]+$/g, '')
      .replace(/\s+[a-z]{1,2}$/i, '') // strip trailing 1-2 letter OCR noise/speckle
      .replace(/\s+/g, ' ')
      .trim();
  }

  _guessCategory(merchant, items) {
    const m = (merchant || '').toUpperCase();
    const itemNames = items.map(i => i.description.toUpperCase()).join(' ');

    if (m.includes('INDOMARET') || m.includes('ALFAMART') || m.includes('SUPERINDO') || m.includes('MART')) {
      return 'Groceries / Convenience';
    }
    if (m.includes('KOPI') || m.includes('CAFE') || m.includes('COFFEE') || m.includes('RESTO') || m.includes('WARUNG') ||
        itemNames.includes('KOPI') || itemNames.includes('NASI') || itemNames.includes('TEA') || itemNames.includes('BURGER')) {
      return 'Food & Beverage';
    }
    if (m.includes('APOTEK') || m.includes('FARMA') || itemNames.includes('OBAT') || itemNames.includes('PARACETAMOL')) {
      return 'Healthcare / Pharmacy';
    }
    if (m.includes('SPBU') || m.includes('PERTAMINA') || itemNames.includes('PERTALITE') || itemNames.includes('PERTAMAX')) {
      return 'Fuel / Transport';
    }
    if (m.includes('FASHION') || m.includes('ZARA') || m.includes('UNIQLO') || m.includes('H&M')) {
      return 'Apparel & Clothing';
    }
    return 'Retail / Office Supplies';
  }
}

module.exports = ReceiptParser;
