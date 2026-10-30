const path = require('path');
const fs = require('fs');
const ReceiptParser = require('../src/services/parser');
const ExcelExporter = require('../src/services/excel-exporter');
const LicenseService = require('../src/services/licensing');
const ImageProcessor = require('../src/services/image-processor');

async function runTests() {
  console.log('=== SMART OCR SYSTEM TEST SUITE ===\n');

  // 1. License Tests
  console.log('[1/4] Testing Hardware UID & License Security...');
  const licenseService = new LicenseService();
  const uid = licenseService.getDeviceUID();
  console.log(`  Device UID: ${uid}`);

  const testKey = licenseService.generateLicenseKey(uid, 'PT Retail Digital', 'LIFETIME');
  const verifyResult = licenseService.verifyLicenseKey(testKey);
  if (!verifyResult.valid) {
    throw new Error(`License verification failed: ${verifyResult.error}`);
  }
  console.log('  License Generation & Cryptographic Verification: PASSED\n');

  // 2. Receipt Parsing Tests
  console.log('[2/4] Testing Indonesian & General Receipt Parsing...');
  const parser = new ReceiptParser();

  const sampleReceiptIndomaret = `
PT INDOMARCO PRISMATAMA
INDOMARET RAYA DARMO 42
JL. RAYA DARMO NO 42 SURABAYA
NPWP: 01.337.994.2-092.000
========================================
28/10/2026 14:32  KASIR: SITI
NO. TRANSAKSI: IDM/20261028/89123
========================================
ROTI TAWAR KUPAS SARI ROTI
1 x 16.500                        16.500
INDOMILK UHT FULL CREAM 1L
2 x 18.000                        36.000
AQUA AIR MINERAL 600ML
3 x 4.000                         12.000
MINYAK GORENG SANIA 2L
1 x 34.500                        34.500
========================================
SUBTOTAL                          99.000
PPN 11%                           10.890
TOTAL                            109.890
TUNAI                            150.000
KEMBALI                           40.110
========================================
TERIMA KASIH TELAH BERBELANJA
`;

  const parsed1 = parser.parse(sampleReceiptIndomaret);
  console.log('  Sample 1: Indomaret Retail');
  console.log(`    Merchant : ${parsed1.merchant}`);
  console.log(`    Date     : ${parsed1.date} ${parsed1.time}`);
  console.log(`    Invoice #: ${parsed1.invoiceNumber}`);
  console.log(`    Kasir    : ${parsed1.cashier}`);
  console.log(`    Items    : ${parsed1.items.length} items parsed`);
  parsed1.items.forEach(i => console.log(`      - ${i.description} (${i.qty}x) = Rp ${i.total.toLocaleString('id-ID')}`));
  console.log(`    Subtotal : Rp ${parsed1.subtotal.toLocaleString('id-ID')}`);
  console.log(`    Tax      : Rp ${parsed1.tax.toLocaleString('id-ID')}`);
  console.log(`    Total    : Rp ${parsed1.total.toLocaleString('id-ID')}`);
  console.log(`    Balanced : ${parsed1.validation.isBalanced}`);

  if (parsed1.items.length !== 4) {
    throw new Error(`Expected 4 items, got ${parsed1.items.length}`);
  }
  console.log('  Parsing Indomaret: PASSED\n');

  // Sample 2: Cafe / Restaurant Receipt
  const sampleReceiptCafe = `
KOPI KENANGAN MANTAN
MALL KELAPA GADING 3, JAKARTA UTARA
STRUK NO: KK-998231
DATE: 2026-10-25 10:15
CASHIER: BUDI SANTOSO
PAYMENT: QRIS
----------------------------------------
ES KOPI KENANGAN MANTAN L
2 x 24000                         48000
TOAST CHOCOLATE BANANA
1 x 28000                         28000
CROISSANT BUTTER
1 x 22000                         22000
----------------------------------------
SUBTOTAL                          98000
PB1 10%                            9800
SERVICE CHARGE                     5000
TOTAL BAYAR                      112800
`;

  const parsed2 = parser.parse(sampleReceiptCafe);
  console.log('  Sample 2: Cafe / F&B Receipt');
  console.log(`    Merchant : ${parsed2.merchant}`);
  console.log(`    Payment  : ${parsed2.paymentMethod}`);
  console.log(`    Category : ${parsed2.category}`);
  console.log(`    Items    : ${parsed2.items.length} items parsed`);
  console.log(`    Tax      : Rp ${parsed2.tax.toLocaleString('id-ID')}`);
  console.log(`    Service  : Rp ${parsed2.serviceCharge.toLocaleString('id-ID')}`);
  console.log(`    Total    : Rp ${parsed2.total.toLocaleString('id-ID')}`);
  if (parsed2.items.length !== 3) {
    throw new Error(`Expected 3 items, got ${parsed2.items.length}`);
  }
  console.log('  Parsing Cafe Receipt: PASSED\n');

  // Sample 3: Check No, 2-digit Year, and Leading Quantities (BreadTalk / User Image)
  const sampleReceiptUser = `
JL. BOULEVARD BARU SUMMARECON
(021)
www.btdelivery.com
1 POS1 1506551 WINDA APRIANI P
----------------------------------------
Check No : 3059689
10 May 19 16:32:47
----------------------------------------
1 Bread Butter Pudding 11,500
1 Cream Bruille 14,000
1 Choco Croissant 10,500
1 Bank Of Chocolat 7,500
Subtotal : 43,500
Total: 43,500
Payment : 43,500
Debit BCA
----1506551 CLOSED 10 May 19 16:33:20---
`;

  const parsed3 = parser.parse(sampleReceiptUser);
  console.log('  Sample 3: User Receipt (Leading Qty, Check No & 2-Digit Year)');
  console.log(`    Merchant : ${parsed3.merchant}`);
  console.log(`    Date     : ${parsed3.date} ${parsed3.time}`);
  console.log(`    Invoice #: ${parsed3.invoiceNumber}`);
  console.log(`    Payment  : ${parsed3.paymentMethod}`);
  console.log(`    Items    : ${parsed3.items.length} items parsed`);
  parsed3.items.forEach(i => console.log(`      - ${i.description} (${i.qty}x) = Rp ${i.total.toLocaleString('id-ID')}`));
  console.log(`    Total    : Rp ${parsed3.total.toLocaleString('id-ID')}`);
  console.log(`    Balanced : ${parsed3.validation.isBalanced}`);

  if (parsed3.items.length !== 4) {
    throw new Error(`Expected 4 items, got ${parsed3.items.length}`);
  }
  if (parsed3.invoiceNumber !== '3059689') {
    throw new Error(`Expected invoice 3059689, got ${parsed3.invoiceNumber}`);
  }
  if (parsed3.date !== '2019-05-10') {
    throw new Error(`Expected date 2019-05-10, got ${parsed3.date}`);
  }
  console.log('  Parsing User Receipt: PASSED\n');

  // Sample 4: Indonesian Toll Receipt (Jasamarga Auto-Detection)
  const sampleReceiptToll = `
PT JASAMARGA TOLLROAD OPERATOR
RUAS TOL     : CIKARANG - CIRANJANG
GERBANG TOL  : CIKARANG UTAMA 3
GOLONGAN     : I
TARIF TOL    : Rp 12.000
TANGGAL      : 28/10/2026 19:45:00
NO RESI      : JMR-20261028-9812
METODE       : E-TOLL MANDIRI
SISA SALDO   : Rp 88.000
TERIMA KASIH
`;

  const parsedToll = parser.parse(sampleReceiptToll);
  console.log('  Sample 4: Indonesian Toll Receipt (Jasamarga)');
  console.log(`    Merchant : ${parsedToll.merchant}`);
  console.log(`    Profile  : ${parsedToll.detectedProfile}`);
  console.log(`    Category : ${parsedToll.category}`);
  console.log(`    Payment  : ${parsedToll.paymentMethod}`);
  console.log(`    Date     : ${parsedToll.date} ${parsedToll.time}`);
  console.log(`    Invoice #: ${parsedToll.invoiceNumber}`);
  console.log(`    Tarif    : Rp ${parsedToll.total.toLocaleString('id-ID')}`);
  console.log(`    Items    : ${parsedToll.items.length} item(s)`);
  parsedToll.items.forEach(i => console.log(`      - ${i.description} (${i.qty}x) = Rp ${i.total.toLocaleString('id-ID')}`));
  console.log(`    Balanced : ${parsedToll.validation.isBalanced}`);

  if (parsedToll.detectedProfile !== 'toll') {
    throw new Error(`Expected detectedProfile 'toll', got '${parsedToll.detectedProfile}'`);
  }
  if (!parsedToll.merchant.includes('JASAMARGA')) {
    throw new Error(`Expected Jasamarga merchant, got '${parsedToll.merchant}'`);
  }
  if (parsedToll.total !== 12000) {
    throw new Error(`Expected tariff total 12000, got ${parsedToll.total}`);
  }
  if (parsedToll.category !== 'Transport & Toll') {
    throw new Error(`Expected category 'Transport & Toll', got '${parsedToll.category}'`);
  }
  if (parsedToll.items.length !== 1) {
    throw new Error(`Expected 1 synthesized toll item, got ${parsedToll.items.length}`);
  }
  console.log('  Parsing Jasamarga Toll Receipt: PASSED\n');

  // Sample 5: Real-World Indonesian Toll Receipt from User Screenshot (Cimanggis 3)
  const sampleReceiptCimanggis = `
Info Tol 14080
CIMANGGIS3
31/12/2022 17:57:15 02/08/02
No Seri : 107365 152083/150935
GOL-1 E-TOLL BCA Rp 7.000
S/N: 0146000631250962
SALDO: Rp. 16.340
`;

  const parsedCimanggis = parser.parse(sampleReceiptCimanggis);
  console.log('  Sample 5: Real-world Toll Receipt (Cimanggis 3 / User Screenshot)');
  console.log(`    Merchant : ${parsedCimanggis.merchant}`);
  console.log(`    Profile  : ${parsedCimanggis.detectedProfile}`);
  console.log(`    Category : ${parsedCimanggis.category}`);
  console.log(`    Date     : ${parsedCimanggis.date} ${parsedCimanggis.time}`);
  console.log(`    Invoice #: ${parsedCimanggis.invoiceNumber}`);
  console.log(`    Payment  : ${parsedCimanggis.paymentMethod}`);
  console.log(`    Total    : Rp ${parsedCimanggis.total.toLocaleString('id-ID')}`);
  console.log(`    Items    : ${parsedCimanggis.items.length} item(s)`);
  parsedCimanggis.items.forEach(i => console.log(`      - ${i.description} (${i.qty}x) = Rp ${i.total.toLocaleString('id-ID')}`));
  console.log(`    Balanced : ${parsedCimanggis.validation.isBalanced}`);

  if (parsedCimanggis.merchant !== 'PT JASA MARGA (PERSERO) TBK') {
    throw new Error(`Expected merchant 'PT JASA MARGA (PERSERO) TBK', got '${parsedCimanggis.merchant}'`);
  }
  if (parsedCimanggis.detectedProfile !== 'toll') {
    throw new Error(`Expected detectedProfile 'toll', got '${parsedCimanggis.detectedProfile}'`);
  }
  if (parsedCimanggis.category !== 'Transport & Toll') {
    throw new Error(`Expected category 'Transport & Toll', got '${parsedCimanggis.category}'`);
  }
  if (parsedCimanggis.date !== '2022-12-31' || parsedCimanggis.time !== '17:57:15') {
    throw new Error(`Expected date 2022-12-31 17:57:15, got ${parsedCimanggis.date} ${parsedCimanggis.time}`);
  }
  if (parsedCimanggis.invoiceNumber !== '107365') {
    throw new Error(`Expected invoiceNumber '107365', got '${parsedCimanggis.invoiceNumber}'`);
  }
  if (!parsedCimanggis.paymentMethod.includes('E-Toll')) {
    throw new Error(`Expected payment method to include 'E-Toll', got '${parsedCimanggis.paymentMethod}'`);
  }
  if (parsedCimanggis.total !== 7000) {
    throw new Error(`Expected total 7000, got ${parsedCimanggis.total}`);
  }
  if (parsedCimanggis.items.length !== 1) {
    throw new Error(`Expected 1 item, got ${parsedCimanggis.items.length}`);
  }
  if (!parsedCimanggis.items[0].description.includes('CIMANGGIS')) {
    throw new Error(`Expected item to include 'CIMANGGIS', got '${parsedCimanggis.items[0].description}'`);
  }
  console.log('  Parsing Cimanggis Toll Receipt (Single Line): PASSED\n');

  // Sample 6: Multi-column Split OCR Output (Tesseract column-break variation)
  const sampleReceiptSplitColumns = `
Info Tol 14080
CIMANGGIS3
31/12/2022 17:57:15
No Seri : 107365
GOL-1 E-TOLL BCA
S/N: 0146000631250962
SALDO: Rp. 16.340
02/08/02
152083/150935
Rp 7.000
`;

  const parsedSplit = parser.parse(sampleReceiptSplitColumns);
  console.log('  Sample 6: Multi-column Split OCR Output');
  console.log(`    Merchant : ${parsedSplit.merchant}`);
  console.log(`    Total    : Rp ${parsedSplit.total.toLocaleString('id-ID')}`);
  console.log(`    Items    : ${parsedSplit.items.length} item(s)`);
  parsedSplit.items.forEach(i => console.log(`      - ${i.description} (${i.qty}x) = Rp ${i.total.toLocaleString('id-ID')}`));
  console.log(`    Balanced : ${parsedSplit.validation.isBalanced}`);

  if (parsedSplit.total !== 7000) {
    throw new Error(`Expected tariff total 7000 from split column output, got ${parsedSplit.total}`);
  }
  if (parsedSplit.items.length !== 1 || parsedSplit.items[0].total !== 7000) {
    throw new Error(`Expected 1 item with total 7000, got ${JSON.stringify(parsedSplit.items)}`);
  }
  console.log('  Parsing Multi-column Split Toll Receipt: PASSED\n');

  // Sample 7: Mobile Banking Transfer Receipt (m-BCA)
  const sampleReceiptBcaBanking = `
m-Transfer:
BERHASIL
28/10/2026 14:35:10
NO. REFERENSI: 20261028143588921
DARI: 1234567890 - BUDI SANTOSO
KE: 0987654321 - PT SINAR MAKMUR ABADI
BANK TUJUAN: BCA
JUMLAH: Rp 1.500.000,00
BIAYA ADMIN: Rp 0,00
TOTAL: Rp 1.500.000,00
BERITA: PEMBAYARAN SEWA
JENIS TRANSFER: TRANSFER ONLINE
`;

  const parsedBanking1 = parser.parse(sampleReceiptBcaBanking);
  console.log('  Sample 7: Mobile Banking Transfer Receipt (m-BCA)');
  console.log(`    Merchant : ${parsedBanking1.merchant}`);
  console.log(`    Profile  : ${parsedBanking1.detectedProfile}`);
  console.log(`    Category : ${parsedBanking1.category}`);
  console.log(`    Date     : ${parsedBanking1.date} ${parsedBanking1.time}`);
  console.log(`    Invoice #: ${parsedBanking1.invoiceNumber}`);
  console.log(`    Payment  : ${parsedBanking1.paymentMethod}`);
  console.log(`    Total    : Rp ${parsedBanking1.total.toLocaleString('id-ID')}`);
  console.log(`    Items    : ${parsedBanking1.items.length} item(s)`);
  parsedBanking1.items.forEach(i => console.log(`      - ${i.description} (${i.qty}x) = Rp ${i.total.toLocaleString('id-ID')}`));
  console.log(`    Balanced : ${parsedBanking1.validation.isBalanced}`);

  if (parsedBanking1.detectedProfile !== 'banking') {
    throw new Error(`Expected detectedProfile 'banking', got '${parsedBanking1.detectedProfile}'`);
  }
  if (!parsedBanking1.merchant.includes('BCA')) {
    throw new Error(`Expected BCA merchant, got '${parsedBanking1.merchant}'`);
  }
  if (parsedBanking1.total !== 1500000) {
    throw new Error(`Expected total 1500000, got ${parsedBanking1.total}`);
  }
  if (parsedBanking1.invoiceNumber !== '20261028143588921') {
    throw new Error(`Expected reference 20261028143588921, got ${parsedBanking1.invoiceNumber}`);
  }
  if (parsedBanking1.items.length !== 1) {
    throw new Error(`Expected 1 item, got ${parsedBanking1.items.length}`);
  }
  if (!parsedBanking1.validation.isBalanced) {
    throw new Error('Expected math balance to be true');
  }
  console.log('  Parsing m-BCA Mobile Banking Receipt: PASSED\n');

  // Sample 8: Mobile Banking Transfer Receipt with Admin Fee (Mandiri Livin BI-FAST)
  const sampleReceiptMandiriLivin = `
Resi Transfer
Status Transaksi: Berhasil
Tanggal: 25 Okt 2026
Waktu: 15:30:45 WIB
No. Referensi: TR-20261025-99881
Sumber Dana: MANDIRI TABUNGAN
Ke Rekening: 1029384756
Nama Penerima: AHMAD FAUZI
Bank Penerima: BANK BRI
Nominal: Rp 750.000
Biaya Transfer: Rp 2.500
Total Transaksi: Rp 752.500
Metode: BI-FAST
Catatan: Uang Makan Tim
`;

  const parsedBanking2 = parser.parse(sampleReceiptMandiriLivin);
  console.log('  Sample 8: Mobile Banking BI-FAST Transfer (Mandiri Livin)');
  console.log(`    Merchant : ${parsedBanking2.merchant}`);
  console.log(`    Profile  : ${parsedBanking2.detectedProfile}`);
  console.log(`    Category : ${parsedBanking2.category}`);
  console.log(`    Invoice #: ${parsedBanking2.invoiceNumber}`);
  console.log(`    Payment  : ${parsedBanking2.paymentMethod}`);
  console.log(`    Total    : Rp ${parsedBanking2.total.toLocaleString('id-ID')}`);
  console.log(`    Items    : ${parsedBanking2.items.length} item(s)`);
  parsedBanking2.items.forEach(i => console.log(`      - ${i.description} (${i.qty}x) = Rp ${i.total.toLocaleString('id-ID')}`));
  console.log(`    Balanced : ${parsedBanking2.validation.isBalanced}`);

  if (parsedBanking2.detectedProfile !== 'banking') {
    throw new Error(`Expected detectedProfile 'banking', got '${parsedBanking2.detectedProfile}'`);
  }
  if (!parsedBanking2.merchant.includes('MANDIRI')) {
    throw new Error(`Expected Mandiri merchant, got '${parsedBanking2.merchant}'`);
  }
  if (parsedBanking2.total !== 752500) {
    throw new Error(`Expected total 752500, got ${parsedBanking2.total}`);
  }
  if (parsedBanking2.items.length !== 2) {
    throw new Error(`Expected 2 items (transfer + admin fee), got ${parsedBanking2.items.length}`);
  }
  if (!parsedBanking2.validation.isBalanced) {
    throw new Error('Expected math balance to be true');
  }
  console.log('  Parsing Mandiri Livin BI-FAST Receipt: PASSED\n');

  // 3. Excel Exporter Tests
  console.log('[3/4] Testing Excel Exporter (.xlsx)...');
  const exporter = new ExcelExporter();
  const testOutputDir = path.join(__dirname, '..', 'temp_output');
  if (!fs.existsSync(testOutputDir)) fs.mkdirSync(testOutputDir, { recursive: true });

  const singleFile = path.join(testOutputDir, 'test_single_receipt.xlsx');
  await exporter.exportSingleReceipt(parsed1, singleFile);
  console.log(`  Exported single receipt to: ${singleFile} (${fs.statSync(singleFile).size} bytes)`);

  const batchFile = path.join(testOutputDir, 'test_batch_ledger.xlsx');
  await exporter.exportBatchLedger([parsed1, parsed2], batchFile);
  console.log(`  Exported batch master ledger to: ${batchFile} (${fs.statSync(batchFile).size} bytes)`);
  console.log('  Excel Export: PASSED\n');

  // 4. Image Processor Tests
  console.log('[4/4] Testing Image Processing Pipeline with Sharp...');
  const imgProcessor = new ImageProcessor();
  
  // Create a synthetic receipt image buffer for testing
  const sharp = require('sharp');
  const testSvg = `
    <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#ffffff"/>
      <text x="20" y="40" font-family="sans-serif" font-size="20" fill="#000000">KOPITIAM 88</text>
      <text x="20" y="80" font-family="sans-serif" font-size="14" fill="#333333">28/10/2026 10:00</text>
      <text x="20" y="120" font-family="sans-serif" font-size="14" fill="#333333">KOPI TARIK   1  15.000</text>
      <text x="20" y="160" font-family="sans-serif" font-size="14" fill="#333333">ROTI BAKAR   1  20.000</text>
      <text x="20" y="220" font-family="sans-serif" font-size="16" font-weight="bold" fill="#000000">TOTAL: 35.000</text>
    </svg>
  `;
  const rawPng = await sharp(Buffer.from(testSvg)).png().toBuffer();

  const contrastResult = await imgProcessor.process(rawPng, { preset: 'contrast' });
  const binarizeResult = await imgProcessor.process(rawPng, { preset: 'binarize' });

  console.log(`  Processed contrast image: ${contrastResult.width}x${contrastResult.height}, ${contrastResult.buffer.length} bytes`);
  console.log(`  Processed binarize image: ${binarizeResult.width}x${binarizeResult.height}, ${binarizeResult.buffer.length} bytes`);
  console.log('  Image Preprocessing: PASSED\n');

  console.log('========================================================');
  console.log('ALL TESTS PASSED SUCCESSFULLY!');
  console.log('========================================================');
}

runTests().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
