const ExcelJS = require('exceljs');
const path = require('path');

class ExcelExporter {
  /**
   * Export a single parsed receipt to an Excel file
   * @param {Object} receiptData - Parsed receipt object
   * @param {string} outputPath - Path to save the .xlsx file
   */
  async exportSingleReceipt(receiptData, outputPath) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Smart OCR Assistant';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Receipt Details', {
      views: [{ showGridLines: true }],
      pageSetup: { paperSize: 9, orientation: 'portrait' }
    });

    // Color definitions based on DESIGN.md
    const SLATE_DARK = '1E293B';
    const SLATE_LIGHT = 'F8FAFC';
    const SLATE_BORDER = 'E2E8F0';
    const EMERALD = '059669';

    // 1. Title Banner
    sheet.mergeCells('A1:E1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'SMART OCR - TRANSACTION SUMMARY';
    titleCell.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_DARK } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 30;

    // 2. Metadata Section
    const metadata = [
      ['Merchant / Store:', receiptData.merchant || 'N/A', '', 'Date:', receiptData.date || 'N/A'],
      ['Invoice / Struk No:', receiptData.invoiceNumber || 'N/A', '', 'Time:', receiptData.time || 'N/A'],
      ['Payment Method:', receiptData.paymentMethod || 'CASH', '', 'Category:', receiptData.category || 'General'],
      ['Kasir / Operator:', receiptData.cashier || 'N/A', '', 'Verification:', receiptData.validation?.isBalanced ? 'BALANCED' : 'DISCREPANCY']
    ];

    let currentRow = 3;
    metadata.forEach(([lbl1, val1, _, lbl2, val2]) => {
      const row = sheet.getRow(currentRow);
      row.getCell(1).value = lbl1;
      row.getCell(1).font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: '64748B' } };
      row.getCell(2).value = val1;
      row.getCell(2).font = { name: 'Segoe UI', size: 9, bold: false };

      row.getCell(4).value = lbl2;
      row.getCell(4).font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: '64748B' } };
      row.getCell(5).value = val2;
      row.getCell(5).font = { name: 'Segoe UI', size: 9, bold: false };

      if (lbl2 === 'Verification:') {
        row.getCell(5).font = {
          name: 'Segoe UI',
          size: 9,
          bold: true,
          color: { argb: val2 === 'BALANCED' ? EMERALD : 'DC2626' }
        };
      }

      currentRow++;
    });

    currentRow += 1;

    // 3. Line Items Table Header
    const tableHeaderRow = sheet.getRow(currentRow);
    const headers = ['No', 'Item Description', 'Qty', 'Unit Price (IDR)', 'Line Total (IDR)'];
    tableHeaderRow.values = headers;
    tableHeaderRow.height = 24;

    for (let c = 1; c <= 5; c++) {
      const cell = tableHeaderRow.getCell(c);
      cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_DARK } };
      cell.alignment = {
        horizontal: c === 1 || c === 3 ? 'center' : (c >= 4 ? 'right' : 'left'),
        vertical: 'middle'
      };
      cell.border = {
        top: { style: 'thin', color: { argb: SLATE_BORDER } },
        bottom: { style: 'medium', color: { argb: SLATE_DARK } }
      };
    }

    const itemsStartRow = currentRow + 1;
    const items = receiptData.items || [];

    // 4. Line Items Rows
    items.forEach((item, index) => {
      currentRow++;
      const row = sheet.getRow(currentRow);
      row.values = [
        index + 1,
        item.description,
        item.qty || 1,
        item.unitPrice || 0,
        item.total || 0
      ];

      // Formatting
      row.getCell(1).alignment = { horizontal: 'center' };
      row.getCell(3).alignment = { horizontal: 'center' };
      row.getCell(4).numFmt = '"Rp"#,##0';
      row.getCell(5).numFmt = '"Rp"#,##0';
      row.getCell(4).font = { name: 'Consolas', size: 9 };
      row.getCell(5).font = { name: 'Consolas', size: 9, bold: true };

      // Zebra striping
      const bgColor = index % 2 === 1 ? SLATE_LIGHT : 'FFFFFFFF';
      for (let c = 1; c <= 5; c++) {
        row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        row.getCell(c).border = {
          bottom: { style: 'thin', color: { argb: SLATE_BORDER } }
        };
      }
    });

    const itemsEndRow = currentRow;

    // 5. Financial Summary Box
    currentRow += 2;
    const summaryItems = [
      ['Subtotal', receiptData.subtotal || 0],
      ['Tax / PPN', receiptData.tax || 0],
      ['Service Charge', receiptData.serviceCharge || 0],
      ['Discount', -(receiptData.discount || 0)],
      ['Grand Total', receiptData.total || 0]
    ];

    summaryItems.forEach(([label, value], idx) => {
      const isGrandTotal = idx === summaryItems.length - 1;
      const row = sheet.getRow(currentRow);

      sheet.mergeCells(`C${currentRow}:D${currentRow}`);
      const lblCell = row.getCell(3);
      lblCell.value = label;
      lblCell.font = { name: 'Segoe UI', size: isGrandTotal ? 11 : 9, bold: isGrandTotal };
      lblCell.alignment = { horizontal: 'right', vertical: 'middle' };

      const valCell = row.getCell(5);
      valCell.value = value;
      valCell.numFmt = '"Rp"#,##0';
      valCell.font = { name: 'Consolas', size: isGrandTotal ? 11 : 9, bold: isGrandTotal };
      valCell.alignment = { horizontal: 'right', vertical: 'middle' };

      if (isGrandTotal) {
        row.height = 24;
        lblCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'ECFDF5' } };
        valCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'ECFDF5' } };
        valCell.font = { name: 'Consolas', size: 11, bold: true, color: { argb: EMERALD } };
        lblCell.border = {
          top: { style: 'thin', color: { argb: EMERALD } },
          bottom: { style: 'double', color: { argb: EMERALD } }
        };
        valCell.border = {
          top: { style: 'thin', color: { argb: EMERALD } },
          bottom: { style: 'double', color: { argb: EMERALD } }
        };
      }

      currentRow++;
    });

    // 6. Auto-fit column widths
    sheet.columns = [
      { width: 8 },  // No
      { width: 38 }, // Description
      { width: 10 }, // Qty
      { width: 20 }, // Unit Price
      { width: 22 }  // Line Total
    ];

    // Write file
    await workbook.xlsx.writeFile(outputPath);
    return outputPath;
  }

  /**
   * Export multiple receipts into a consolidated Master Ledger workbook
   * @param {Array<Object>} receipts - Array of parsed receipts
   * @param {string} outputPath - Save destination
   */
  async exportBatchLedger(receipts, outputPath) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Smart OCR Assistant';

    // Color definitions
    const SLATE_DARK = '1E293B';
    const SLATE_BORDER = 'E2E8F0';
    const EMERALD = '059669';

    // Sheet 1: Master Receipts Summary
    const summarySheet = workbook.addWorksheet('Summary Ledger', {
      views: [{ showGridLines: true }]
    });

    summarySheet.columns = [
      { header: 'No', key: 'no', width: 6 },
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Invoice / Struk #', key: 'invoice', width: 22 },
      { header: 'Merchant', key: 'merchant', width: 30 },
      { header: 'Category', key: 'category', width: 22 },
      { header: 'Payment', key: 'payment', width: 16 },
      { header: 'Items Count', key: 'itemsCount', width: 12 },
      { header: 'Total (IDR)', key: 'total', width: 20 },
      { header: 'Status', key: 'status', width: 14 }
    ];

    const headerRow = summarySheet.getRow(1);
    headerRow.height = 24;
    headerRow.eachCell((cell) => {
      cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_DARK } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    receipts.forEach((r, idx) => {
      const row = summarySheet.addRow({
        no: idx + 1,
        date: r.date || '',
        invoice: r.invoiceNumber || 'N/A',
        merchant: r.merchant || 'Unknown',
        category: r.category || 'General',
        payment: r.paymentMethod || 'CASH',
        itemsCount: (r.items || []).length,
        total: r.total || 0,
        status: r.validation?.isBalanced ? 'VERIFIED' : 'CHECK'
      });

      row.getCell('total').numFmt = '"Rp"#,##0';
      row.getCell('total').font = { name: 'Consolas', size: 9, bold: true };
      row.getCell('status').font = {
        name: 'Segoe UI',
        size: 9,
        bold: true,
        color: { argb: r.validation?.isBalanced ? EMERALD : 'DC2626' }
      };

      row.eachCell((cell) => {
        cell.border = { bottom: { style: 'thin', color: { argb: SLATE_BORDER } } };
      });
    });

    // Sheet 2: All Line Items Consolidated
    const itemsSheet = workbook.addWorksheet('All Line Items', {
      views: [{ showGridLines: true }]
    });

    itemsSheet.columns = [
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Merchant', key: 'merchant', width: 26 },
      { header: 'Invoice #', key: 'invoice', width: 18 },
      { header: 'Item Name', key: 'desc', width: 34 },
      { header: 'Qty', key: 'qty', width: 10 },
      { header: 'Unit Price', key: 'unitPrice', width: 18 },
      { header: 'Subtotal (IDR)', key: 'total', width: 20 },
      { header: 'Category', key: 'category', width: 20 }
    ];

    const itemHeader = itemsSheet.getRow(1);
    itemHeader.height = 24;
    itemHeader.eachCell((cell) => {
      cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE_DARK } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    receipts.forEach(r => {
      (r.items || []).forEach(item => {
        const row = itemsSheet.addRow({
          date: r.date || '',
          merchant: r.merchant || '',
          invoice: r.invoiceNumber || '',
          desc: item.description,
          qty: item.qty || 1,
          unitPrice: item.unitPrice || 0,
          total: item.total || 0,
          category: r.category || 'General'
        });

        row.getCell('unitPrice').numFmt = '"Rp"#,##0';
        row.getCell('total').numFmt = '"Rp"#,##0';
        row.getCell('unitPrice').font = { name: 'Consolas', size: 9 };
        row.getCell('total').font = { name: 'Consolas', size: 9, bold: true };
      });
    });

    await workbook.xlsx.writeFile(outputPath);
    return outputPath;
  }
}

module.exports = ExcelExporter;
