# Architecture Document: Smart OCR & Data Entry Assistant

## 1. System Overview
The **Smart OCR & Data Entry Assistant** is a standalone, offline-first desktop application distributed as a single portable executable (`.exe`). It is designed for non-technical administrative staff, shop owners, and data entry operators to convert physical receipts, invoices, and paper documents into clean, structured Excel sheets (`.xlsx`) automatically using local OCR and parsing logic.

## 2. High-Level System Architecture

```
+-----------------------------------------------------------------+
|                       Desktop Environment                       |
|                                                                 |
|  +-----------------------+         +-------------------------+  |
|  | Frontend UI           | <-----> | Local Backend (Node.js) |  |
|  | (HTML/CSS/JS + Tauri) |   IPC   | (Express / Fastify)     |  |
|  +-----------------------+         +------------+------------+  |
|                                                 |               |
|                                       Local File System         |
|                                                 |               |
|  +-----------------------+         +------------v------------+  |
|  | License Guard         | <-----> | OCR Engine & Parser     |  |
|  | (Hardware UID / Key)  |         | (Tesseract / Sharp / AI)|  |
|  +-----------------------+         +------------+------------+  |
|                                                 |               |
|                                    Excel Generator (`exceljs`)  |
|                                                 |               |
|                                    +------------v------------+  |
|                                    | Output `.xlsx` Files    |  |
|                                    +-------------------------+  |
+-----------------------------------------------------------------+
```

## 3. Core Component Breakdown

### A. Presentation Layer (Frontend)
* **Technology:** HTML5, Tailwind CSS, Vanilla JavaScript (or lightweight framework like Alpine.js).
* **Role:** Provides a clean split-screen user interface:
  * Left pane: Image viewer / camera capture preview.
  * Right pane: Extracted data form fields (editable preview grid) and export buttons.

### B. Desktop Container & IPC Layer
* **Technology:** Tauri (or Electron).
* **Role:** Packages the Node.js backend and web frontend into a native single executable (`.exe`). Manages native file dialogs (saving/loading files) and clipboard integration.

### C. Processing & OCR Engine (Backend)
* **Technology:** Node.js runtime embedded inside the executable.
* **Role:** 
  * **Image Preprocessing:** Uses image manipulation libraries to deskew, binarize, and enhance contrast of scanned receipts.
  * **Text Extraction (OCR):** Integrates an offline OCR engine (e.g., Tesseract.js or native bindings) to convert receipt images into raw text blocks.
  * **Data Parsing & Regular Expressions (Regex):** Extracts key fields such as Invoice Number, Date, Total Amount, and line items (Item Name, Qty, Price).

### D. Excel Export Engine
* **Technology:** `exceljs` library.
* **Role:** Injects structured parsed data into predefined or custom user Excel templates, ensuring formulas, currencies, and date formats remain clean and valid.

## 4. Licensing & Security Mechanism (Hardware-Locked UID)
To protect the software from piracy when distributed via Tokopedia or Shopee, a strict offline-first license verification system is implemented:

1. **Hardware Fingerprint Generation:**
   * Upon first launch, the backend queries native machine identifiers (e.g., CPU ID, Motherboard UUID, or MAC address hash) to generate a unique **Device UID**.
2. **License Key Activation:**
   * The customer purchases a license card. Inside the app, they enter their License Key.
   * The app generates a cryptographic license verification request (or checks against a local signed license file generated via an offline keygen server/portal).
3. **Binding & Enforcement:**
   * The license file locks the software to that specific **Device UID**. If the `.exe` file is copied to another PC, the UID mismatch triggers a lock state, requiring a new license activation.

## 5. Data Flow Lifecycle
1. **Input:** User uploads or snaps a picture of a paper receipt.
2. **Process:** Image is cleaned -> OCR reads text -> Regex parser structures the data.
3. **Verify:** Parsed data appears in the UI form for quick human review/editing.
4. **Export:** User clicks "Export to Excel", generating a clean `.xlsx` file on their local disk.