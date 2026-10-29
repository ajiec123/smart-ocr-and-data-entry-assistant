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
    const isToll = this._isTollReceipt(lines, rawText, merchant);
    const dateInfo = this._extractDate(lines);
    const invoiceNo = this._extractInvoiceNumber(lines);
    const cashier = this._extractCashier(lines);
    const paymentMethod = this._extractPaymentMethod(lines);
    
    let totals;
    let items;
    let category;
    let detectedProfile;

    if (isToll) {
      detectedProfile = 'toll';
      category = 'Transport & Toll';
      const tollRes = this._extractTollFinancialsAndItems(lines, rawText);
      totals = tollRes.totals;
      items = tollRes.items;
    } else {
      // General & Retail Financial extraction
      totals = this._extractFinancials(lines);
      // Line items table
      items = this._extractLineItems(lines, totals);
      // Category & Profile detection
      category = this._guessCategory(merchant, items, rawText);
      detectedProfile = this._detectProfile(rawText, merchant, category);
    }

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
      category,
      detectedProfile,
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
    // Priority 1: Check for nationwide toll operators (Jasa Marga, CMNP, Hutama Karya, Astra Tol)
    for (const line of lines) {
      const upper = line.toUpperCase();
      if (upper.includes('JASAMARGA') || upper.includes('JASA MARGA') || upper.includes('14080') || upper.includes('INDONESIA HIGHWAY')) {
        if (upper.includes('TOLLROAD OPERATOR') || upper.includes('JMTO') || upper.includes('JMTM')) {
          return 'PT JASAMARGA TOLLROAD OPERATOR';
        }
        return 'PT JASA MARGA (PERSERO) TBK';
      }
      if (upper.includes('CITRA MARGA') || upper.includes('CMNP')) {
        return 'PT CITRA MARGA NUSAPHALA PERSADA TBK';
      }
      if (upper.includes('HUTAMA KARYA')) {
        return 'PT HUTAMA KARYA (PERSERO)';
      }
      if (upper.includes('ASTRA') && upper.includes('TOL')) {
        return 'ASTRA INFRA TOLL ROAD';
      }
    }

    // Secondary toll check: if receipt contains E-TOLL or GOL- and toll keywords
    const hasTollKeywords = lines.some(l => {
      const u = l.toUpperCase();
      return u.includes('E-TOLL') || u.includes('ETOLL') || /\bGOL\s*[-0-9IV]/i.test(u);
    }) && lines.some(l => {
      const u = l.toUpperCase();
      return u.includes('TOL') || u.includes('GERBANG') || u.includes('SALDO') || u.includes('SERI');
    });

    if (hasTollKeywords) {
      return 'PT JASA MARGA (PERSERO) TBK';
    }

    // The merchant is almost always in the first 1-4 lines.
    // Skip lines with dates, receipt headers like "SELAMAT DATANG", wifi, support hotlines, or phone numbers/addresses.
    const skipKeywords = [
      'SELAMAT', 'DATANG', 'WELCOME', 'STRUK', 'NOTA', 'INVOICE', 'TELP', 'PHONE',
      'WIFI', 'PASSWORD', 'NPWP', 'CABANG', 'JL.', 'JALAN', 'POS1', 'POS2', 'CHECK',
      'INFO', 'HOTLINE', 'CALL', 'CALL CENTER', 'SERI', 'RESI', 'SALDO', 'S/N'
    ];
    
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
      /(?:NO\.?\s*SERI|SERI|NO\.?\s*RESI|RESI|NO\.?\s*TRANSAKSI|NO\.?\s*STRUK|NO\.?\s*FAKTUR|NO\.?\s*INVOICE|NO\.?\s*NOTA)[:\s]+([A-Za-z0-9\/-]{3,35})/i,
      /(?:STRUK|NOTA|BON|INVOICE|INV|TRANSACTION|RECEIPT|BILL|ORDER)[.\s:#-]+([A-Za-z0-9\/-]{4,30})/i,
      /(?:NO|NOMOR)[.\s:#-]+(?:SERI\s*[:\s]*|RESI\s*[:\s]*)?([A-Za-z0-9\/-]{4,30})/i,
      /#\s*([A-Za-z0-9\/-]{4,25})/i
    ];

    const labelStop = ['TRANSAKSI', 'STRUK', 'NOTA', 'SERI', 'RESI', 'INVOICE', 'CHECK', 'NOMOR', 'NO'];

    for (const line of lines) {
      for (const pat of patterns) {
        const match = line.match(pat);
        if (match && match[1]) {
          let val = match[1].trim();
          // If val contains space (e.g. "107365 152083/150935" on Jasa Marga receipts), take primary serial number
          const parts = val.split(/\s+/);
          if (parts.length > 1 && /^\d+$/.test(parts[0])) {
            val = parts[0];
          }
          const upperVal = val.toUpperCase();
          if (!labelStop.includes(upperVal) && !/^\d{2}[-/]\d{2}/.test(val)) {
            return val;
          }
        }
      }
    }
    return '';
  }

  _extractTollDetails(lines) {
    let gate = '';
    let ruas = '';
    let gol = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const upper = line.toUpperCase();

      const gateMatch = line.match(/(?:GERBANG\s*TOL|GERBANG\s*KELUAR|GERBANG\s*MASUK|GERBANG|GT)[:\s]+([A-Za-z0-9\s/-]{2,30})/i);
      if (gateMatch && !gate) gate = gateMatch[1].trim();

      const ruasMatch = line.match(/(?:RUAS\s*TOL|RUAS|CABANG)[:\s]+([A-Za-z0-9\s/-]{2,30})/i);
      if (ruasMatch && !ruas) ruas = ruasMatch[1].trim();

      // Support GOL-1, GOL - 1, GOL 1, GOL I, GOL: 1, GOLONGAN 1
      const golMatch = line.match(/(?:GOLONGAN|GOL)[\s:-]*([0-9IV]+)/i);
      if (golMatch && !gol) gol = golMatch[1].trim();

      // Check if line is the gate name directly above the date/time line (e.g. "CIMANGGIS3" or "CIBUBUR UTAMA")
      if (!gate) {
        const trimmed = line.trim();
        const isGateCandidate = /^[A-Za-z0-9\s/-]{3,25}$/.test(trimmed) &&
          !upper.includes('JASAMARGA') &&
          !upper.includes('INFO') &&
          !upper.includes('HIGHWAY') &&
          !upper.includes('STRUK') &&
          !upper.includes('NOTA') &&
          !upper.includes('SERI') &&
          !upper.includes('GOL') &&
          !upper.includes('SALDO') &&
          !upper.includes('TERIMA') &&
          !/\d{2}[-/.]\d{2}[-/.]\d{2,4}/.test(trimmed);

        if (isGateCandidate && i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          if (/\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/.test(nextLine) || /\d{1,2}:\d{2}/.test(nextLine)) {
            gate = trimmed;
          }
        }
      }
    }

    // Format gate nicely if concatenated (e.g. "CIMANGGIS3" -> "CIMANGGIS 3")
    if (gate && /^[A-Za-z]+[0-9]+$/.test(gate)) {
      gate = gate.replace(/([A-Za-z]+)([0-9]+)/, '$1 $2');
    }

    return { gate, ruas, gol };
  }

  _isTollReceipt(lines, rawText, merchant = '') {
    const textUpper = (rawText + ' ' + (merchant || '')).toUpperCase();
    return (
      textUpper.includes('JASAMARGA') ||
      textUpper.includes('JASA MARGA') ||
      textUpper.includes('INFO TOL') ||
      textUpper.includes('14080') ||
      textUpper.includes('INDONESIA HIGHWAY') ||
      textUpper.includes('GERBANG TOL') ||
      textUpper.includes('TARIF TOL') ||
      textUpper.includes('BEA TOL') ||
      textUpper.includes('CITRA MARGA') ||
      textUpper.includes('ASTRA TOL') ||
      textUpper.includes('JMTO') ||
      textUpper.includes('JMTM') ||
      textUpper.includes('E-TOLL') ||
      textUpper.includes('ETOLL') ||
      /\bGOL\s*[-0-9IV]/i.test(textUpper)
    );
  }

  _extractTollFinancialsAndItems(lines, rawText) {
    const toll = this._extractTollDetails(lines);
    let tariff = 0;

    // Helper to extract amount from a line or token
    const extractAmount = (str, requireCurrency = false) => {
      // Skip fractions, lane/shift counters (e.g. 152083/150935 or 02/08/02)
      if (str.includes('/')) return 0;

      if (requireCurrency) {
        const match = str.match(/(?:Rp\.?\s+)(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?|\d{4,6})\b/i);
        return match ? this._cleanAmount(match[1]) : 0;
      }

      const match = str.match(/(?:Rp\.?\s*)?(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?|\d{4,6})\b/i);
      return match ? this._cleanAmount(match[1]) : 0;
    };

    // Priority 1: Check lines explicitly labeled with TARIF, BEA TOL, or GOL
    for (const line of lines) {
      const upper = line.toUpperCase();
      if (upper.includes('SALDO')) continue; // Skip card balance
      if (upper.includes('INFO') || upper.includes('14080') || upper.includes('HOTLINE')) continue;
      if (upper.includes('SERI') || upper.includes('RESI')) continue;
      if (upper.includes('S/N') || upper.includes('SN:')) continue;

      if (/^(?:TARIF\s*TOL|BEA\s*TOL|BIAYA\s*TOL|TARIF\s*GOL|TARIF)\b/i.test(upper) ||
          /(?:TARIF\s*TOL|BEA\s*TOL)[:\s]+(?:RP\.?\s*)?(\d{1,3}(?:[.,]\d{3})*|\d+)/i.test(upper) ||
          /\bGOL\s*[-0-9IV]/i.test(upper)) {
        const amt = extractAmount(line);
        if (amt >= 1000 && amt <= 500000) {
          tariff = amt;
          break;
        }
      }
    }

    // Priority 2: Check any line with explicit "Rp" prefix (e.g. "Rp 7.000")
    if (tariff === 0) {
      for (const line of lines) {
        const upper = line.toUpperCase();
        if (upper.includes('SALDO')) continue;
        if (upper.includes('INFO') || upper.includes('14080') || upper.includes('HOTLINE')) continue;
        if (upper.includes('SERI') || upper.includes('RESI')) continue;
        if (upper.includes('S/N') || upper.includes('SN:')) continue;
        if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/.test(line)) continue; // Date line
        if (/^\d{1,2}:\d{2}/.test(line)) continue; // Time line

        const amt = extractAmount(line, true);
        if (amt >= 1000 && amt <= 500000) {
          tariff = amt;
          break;
        }
      }
    }

    // Priority 3: Scan standalone currency numbers without "/" that fit standard toll fare range
    if (tariff === 0) {
      for (const line of lines) {
        const upper = line.toUpperCase();
        if (upper.includes('SALDO')) continue;
        if (upper.includes('INFO') || upper.includes('14080') || upper.includes('HOTLINE')) continue;
        if (upper.includes('SERI') || upper.includes('RESI')) continue;
        if (upper.includes('S/N') || upper.includes('SN:')) continue;
        if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/.test(line)) continue;
        if (/^\d{1,2}:\d{2}/.test(line)) continue;

        const amt = extractAmount(line, false);
        if (amt >= 1000 && amt <= 250000) {
          tariff = amt;
          break;
        }
      }
    }

    // Build descriptive line item for toll transaction
    let descParts = ['Tarif Tol'];
    if (toll.gate) {
      descParts.push(toll.gate);
    } else if (toll.ruas) {
      descParts.push(toll.ruas);
    }
    if (toll.gol) {
      descParts.push(`(Golongan ${toll.gol})`);
    }

    const items = [];
    if (tariff > 0) {
      items.push({
        description: descParts.join(' ').trim(),
        qty: 1,
        unitPrice: tariff,
        total: tariff
      });
    }

    const totals = {
      subtotal: tariff,
      tax: 0,
      service: 0,
      discount: 0,
      total: tariff
    };

    return { totals, items };
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

    // Dedicated Indonesian Toll card detection (E-Toll, Flazz, e-Money, Brizzi, TapCash)
    if (upperText.includes('E-TOLL') || upperText.includes('ETOLL') || upperText.includes('E - TOLL')) {
      if (upperText.includes('BCA') || upperText.includes('FLAZZ')) return 'E-Toll BCA (Flazz)';
      if (upperText.includes('MANDIRI') || upperText.includes('E-MONEY') || upperText.includes('EMONEY')) return 'E-Toll Mandiri (e-Money)';
      if (upperText.includes('BRI') || upperText.includes('BRIZZI')) return 'E-Toll BRI (Brizzi)';
      if (upperText.includes('BNI') || upperText.includes('TAPCASH')) return 'E-Toll BNI (TapCash)';
      if (upperText.includes('DKI') || upperText.includes('JAKCARD')) return 'E-Toll JakCard';
      return 'E-Toll';
    }

    if (upperText.includes('FLAZZ')) return 'Flazz BCA';
    if (upperText.includes('E-MONEY') || upperText.includes('EMONEY')) return 'E-Money Mandiri';
    if (upperText.includes('BRIZZI')) return 'Brizzi BRI';
    if (upperText.includes('TAPCASH')) return 'TapCash BNI';
    if (upperText.includes('LET IT FLO') || upperText.includes('FLO')) return 'Let It Flo';
    if (upperText.includes('QRIS')) return 'QRIS';
    if (upperText.includes('BCA')) return 'Debit/Credit BCA';
    if (upperText.includes('MANDIRI')) return 'Mandiri';
    if (upperText.includes('DEBIT') || upperText.includes('KREDIT')) return 'Debit/Credit Card';
    if (upperText.includes('GOPAY')) return 'GoPay';
    if (upperText.includes('SHOPEEPAY') || upperText.includes('SHOPEE PAY')) return 'ShopeePay';
    if (upperText.includes('OVO')) return 'OVO';
    if (upperText.includes('TUNAI') || upperText.includes('CASH')) return 'TUNAI (Cash)';

    // If toll receipt is detected, payment is electronically processed (never cash)
    const isToll = upperText.includes('JASAMARGA') ||
      upperText.includes('INFO TOL') ||
      upperText.includes('14080') ||
      upperText.includes('GERBANG') ||
      /\bGOL\s*[-0-9IV]/i.test(upperText);

    if (isToll) return 'E-Toll';

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

      // Skip remaining card balance lines (e.g. SISA SALDO / SALDO AKHIR)
      if (upper.includes('SALDO')) {
        continue;
      }

      // Skip hotlines, serial numbers, invoice headers, card numbers
      if (upper.includes('INFO') || upper.includes('14080') || upper.includes('HOTLINE') || upper.includes('SERI') || upper.includes('S/N') || upper.includes('SN:')) {
        continue;
      }

      // Check for Indonesian toll tariffs (TARIF TOL, BEA TOL, TARIF, or GOL-1 E-TOLL BCA Rp 7.000)
      const isTollTariffLine = (
        /^(?:TARIF\s*TOL|BEA\s*TOL|BIAYA\s*TOL|TARIF\s*GOL|TARIF)\b/i.test(upper) ||
        /(?:TARIF\s*TOL|BEA\s*TOL)[:\s]+(?:RP\.?\s*)?(\d{1,3}(?:[.,]\d{3})*|\d+)/i.test(upper) ||
        (/\bGOL\s*[-0-9IV]/i.test(upper) && (upper.includes('RP') || /\d{1,3}[.,]\d{3}/.test(line)))
      );

      if (isTollTariffLine) {
        const amt = findAmountInLine(line);
        if (amt > 0) {
          result.total = amt;
          result.subtotal = amt;
        }
      } else if (/^(?:GRAND\s*TOTAL|TOTAL\s*AKHIR|TOTAL\s*BAYAR|TOTAL\s*BELANJA|TOTAL)\b/i.test(upper) &&
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

    // Toll receipt heuristic: If no grocery/retail line items were extracted,
    // check if this receipt is an Indonesian toll receipt and generate a synthetic item.
    if (items.length === 0 && totals.total > 0) {
      const toll = this._extractTollDetails(lines);
      const isToll = lines.some(l => {
        const u = l.toUpperCase();
        return u.includes('JASAMARGA') ||
          u.includes('JASA MARGA') ||
          u.includes('INFO TOL') ||
          u.includes('14080') ||
          u.includes('GERBANG') ||
          u.includes('TARIF TOL') ||
          u.includes('BEA TOL') ||
          u.includes('RUAS') ||
          u.includes('E-TOLL') ||
          u.includes('ETOLL') ||
          /\bGOL\s*[-0-9IV]/i.test(u);
      });

      if (isToll) {
        let descParts = ['Tarif Tol'];
        if (toll.gate) {
          descParts.push(toll.gate);
        } else if (toll.ruas) {
          descParts.push(toll.ruas);
        }
        if (toll.gol) descParts.push(`(Golongan ${toll.gol})`);

        items.push({
          description: descParts.join(' ').trim(),
          qty: 1,
          unitPrice: totals.total,
          total: totals.total
        });
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
      upper.includes('HARGA') || upper.includes('DESKRIPSI') || upper.includes('QTY') ||
      upper.includes('INFO TOL') || upper.includes('INFO') || upper.includes('HOTLINE') ||
      upper.includes('14080') || upper.includes('CALL CENTER') || upper.includes('SERI') ||
      upper.includes('RESI') || upper.includes('SALDO') || upper.includes('S/N') ||
      upper.includes('SN:') || upper.includes('GOL-') || upper.includes('GOLONGAN') ||
      upper.includes('E-TOLL') || upper.includes('ETOLL') || upper.includes('HIGHWAY')
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

  _guessCategory(merchant, items, rawText = '') {
    const textUpper = (rawText + ' ' + (merchant || '')).toUpperCase();
    const itemNames = items.map(i => i.description.toUpperCase()).join(' ');

    if (textUpper.includes('JASAMARGA') ||
        textUpper.includes('JASA MARGA') ||
        textUpper.includes('INFO TOL') ||
        textUpper.includes('14080') ||
        textUpper.includes('GERBANG TOL') ||
        textUpper.includes('TARIF TOL') ||
        textUpper.includes('BEA TOL') ||
        textUpper.includes('E-TOLL') ||
        textUpper.includes('ETOLL') ||
        /\bGOL\s*[-0-9IV]/i.test(textUpper)) {
      return 'Transport & Toll';
    }
    if (textUpper.includes('INDOMARET') || textUpper.includes('ALFAMART') || textUpper.includes('SUPERINDO') || textUpper.includes('MART')) {
      return 'Groceries / Convenience';
    }
    if (textUpper.includes('KOPI') || textUpper.includes('CAFE') || textUpper.includes('COFFEE') || textUpper.includes('RESTO') || textUpper.includes('WARUNG') ||
        itemNames.includes('KOPI') || itemNames.includes('NASI') || itemNames.includes('TEA') || itemNames.includes('BURGER')) {
      return 'Food & Beverage';
    }
    if (textUpper.includes('APOTEK') || textUpper.includes('FARMA') || itemNames.includes('OBAT') || itemNames.includes('PARACETAMOL')) {
      return 'Healthcare / Pharmacy';
    }
    if (textUpper.includes('SPBU') || textUpper.includes('PERTAMINA') || itemNames.includes('PERTALITE') || itemNames.includes('PERTAMAX')) {
      return 'Fuel / Transport';
    }
    if (textUpper.includes('FASHION') || textUpper.includes('ZARA') || textUpper.includes('UNIQLO') || textUpper.includes('H&M')) {
      return 'Apparel & Clothing';
    }
    return 'Retail / Office Supplies';
  }

  _detectProfile(rawText = '', merchant = '', category = '') {
    const textUpper = (rawText + ' ' + merchant + ' ' + category).toUpperCase();

    if (textUpper.includes('JASAMARGA') ||
        textUpper.includes('JASA MARGA') ||
        textUpper.includes('INFO TOL') ||
        textUpper.includes('14080') ||
        textUpper.includes('GERBANG TOL') ||
        textUpper.includes('TARIF TOL') ||
        textUpper.includes('BEA TOL') ||
        textUpper.includes('CITRA MARGA') ||
        textUpper.includes('ASTRA TOL') ||
        textUpper.includes('JMTO') ||
        textUpper.includes('E-TOLL') ||
        textUpper.includes('ETOLL') ||
        /\bGOL\s*[-0-9IV]/i.test(textUpper)) {
      return 'toll';
    }

    if (textUpper.includes('INDOMARET') || textUpper.includes('ALFAMART') || textUpper.includes('SUPERINDO') || textUpper.includes('MINIMARKET')) {
      return 'retail';
    }

    if (textUpper.includes('KOPI') || textUpper.includes('CAFE') || textUpper.includes('RESTO') || textUpper.includes('WARUNG') || textUpper.includes('RESTORAN')) {
      return 'fnb';
    }

    if (textUpper.includes('APOTEK') || textUpper.includes('FARMASI') || textUpper.includes('OBAT') || textUpper.includes('PHARMACY')) {
      return 'pharmacy';
    }

    return 'auto';
  }
}

module.exports = ReceiptParser;
