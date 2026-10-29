# Smart OCR & Data Entry Assistant

Offline-first desktop application engineered for Indonesian shop owners, retail operators, and administrative data entry staff to convert receipts, invoices, and physical paper documents into clean, structured Excel sheets (`.xlsx`).

---

## 1. System Architecture & Features

- **Split-Screen Workbench:**
  - **Left Pane:** High-speed document viewer supporting both **PDF documents** (multi-page with page navigation) and **Images** (PNG, JPG, JPEG, WEBP, BMP) with zoom (mouse wheel / buttons), pan (click-and-drag), 90° rotation, and real-time preprocessing filters (`High Contrast`, `Binarize / B&W`, `Grayscale`, `Original`).
  - **Right Pane:** Instant tabular form editor for structured metadata (Merchant, Date, Time, Invoice #, Payment, Category) and an editable line items table (Product Name, Qty, Unit Price, Line Total).
- **Document & PDF Processing:** Integrated with Mozilla PDF.js for 100% offline, native PDF rendering and direct digital text extraction (e.g. for e-invoices, bank statements, or scanned PDF documents) with seamless multi-page switching (`Page 1 / N`).
- **Offline OCR Engine:** Powered by Tesseract.js with pre-cached Indonesian (`ind`) and English (`eng`) models stored in `assets/tessdata/`. No external API calls, cloud subscriptions, or internet connection required.
- **Image Preprocessing:** Sharp-based normalization, dynamic contrast stretching, and Otsu-style thresholding to maximize OCR recognition accuracy on faded thermal paper.
- **Smart Parsing & Heuristics:** Automatically detects Indonesian receipt formats (Indomaret, Alfamart, restaurants, cafes, pharmacies, invoices), extracts date, transaction number, line items, tax (PPN 11% / PB1 10%), discounts, and totals.
- **Instant Math Verification:** Compares the sum of line items against the scanned receipt total to immediately flag OCR discrepancies.
- **Excel (.xlsx) Exporter:** Generates formatted Excel spreadsheets using ExcelJS with styled headers, auto-fit columns, accounting number formatting (`Rp #,##0`), and formula rows.
- **Hardware-Locked Licensing Guard:** Retrieves machine identifiers (Motherboard/BIOS UUID) to generate a unique Device UID. Activates via HMAC-SHA256 signed offline license keys for Tokopedia & Shopee distribution.

---

## 2. Quick Start

### Prerequisites
- Node.js (v18 or higher recommended; developed and tested on v22.19.0)
- Windows 10/11 (or macOS / Linux)

### Installation
```bash
npm install
```

### Run Desktop Application
```bash
npm start
```

---

## 3. Commercial Key Generator (Tokopedia / Shopee Seller Workflow)

When distributing software copies to marketplace customers:

1. Customer launches SmartOCR on their PC and clicks **"Unlicensed - Enter Key"**.
2. Customer copies their unique hardware **Device UID** (e.g. `SOCR-BC7D-275D-404D-4628`) and sends it to the seller via Tokopedia / Shopee chat.
3. Seller runs the keygen script:
   ```bash
   node scripts/generate-license.js <DEVICE_UID> [CUSTOMER_NAME] [LIFETIME/ANNUAL]
   ```
   *Example:*
   ```bash
   npm run keygen SOCR-BC7D-275D-404D-4628 "Toko Berkah Sejahtera" LIFETIME
   ```
4. Seller delivers the generated Base64 license key to the buyer.
5. Buyer pastes the key into SmartOCR and clicks **"Activate License"**. The license locks cryptographically to their PC hardware.

---

## 4. Testing & Verification

Run the automated test suite verifying hardware UID generation, license verification, regex parsing, Excel export, and image preprocessing:
```bash
npm test
```

Run live OCR recognition on bundled sample receipts:
```bash
node scripts/test-ocr-live.js
```

---

## 5. Project Directory Structure

```
SmartOCR/
├── assets/
│   ├── samples/              # Realistic Indonesian test receipts (Indomaret, Cafe, Apotek)
│   └── tessdata/             # Offline Tesseract models (ind.traineddata, eng.traineddata)
├── scripts/
│   ├── generate-license.js   # Commercial keygen tool for marketplace sellers
│   ├── generate-samples.js   # Test receipt image generator
│   ├── test-ocr-live.js      # End-to-end OCR benchmark
│   └── test-parser.js        # Core test suite
├── src/
│   ├── main/
│   │   ├── main.js           # Electron main process & IPC handlers
│   │   └── preload.js        # Secure contextBridge API
│   ├── renderer/
│   │   ├── app.js            # Workbench controller & interactivity
│   │   ├── index.html        # High-density split UI workbench
│   │   └── styles.css        # Slate & Emerald design system
│   └── services/
│       ├── excel-exporter.js # ExcelJS spreadsheet builder
│       ├── image-processor.js# Sharp contrast/binarization pipeline
│       ├── licensing.js      # Hardware UID & cryptographic license guard
│       ├── ocr-engine.js     # Offline Tesseract.js wrapper
│       └── parser.js         # Receipt regex and heuristic extraction
├── architecture.md           # System architecture specification
├── DESIGN.md                 # Visual design system & dials
├── package.json
└── techstack.md              # Technical stack rationale
```
