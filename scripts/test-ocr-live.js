const path = require('path');
const fs = require('fs');
const ImageProcessor = require('../src/services/image-processor');
const OCREngine = require('../src/services/ocr-engine');
const ReceiptParser = require('../src/services/parser');

async function testLiveOcr() {
  console.log('Testing Live OCR Engine on sample receipt...');
  const samplePath = path.join(__dirname, '..', 'assets', 'samples', 'sample_indomaret.png');
  
  if (!fs.existsSync(samplePath)) {
    throw new Error('Sample image not found: ' + samplePath);
  }

  const processor = new ImageProcessor();
  console.log('1. Preprocessing sample image...');
  const processed = await processor.process(samplePath, { preset: 'contrast' });
  console.log(`   Processed buffer ready (${processed.width}x${processed.height}, ${processed.buffer.length} bytes)`);

  const ocr = new OCREngine();
  console.log('2. Running Tesseract recognition...');
  const ocrResult = await ocr.recognize(processed.buffer, (m) => {
    if (m.status === 'recognizing text') {
      process.stdout.write(`\r   Progress: ${Math.round((m.progress || 0) * 100)}%`);
    }
  });
  console.log('\n   OCR Recognition completed!');
  console.log(`   Confidence: ${Math.round(ocrResult.confidence)}%`);
  console.log('\n--- RAW OCR TEXT ---');
  console.log(ocrResult.text);
  console.log('--------------------\n');

  console.log('3. Parsing OCR text into structured receipt model...');
  const parser = new ReceiptParser();
  const parsed = parser.parse(ocrResult.text);

  console.log('Parsed Results:');
  console.log(`  Merchant : ${parsed.merchant}`);
  console.log(`  Date/Time: ${parsed.date} ${parsed.time}`);
  console.log(`  Invoice #: ${parsed.invoiceNumber}`);
  console.log(`  Subtotal : Rp ${parsed.subtotal.toLocaleString('id-ID')}`);
  console.log(`  Tax      : Rp ${parsed.tax.toLocaleString('id-ID')}`);
  console.log(`  Total    : Rp ${parsed.total.toLocaleString('id-ID')}`);
  console.log(`  Items (${parsed.items.length}):`);
  parsed.items.forEach((item, idx) => {
    console.log(`    ${idx + 1}. ${item.description} - Qty: ${item.qty} @ Rp ${item.unitPrice.toLocaleString('id-ID')} = Rp ${item.total.toLocaleString('id-ID')}`);
  });

  await ocr.terminate();
  console.log('\nOCR Live Test Passed Successfully!');
}

testLiveOcr().catch(err => {
  console.error('\nOCR Live Test Failed:', err);
  process.exit(1);
});
