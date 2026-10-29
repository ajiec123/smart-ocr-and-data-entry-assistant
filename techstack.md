# Tech Stack Document: Smart OCR & Data Entry Assistant

This document outlines the selected technology stack chosen for high performance, ease of packaging into a single `.exe`, robust offline capabilities, and developer velocity.

## 1. Core Technology Stack

| Layer | Technology | Purpose & Rationale |
| :--- | :--- | :--- |
| **Desktop Wrapper** | **Tauri** (Rust-based) or **Electron** | Packages the web UI and Node.js backend into a lightweight `.exe`. Tauri is preferred for a much smaller binary size and lower RAM footprint compared to Electron. |
| **Frontend UI** | **HTML5, Tailwind CSS, Alpine.js / Vanilla JS** | Lightweight, responsive split-screen UI without heavy build pipelines. Ensures snappy form filling and editing. |
| **Backend Runtime** | **Node.js (Embedded)** | Executes business logic, handles IPC events, manages file system operations, and runs OCR processing scripts. |
| **Image Processing** | **Sharp** (Node.js native module) | High-performance image cropping, resizing, grayscale conversion, and thresholding to prepare receipt images for accurate OCR reading. |
| **OCR Engine** | **Tesseract.js** (or native Tesseract C++ wrapper) | Open-source Optical Character Recognition engine capable of running completely **offline** without external API costs or internet dependency. |
| **Data Parsing & NLP** | **Custom JavaScript / Regular Expressions (Regex)** | Fast extraction algorithms to map raw OCR text tokens into structured fields (Total, Date, Items, Tax). |
| **Excel Generation** | **ExcelJS** | Comprehensive Node.js library for generating formatted, styled, and formula-ready `.xlsx` spreadsheets. |

## 2. Security & Licensing Stack

| Component | Technology | Purpose |
| :--- | :--- | :--- |
| **Hardware Fingerprinting** | `node-machine-id` / Native OS commands | Retrieves stable hardware identifiers (CPU/Motherboard UUID) to create a unique device fingerprint. |
| **Encryption & Hashing** | Node.js built-in `crypto` (AES-256 / SHA-256) | Verifies offline license signature files and secures local activation tokens against tampering. |

## 3. Development & Build Tools

* **Package Bundler:** `pkg` or Tauri Bundler (to compile everything into a standalone Windows `.exe` installer or portable executable).
* **Version Control:** Git & GitHub.
* **Testing & Mocking:** Sample dataset of 100+ receipt and invoice images with varying layouts and qualities to benchmark OCR accuracy.

## 4. Why This Stack Suits Tokopedia / Shopee Commercialization?
1. **Zero External Server Cost:** Because OCR and processing happen locally on the customer's PC, you don't need to pay monthly cloud server bills (like AWS Rekognition or Google Cloud Vision API) for every receipt scanned by your buyers.
2. **Standalone Executable (`.exe`):** Buyers on marketplace platforms hate complex installations (like installing Python, pip, or configuring environment variables). A single `.exe` file gives a smooth "double-click and run" experience.
3. **Offline Ready:** Works reliably even in areas with unstable or slow internet connections in Indonesia.