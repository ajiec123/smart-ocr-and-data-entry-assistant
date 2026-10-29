// Smart OCR - Frontend Workbench Controller (Image & PDF Support)
import * as pdfjsLib from './libs/pdfjs/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = './libs/pdfjs/pdf.worker.min.mjs';

(function() {
  'use strict';

  // Application State
  const state = {
    currentFilePath: null,
    currentDataUrl: null,
    isPdf: false,
    pdfDocument: null,
    pdfCurrentPage: 1,
    pdfTotalPages: 1,
    preset: 'contrast',
    rotation: 0,
    zoom: 1,
    pan: { x: 0, y: 0 },
    isPanning: false,
    panStart: { x: 0, y: 0 },
    detectedTotal: 0,
    items: [],
    rawText: '',
    license: { activated: false, deviceUID: '' },
    // Business Profile State
    activeProfile: 'auto',
    // Batch Queue State
    queue: [],
    activeQueueIndex: -1,
    // Interactive BBox State
    showOcrBoxes: true,
    words: [],
    imageWidth: 0,
    imageHeight: 0,
    lastFocusedInput: null
  };

  // Business Profiles
  const PROFILES = {
    auto: {
      name: 'Auto-Detect',
      category: 'General',
      tip: 'Adapts automatically to any receipt.'
    },
    toll: {
      name: 'Indonesian Tollway (Jasamarga)',
      category: 'Transport & Toll',
      tip: 'Optimized for Indonesian toll receipts (Jasa Marga, tariffs & E-Toll).'
    },
    retail: {
      name: 'Retail / Minimarket',
      category: 'Groceries / Convenience',
      tip: 'Optimized for minimarket barcodes & multiline items.'
    },
    fnb: {
      name: 'Food & Beverage',
      category: 'Food & Beverage',
      tip: 'Optimized for restaurant/cafe items, service charges & PB1.'
    },
    pharmacy: {
      name: 'Apotek / Pharmacy',
      category: 'Healthcare / Pharmacy',
      tip: 'Optimized for medicine names, dosage codes & pharmacy receipts.'
    }
  };

  // DOM Elements
  const elements = {
    // Top Bar & Queue Controls
    btnToggleQueue: document.getElementById('btnToggleQueue'),
    headerQueueCount: document.getElementById('headerQueueCount'),
    profileSelect: document.getElementById('profileSelect'),
    licenseBadge: document.getElementById('licenseBadge'),
    licenseText: document.getElementById('licenseText'),
    btnOpenFiles: document.getElementById('btnOpenFiles'),
    btnExportExcel: document.getElementById('btnExportExcel'),
    progressBarContainer: document.getElementById('progressBarContainer'),
    progressBarFill: document.getElementById('progressBarFill'),

    // Queue Drawer
    queueDrawer: document.getElementById('queueDrawer'),
    queueBadgeCount: document.getElementById('queueBadgeCount'),
    queueList: document.getElementById('queueList'),
    btnProcessAllQueue: document.getElementById('btnProcessAllQueue'),
    btnExportBatchMaster: document.getElementById('btnExportBatchMaster'),
    btnQueueTrash: document.getElementById('btnQueueTrash'),
    queueTrashMenu: document.getElementById('queueTrashMenu'),
    btnDeleteSelectedQueue: document.getElementById('btnDeleteSelectedQueue'),
    btnDeleteAllQueue: document.getElementById('btnDeleteAllQueue'),

    // Viewer Controls & Canvas
    presetSelect: document.getElementById('presetSelect'),
    pdfPageNav: document.getElementById('pdfPageNav'),
    btnPrevPage: document.getElementById('btnPrevPage'),
    btnNextPage: document.getElementById('btnNextPage'),
    pdfPageIndicator: document.getElementById('pdfPageIndicator'),
    btnToggleBBox: document.getElementById('btnToggleBBox'),
    btnZoomIn: document.getElementById('btnZoomIn'),
    btnZoomOut: document.getElementById('btnZoomOut'),
    btnZoomReset: document.getElementById('btnZoomReset'),
    btnRotate: document.getElementById('btnRotate'),
    canvasViewport: document.getElementById('canvasViewport'),
    canvasTransformLayer: document.getElementById('canvasTransformLayer'),
    receiptImage: document.getElementById('receiptImage'),
    ocrBoxesOverlay: document.getElementById('ocrBoxesOverlay'),
    dropOverlay: document.getElementById('dropOverlay'),
    dropBox: document.getElementById('dropBox'),
    btnBrowseEmpty: document.getElementById('btnBrowseEmpty'),
    pdfRenderCanvas: document.getElementById('pdfRenderCanvas'),

    // Form Controls
    tabFormBtn: document.getElementById('tabFormBtn'),
    tabRawBtn: document.getElementById('tabRawBtn'),
    formTabContent: document.getElementById('formTabContent'),
    rawTabContent: document.getElementById('rawTabContent'),
    rawTextContent: document.getElementById('rawTextContent'),
    activeFileTitle: document.getElementById('activeFileTitle'),
    ocrConfidenceTag: document.getElementById('ocrConfidenceTag'),

    // Fields
    inputMerchant: document.getElementById('inputMerchant'),
    inputCategory: document.getElementById('inputCategory'),
    inputDate: document.getElementById('inputDate'),
    inputTime: document.getElementById('inputTime'),
    inputInvoice: document.getElementById('inputInvoice'),
    inputPayment: document.getElementById('inputPayment'),

    // Items Table
    tableSectionTitle: document.getElementById('tableSectionTitle'),
    itemsTableBody: document.getElementById('itemsTableBody'),
    btnAddRow: document.getElementById('btnAddRow'),

    // Totals
    displaySubtotal: document.getElementById('displaySubtotal'),
    inputTax: document.getElementById('inputTax'),
    inputService: document.getElementById('inputService'),
    inputDiscount: document.getElementById('inputDiscount'),
    displayGrandTotal: document.getElementById('displayGrandTotal'),
    verificationStatusBadge: document.getElementById('verificationStatusBadge'),
    verificationStatusText: document.getElementById('verificationStatusText'),
    verificationDetailText: document.getElementById('verificationDetailText'),

    // Status bar & Footer
    systemStatusMsg: document.getElementById('systemStatusMsg'),
    btnRerunOcr: document.getElementById('btnRerunOcr'),
    btnClear: document.getElementById('btnClear'),

    // Toast
    toastMsg: document.getElementById('toastMsg'),
    toastText: document.getElementById('toastText'),

    // License Modal
    licenseModal: document.getElementById('licenseModal'),
    modalDeviceUid: document.getElementById('modalDeviceUid'),
    btnCopyUid: document.getElementById('btnCopyUid'),
    licenseKeyInput: document.getElementById('licenseKeyInput'),
    licenseModalFeedback: document.getElementById('licenseModalFeedback'),
    btnCloseLicenseModal: document.getElementById('btnCloseLicenseModal'),
    btnCancelLicense: document.getElementById('btnCancelLicense'),
    btnActivateLicense: document.getElementById('btnActivateLicense')
  };

  // Initialize
  async function init() {
    setupEventListeners();
    setupCanvasInteractions();
    setupOcrProgressListener();
    setupDemoReceiptButtons();
    await checkLicenseStatus();
  }

  // --- Licensing ---
  async function checkLicenseStatus() {
    try {
      const res = await window.api.getLicenseStatus();
      state.license = res;
      elements.modalDeviceUid.textContent = res.deviceUID || 'UNKNOWN';

      if (res.activated) {
        elements.licenseBadge.className = 'license-pill active';
        elements.licenseText.textContent = `Licensed (${res.type || 'LIFETIME'})`;
      } else {
        elements.licenseBadge.className = 'license-pill unregistered';
        elements.licenseText.textContent = 'Unlicensed - Enter Key';
      }
    } catch (err) {
      console.warn('License check failed:', err);
    }
  }

  async function activateLicenseKey() {
    const key = elements.licenseKeyInput.value.trim();
    if (!key) {
      elements.licenseModalFeedback.style.color = '#e11d48';
      elements.licenseModalFeedback.textContent = 'Please enter a valid license key.';
      return;
    }

    elements.licenseModalFeedback.style.color = '#94a3b8';
    elements.licenseModalFeedback.textContent = 'Verifying key signature...';

    const result = await window.api.activateLicense(key);
    if (result.valid) {
      elements.licenseModalFeedback.style.color = '#10b981';
      elements.licenseModalFeedback.textContent = 'License activated successfully! Enjoy Smart OCR.';
      await checkLicenseStatus();
      setTimeout(() => {
        elements.licenseModal.classList.remove('open');
      }, 1500);
    } else {
      elements.licenseModalFeedback.style.color = '#e11d48';
      elements.licenseModalFeedback.textContent = `Activation Failed: ${result.error || 'Invalid key.'}`;
    }
  }

  // --- Business Profiles & Category Presets ---
  function handleProfileChange(newProfileKey) {
    const profile = PROFILES[newProfileKey] || PROFILES.auto;
    state.activeProfile = newProfileKey;

    // 1. Update Category input if a specific profile is selected
    if (newProfileKey !== 'auto') {
      elements.inputCategory.value = profile.category;
    }

    // Update section title based on active profile
    if (elements.tableSectionTitle) {
      elements.tableSectionTitle.textContent = (newProfileKey === 'toll') 
        ? 'Toll Transaction & Tariff Breakdown' 
        : 'Line Items & Products';
    }

    // 2. If a document is ALREADY loaded in the viewer, update active context without altering canvas image
    if (state.currentFilePath || state.currentDataUrl) {
      if (state.activeQueueIndex >= 0 && state.queue[state.activeQueueIndex]) {
        state.queue[state.activeQueueIndex].category = profile.category;
        saveCurrentFormToQueueItem();
      }
      showToast(`Profile: ${profile.name}`);
      elements.systemStatusMsg.textContent = `Profile set to ${profile.name}. ${profile.tip}`;
    } else {
      // 3. When NO document is loaded (or form was cleared):
      // Best Practice: NEVER force-load a preview receipt image onto an empty canvas!
      showToast(`Profile: ${profile.name}`);
      elements.systemStatusMsg.textContent = `Profile: ${profile.name} active. Ready for new receipt upload.`;
    }
  }

  // --- Explicit Demo Receipt Loader (Triggered ONLY by user click on dropzone links) ---
  function setupDemoReceiptButtons() {
    document.querySelectorAll('.btn-demo-link').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const sampleFile = btn.dataset.sample;
        if (!sampleFile) return;

        // Auto-select matching profile in the dropdown
        if (sampleFile.includes('indomaret')) {
          elements.profileSelect.value = 'retail';
          state.activeProfile = 'retail';
        } else if (sampleFile.includes('kopi')) {
          elements.profileSelect.value = 'fnb';
          state.activeProfile = 'fnb';
        } else if (sampleFile.includes('apotek')) {
          elements.profileSelect.value = 'pharmacy';
          state.activeProfile = 'pharmacy';
        }

        const samplePath = await window.api.loadSample(sampleFile);
        if (samplePath) {
          addToQueue(samplePath);
          showToast(`Loaded sample: ${sampleFile.replace('sample_', '').replace('.png', '').toUpperCase()}`);
        }
      });
    });
  }

  // --- Document Loading Pipeline (Image or PDF) ---
  async function loadDocument(filePathOrData) {
    if (!filePathOrData) return;

    const isPdfFile = (typeof filePathOrData === 'string' && filePathOrData.toLowerCase().endsWith('.pdf')) ||
                      (typeof filePathOrData === 'string' && filePathOrData.startsWith('data:application/pdf'));

    if (isPdfFile) {
      await loadPdfDocument(filePathOrData);
    } else {
      state.isPdf = false;
      state.pdfDocument = null;
      elements.pdfPageNav.classList.add('hidden');
      await loadReceiptImage(filePathOrData);
    }
  }

  // --- PDF Document Handling ---
  async function loadPdfDocument(filePathOrData) {
    elements.progressBarContainer.classList.add('active');
    elements.progressBarFill.style.width = '15%';
    elements.systemStatusMsg.textContent = 'Opening PDF document...';

    state.isPdf = true;
    state.currentFilePath = typeof filePathOrData === 'string' && !filePathOrData.startsWith('data:') ? filePathOrData : null;
    const filename = state.currentFilePath ? state.currentFilePath.split(/[\\/]/).pop() : 'Document.pdf';
    elements.activeFileTitle.textContent = `${filename} (PDF)`;

    try {
      let uint8Array;
      if (state.currentFilePath) {
        const fileRes = await window.api.readBinaryFile(state.currentFilePath);
        if (!fileRes.success) throw new Error(fileRes.error);
        const binaryString = atob(fileRes.base64);
        uint8Array = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          uint8Array[i] = binaryString.charCodeAt(i);
        }
      } else if (typeof filePathOrData === 'string' && filePathOrData.startsWith('data:')) {
        const base64 = filePathOrData.split(',')[1];
        const binaryString = atob(base64);
        uint8Array = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          uint8Array[i] = binaryString.charCodeAt(i);
        }
      }

      const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
      state.pdfDocument = await loadingTask.promise;
      state.pdfTotalPages = state.pdfDocument.numPages;
      state.pdfCurrentPage = 1;

      // Update multi-page navigation controls
      if (state.pdfTotalPages > 1) {
        elements.pdfPageNav.classList.remove('hidden');
        elements.pdfPageIndicator.textContent = `Page 1 / ${state.pdfTotalPages}`;
      } else {
        elements.pdfPageNav.classList.add('hidden');
      }

      await renderAndProcessPdfPage(1);

    } catch (err) {
      console.error('PDF error:', err);
      elements.systemStatusMsg.textContent = `PDF Error: ${err.message}`;
    } finally {
      setTimeout(() => {
        elements.progressBarContainer.classList.remove('active');
        elements.progressBarFill.style.width = '0%';
      }, 500);
    }
  }

  async function renderAndProcessPdfPage(pageNumber) {
    if (!state.pdfDocument) return;

    elements.systemStatusMsg.textContent = `Rendering PDF Page ${pageNumber} of ${state.pdfTotalPages}...`;
    elements.progressBarContainer.classList.add('active');
    elements.progressBarFill.style.width = '30%';

    const page = await state.pdfDocument.getPage(pageNumber);
    // Render at 2.0x scale (150-200 DPI) for crystal clear OCR
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = elements.pdfRenderCanvas;
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');

    await page.render({ canvasContext: ctx, viewport }).promise;

    const dataUrl = canvas.toDataURL('image/png');
    state.currentDataUrl = dataUrl;

    // Display rendered PDF page in viewport
    elements.receiptImage.src = dataUrl;
    elements.receiptImage.classList.remove('hidden');
    elements.dropOverlay.classList.add('hidden');
    state.zoom = 1;
    state.pan = { x: 0, y: 0 };
    updateImageTransform();

    // Check if the PDF has a digital text layer
    elements.systemStatusMsg.textContent = 'Extracting document text...';
    elements.progressBarFill.style.width = '60%';
    const textContent = await page.getTextContent();
    const digitalText = textContent.items
      .map(item => item.str)
      .join(' ')
      .trim();

    // If digital text contains substantive receipt content (> 40 chars), use digital parser directly!
    if (digitalText.length > 40 && (digitalText.includes('Total') || digitalText.includes('TOTAL') || /\d+[.,]\d{3}/.test(digitalText))) {
      // Reconstruct lines using item positions or newlines
      let formattedLines = [];
      let currentLine = '';
      let lastY = null;
      textContent.items.forEach(item => {
        const y = item.transform ? Math.round(item.transform[5]) : null;
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 5) {
          if (currentLine.trim()) formattedLines.push(currentLine.trim());
          currentLine = item.str;
        } else {
          currentLine += (currentLine ? ' ' : '') + item.str;
        }
        lastY = y;
      });
      if (currentLine.trim()) formattedLines.push(currentLine.trim());

      const fullText = formattedLines.join('\n');
      const parseRes = await window.api.parseRawText(fullText);

      if (parseRes.success && parseRes.parsed.items.length > 0) {
        state.words = [];
        renderBoundingBoxes([], 0, 0);
        populateFormData(parseRes.parsed, 98, fullText);
        if (state.activeQueueIndex >= 0 && state.queue[state.activeQueueIndex]) {
          const qItem = state.queue[state.activeQueueIndex];
          qItem.status = parseRes.parsed.validation?.isBalanced ? 'verified' : 'discrepancy';
          qItem.parsed = parseRes.parsed;
          qItem.rawText = fullText;
          qItem.confidence = 98;
          renderQueueList();
        }
        elements.systemStatusMsg.textContent = `Digital PDF processed instantly with 100% precision.`;
        elements.btnRerunOcr.disabled = false;
        return;
      }
    }

    // Otherwise, or if digital text is empty/scanned, feed the rendered page image into Tesseract OCR!
    elements.systemStatusMsg.textContent = 'Running OCR on rendered PDF page...';
    elements.progressBarFill.style.width = '75%';
    await loadReceiptImage(dataUrl);
  }

  // --- OCR & Image Document Pipeline ---
  async function loadReceiptImage(filePathOrData) {
    if (!filePathOrData) return;

    if (!state.isPdf) {
      state.currentFilePath = typeof filePathOrData === 'string' && !filePathOrData.startsWith('data:') ? filePathOrData : null;
      const filename = state.currentFilePath ? state.currentFilePath.split(/[\\/]/).pop() : 'Document';
      elements.activeFileTitle.textContent = filename;
    }

    state.rotation = 0;
    state.zoom = 1;
    state.pan = { x: 0, y: 0 };
    elements.systemStatusMsg.textContent = `Processing document...`;
    elements.btnRerunOcr.disabled = false;

    // Show progress bar
    elements.progressBarContainer.classList.add('active');
    elements.progressBarFill.style.width = '10%';

    try {
      const res = await window.api.processReceipt(filePathOrData, {
        preset: state.preset,
        rotation: state.rotation
      });

      if (!res.success) {
        throw new Error(res.error || 'OCR processing failed');
      }

      // Display image
      state.currentDataUrl = res.previewDataUrl;
      elements.receiptImage.src = res.previewDataUrl;
      elements.receiptImage.classList.remove('hidden');
      elements.dropOverlay.classList.add('hidden');
      
      // Store bounding boxes & image dimensions
      state.words = res.words || [];
      state.imageWidth = res.imageWidth || 0;
      state.imageHeight = res.imageHeight || 0;
      renderBoundingBoxes(state.words, state.imageWidth, state.imageHeight);

      updateImageTransform();

      // Populate form data
      populateFormData(res.parsed, res.ocrConfidence, res.rawText);

      // Update current queue item if one is selected
      if (state.activeQueueIndex >= 0 && state.queue[state.activeQueueIndex]) {
        const item = state.queue[state.activeQueueIndex];
        item.status = res.parsed.validation?.isBalanced ? 'verified' : 'discrepancy';
        item.parsed = res.parsed;
        item.rawText = res.rawText;
        item.confidence = res.ocrConfidence;
        item.words = state.words;
        item.imageWidth = state.imageWidth;
        item.imageHeight = state.imageHeight;
        item.previewDataUrl = res.previewDataUrl;
        renderQueueList();
      }

      elements.systemStatusMsg.textContent = `OCR complete (${Math.round(res.ocrConfidence)}% confidence). Review fields below.`;
    } catch (err) {
      console.error(err);
      elements.systemStatusMsg.textContent = `Error: ${err.message}`;
    } finally {
      setTimeout(() => {
        elements.progressBarContainer.classList.remove('active');
        elements.progressBarFill.style.width = '0%';
      }, 500);
    }
  }

  function setupOcrProgressListener() {
    window.api.onOcrProgress((data) => {
      if (data.progress !== undefined) {
        elements.progressBarFill.style.width = `${Math.round(data.progress * 100)}%`;
      }
      if (data.message) {
        elements.systemStatusMsg.textContent = data.message;
      }
    });
  }

  function populateFormData(parsed, confidence, rawText) {
    state.rawText = rawText || '';
    elements.rawTextContent.value = rawText || '';

    elements.ocrConfidenceTag.textContent = `Confidence: ${Math.round(confidence || 0)}%`;
    elements.inputMerchant.value = parsed.merchant || '';
    elements.inputCategory.value = parsed.category || 'Retail / Office';
    elements.inputDate.value = parsed.date || '';
    elements.inputTime.value = parsed.time || '';
    elements.inputInvoice.value = parsed.invoiceNumber || '';
    elements.inputPayment.value = parsed.paymentMethod || 'CASH';

    // Auto-detect profile feedback if running in auto mode
    if (state.activeProfile === 'auto' && parsed.detectedProfile && parsed.detectedProfile !== 'auto') {
      const detectedInfo = PROFILES[parsed.detectedProfile];
      if (detectedInfo) {
        showToast(`Auto-detected: ${detectedInfo.name}`);
        elements.systemStatusMsg.textContent = `Auto-detected ${detectedInfo.name}. ${detectedInfo.tip}`;
      }
    }

    // Dynamic section title for Toll vs Retail
    const isTollActive = (parsed.detectedProfile === 'toll' || state.activeProfile === 'toll');
    if (elements.tableSectionTitle) {
      elements.tableSectionTitle.textContent = isTollActive 
        ? 'Toll Transaction & Tariff Breakdown' 
        : 'Line Items & Products';
    }

    elements.inputTax.value = parsed.tax || 0;
    elements.inputService.value = parsed.serviceCharge || 0;
    elements.inputDiscount.value = parsed.discount || 0;
    state.detectedTotal = parsed.total || 0;

    state.items = (parsed.items || []).map(i => ({
      description: i.description || '',
      qty: i.qty || 1,
      unitPrice: i.unitPrice || 0,
      total: i.total || 0
    }));

    renderLineItemsTable();
    recalculateTotals();
  }

  // --- Line Items Table Management ---
  function renderLineItemsTable() {
    elements.itemsTableBody.innerHTML = '';
    const isTollActive = (state.activeProfile === 'toll' || elements.inputCategory.value === 'Transport & Toll');

    if (state.items.length === 0) {
      const tr = document.createElement('tr');
      const emptyMsg = isTollActive
        ? 'No toll tariff extracted. Click "+ Add Line Item" to enter tariff manually.'
        : 'No line items extracted. Click "+ Add Line Item" to enter manually.';
      tr.innerHTML = `<td colspan="6" style="text-align: center; color: var(--text-muted); padding: 16px;">${emptyMsg}</td>`;
      elements.itemsTableBody.appendChild(tr);
      return;
    }

    state.items.forEach((item, index) => {
      const tr = document.createElement('tr');
      const placeholderText = isTollActive ? 'Toll tariff details (e.g. Gerbang / Golongan)...' : 'Product name...';
      tr.innerHTML = `
        <td style="text-align: center; color: var(--text-muted); font-size: 11px;">${index + 1}</td>
        <td>
          <input type="text" class="table-input item-desc" data-index="${index}" value="${escapeHtml(item.description)}" placeholder="${placeholderText}" />
        </td>
        <td style="width: 70px;">
          <input type="number" class="table-input mono item-qty" data-index="${index}" value="${item.qty}" min="1" step="1" />
        </td>
        <td style="width: 130px;">
          <input type="number" class="table-input mono item-price" data-index="${index}" value="${item.unitPrice}" step="100" />
        </td>
        <td style="width: 140px;">
          <input type="number" class="table-input mono item-total" data-index="${index}" value="${item.total}" step="100" style="font-weight: 600;" />
        </td>
        <td class="col-action">
          <button class="btn-remove-row" data-index="${index}" title="Remove item">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </td>
      `;
      elements.itemsTableBody.appendChild(tr);
    });

    // Attach row events
    elements.itemsTableBody.querySelectorAll('.item-desc').forEach(input => {
      input.addEventListener('input', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        state.items[idx].description = e.target.value;
      });
    });

    elements.itemsTableBody.querySelectorAll('.item-qty').forEach(input => {
      input.addEventListener('input', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        const qty = parseFloat(e.target.value) || 1;
        state.items[idx].qty = qty;
        state.items[idx].total = Math.round(qty * (state.items[idx].unitPrice || 0));
        
        const totalInput = elements.itemsTableBody.querySelector(`.item-total[data-index="${idx}"]`);
        if (totalInput) totalInput.value = state.items[idx].total;
        recalculateTotals();
      });
    });

    elements.itemsTableBody.querySelectorAll('.item-price').forEach(input => {
      input.addEventListener('input', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        const price = parseFloat(e.target.value) || 0;
        state.items[idx].unitPrice = price;
        state.items[idx].total = Math.round((state.items[idx].qty || 1) * price);

        const totalInput = elements.itemsTableBody.querySelector(`.item-total[data-index="${idx}"]`);
        if (totalInput) totalInput.value = state.items[idx].total;
        recalculateTotals();
      });
    });

    elements.itemsTableBody.querySelectorAll('.item-total').forEach(input => {
      input.addEventListener('input', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        const total = parseFloat(e.target.value) || 0;
        state.items[idx].total = total;
        state.items[idx].unitPrice = Math.round(total / (state.items[idx].qty || 1));

        const priceInput = elements.itemsTableBody.querySelector(`.item-price[data-index="${idx}"]`);
        if (priceInput) priceInput.value = state.items[idx].unitPrice;
        recalculateTotals();
      });
    });

    elements.itemsTableBody.querySelectorAll('.btn-remove-row').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index, 10);
        state.items.splice(idx, 1);
        renderLineItemsTable();
        recalculateTotals();
      });
    });
  }

  function addEmptyLineItem() {
    state.items.push({
      description: '',
      qty: 1,
      unitPrice: 0,
      total: 0
    });
    renderLineItemsTable();
    const inputs = elements.itemsTableBody.querySelectorAll('.item-desc');
    if (inputs.length > 0) {
      inputs[inputs.length - 1].focus();
    }
  }

  function recalculateTotals() {
    const subtotal = state.items.reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0);
    const tax = parseFloat(elements.inputTax.value) || 0;
    const service = parseFloat(elements.inputService.value) || 0;
    const discount = parseFloat(elements.inputDiscount.value) || 0;
    const grandTotal = Math.max(0, subtotal + tax + service - discount);

    elements.displaySubtotal.textContent = formatIdr(subtotal);
    elements.displayGrandTotal.textContent = formatIdr(grandTotal);

    // Math Balance Verification Check
    const target = state.detectedTotal || grandTotal;
    const diff = Math.abs(grandTotal - target);

    if (diff <= 100) {
      elements.verificationStatusBadge.className = 'verification-status balanced';
      elements.verificationStatusBadge.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        <span>Math Balanced</span>
      `;
      elements.verificationDetailText.textContent = `Line items sum matches detected receipt total (${formatIdr(grandTotal)}).`;
    } else {
      elements.verificationStatusBadge.className = 'verification-status unbalanced';
      elements.verificationStatusBadge.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span>Discrepancy: ${formatIdr(diff)}</span>
      `;
      elements.verificationDetailText.textContent = `Calculated items (${formatIdr(grandTotal)}) differ from scanned total (${formatIdr(target)}). Check OCR digits.`;
    }
  }

  // --- Image Viewer: Pan & Zoom Interactions ---
  function setupCanvasInteractions() {
    const viewport = elements.canvasViewport;

    viewport.addEventListener('wheel', (e) => {
      if (elements.receiptImage.classList.contains('hidden')) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      state.zoom = Math.min(Math.max(0.2, state.zoom + delta), 4.0);
      updateImageTransform();
    });

    viewport.addEventListener('mousedown', (e) => {
      if (elements.receiptImage.classList.contains('hidden')) return;
      state.isPanning = true;
      viewport.classList.add('grabbing');
      state.panStart = { x: e.clientX - state.pan.x, y: e.clientY - state.pan.y };
    });

    window.addEventListener('mousemove', (e) => {
      if (!state.isPanning) return;
      state.pan.x = e.clientX - state.panStart.x;
      state.pan.y = e.clientY - state.panStart.y;
      updateImageTransform();
    });

    window.addEventListener('mouseup', () => {
      state.isPanning = false;
      viewport.classList.remove('grabbing');
    });

    // Zoom buttons
    elements.btnZoomIn.addEventListener('click', () => {
      state.zoom = Math.min(4.0, state.zoom + 0.2);
      updateImageTransform();
    });

    elements.btnZoomOut.addEventListener('click', () => {
      state.zoom = Math.max(0.2, state.zoom - 0.2);
      updateImageTransform();
    });

    elements.btnZoomReset.addEventListener('click', () => {
      state.zoom = 1.0;
      state.pan = { x: 0, y: 0 };
      updateImageTransform();
    });

    elements.btnRotate.addEventListener('click', async () => {
      state.rotation = (state.rotation + 90) % 360;
      await updatePreprocessingPreview();
    });

    elements.presetSelect.addEventListener('change', async (e) => {
      state.preset = e.target.value;
      await updatePreprocessingPreview();
    });

    // PDF Page Switchers
    elements.btnPrevPage.addEventListener('click', async () => {
      if (!state.isPdf || state.pdfCurrentPage <= 1) return;
      state.pdfCurrentPage--;
      elements.pdfPageIndicator.textContent = `Page ${state.pdfCurrentPage} / ${state.pdfTotalPages}`;
      await renderAndProcessPdfPage(state.pdfCurrentPage);
    });

    elements.btnNextPage.addEventListener('click', async () => {
      if (!state.isPdf || state.pdfCurrentPage >= state.pdfTotalPages) return;
      state.pdfCurrentPage++;
      elements.pdfPageIndicator.textContent = `Page ${state.pdfCurrentPage} / ${state.pdfTotalPages}`;
      await renderAndProcessPdfPage(state.pdfCurrentPage);
    });
  }

  async function updatePreprocessingPreview() {
    if (!state.currentFilePath && !state.currentDataUrl) return;
    const input = state.currentDataUrl || state.currentFilePath;
    elements.systemStatusMsg.textContent = 'Applying image filter...';

    const res = await window.api.preprocessImage(input, {
      preset: state.preset,
      rotation: state.rotation
    });

    if (res.success) {
      elements.receiptImage.src = res.dataUrl;
      elements.systemStatusMsg.textContent = `Applied ${state.preset} filter (${state.rotation}°).`;
    }
  }

  function updateImageTransform() {
    if (elements.canvasTransformLayer) {
      elements.canvasTransformLayer.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`;
    } else if (elements.receiptImage) {
      elements.receiptImage.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`;
    }
  }

  // --- Interactive OCR Bounding Boxes (Click-to-Field) ---
  function renderBoundingBoxes(words, imgWidth, imgHeight) {
    if (!elements.ocrBoxesOverlay) return;
    elements.ocrBoxesOverlay.innerHTML = '';

    if (!words || !words.length || !imgWidth || !imgHeight) {
      elements.ocrBoxesOverlay.classList.add('hidden');
      return;
    }

    if (state.showOcrBoxes) {
      elements.ocrBoxesOverlay.classList.remove('hidden');
    } else {
      elements.ocrBoxesOverlay.classList.add('hidden');
    }

    words.forEach(word => {
      if (!word.bbox || !word.text) return;
      const b = word.bbox;
      const left = (b.x0 / imgWidth) * 100;
      const top = (b.y0 / imgHeight) * 100;
      const width = ((b.x1 - b.x0) / imgWidth) * 100;
      const height = ((b.y1 - b.y0) / imgHeight) * 100;

      const box = document.createElement('div');
      box.className = 'ocr-bbox';
      box.style.left = `${left}%`;
      box.style.top = `${top}%`;
      box.style.width = `${Math.max(width, 0.4)}%`;
      box.style.height = `${Math.max(height, 0.4)}%`;
      box.setAttribute('data-text', word.text);
      box.title = `Click to insert "${word.text}" into active form field`;

      box.addEventListener('click', (e) => {
        e.stopPropagation();
        handleBoxClick(word.text);
      });

      elements.ocrBoxesOverlay.appendChild(box);
    });
  }

  function handleBoxClick(wordText) {
    if (!wordText) return;
    const cleanWord = wordText.trim();

    if (state.lastFocusedInput && document.body.contains(state.lastFocusedInput)) {
      const input = state.lastFocusedInput;
      if (input.type === 'number') {
        const num = cleanWord.replace(/[^0-9]/g, '');
        if (num) {
          input.value = num;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      } else {
        if (input.value && !input.value.endsWith(' ')) {
          input.value += ' ' + cleanWord;
        } else {
          input.value = (input.value || '') + cleanWord;
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      input.focus();
      showToast(`Inserted "${cleanWord}" into active field`);
    } else {
      navigator.clipboard.writeText(cleanWord);
      showToast(`Copied "${cleanWord}" to clipboard`);
    }
  }

  let toastTimer = null;
  function showToast(text) {
    if (!elements.toastMsg) return;
    elements.toastText.textContent = text;
    elements.toastMsg.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      elements.toastMsg.classList.remove('show');
    }, 2200);
  }

  // --- Excel Export ---
  async function handleExportExcel() {
    if (state.items.length === 0 && !elements.inputMerchant.value) {
      alert('No receipt data to export. Please load and process a receipt or document first.');
      return;
    }

    const merchantClean = (elements.inputMerchant.value || 'Receipt').replace(/[^a-zA-Z0-9]/g, '_');
    const dateClean = (elements.inputDate.value || 'Today').replace(/[^0-9-]/g, '');
    const defaultFilename = `SmartOCR_${merchantClean}_${dateClean}.xlsx`;

    const targetPath = await window.api.saveExcelDialog(defaultFilename);
    if (!targetPath) return;

    elements.systemStatusMsg.textContent = 'Generating Excel spreadsheet...';

    const subtotal = state.items.reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0);
    const tax = parseFloat(elements.inputTax.value) || 0;
    const service = parseFloat(elements.inputService.value) || 0;
    const discount = parseFloat(elements.inputDiscount.value) || 0;
    const grandTotal = Math.max(0, subtotal + tax + service - discount);

    const receiptData = {
      merchant: elements.inputMerchant.value,
      category: elements.inputCategory.value,
      date: elements.inputDate.value,
      time: elements.inputTime.value,
      invoiceNumber: elements.inputInvoice.value,
      paymentMethod: elements.inputPayment.value,
      cashier: '',
      subtotal,
      tax,
      serviceCharge: service,
      discount,
      total: grandTotal,
      items: state.items,
      validation: {
        isBalanced: Math.abs(grandTotal - (state.detectedTotal || grandTotal)) <= 100
      }
    };

    const result = await window.api.exportSingleExcel(receiptData, targetPath);
    if (result.success) {
      elements.systemStatusMsg.textContent = `Exported successfully to: ${targetPath}`;
      alert(`Excel exported successfully!\nSaved to: ${targetPath}`);
    } else {
      elements.systemStatusMsg.textContent = `Export error: ${result.error}`;
      alert(`Export error: ${result.error}`);
    }
  }

  // --- Batch Document Queue Management ---
  function saveCurrentFormToQueueItem() {
    if (state.activeQueueIndex < 0 || !state.queue[state.activeQueueIndex]) return;
    const cur = state.queue[state.activeQueueIndex];
    const subtotal = state.items.reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0);
    const tax = parseFloat(elements.inputTax.value) || 0;
    const service = parseFloat(elements.inputService.value) || 0;
    const discount = parseFloat(elements.inputDiscount.value) || 0;
    const grandTotal = Math.max(0, subtotal + tax + service - discount);

    cur.parsed = {
      merchant: elements.inputMerchant.value,
      category: elements.inputCategory.value,
      date: elements.inputDate.value,
      time: elements.inputTime.value,
      invoiceNumber: elements.inputInvoice.value,
      paymentMethod: elements.inputPayment.value,
      cashier: cur.parsed?.cashier || '',
      subtotal,
      tax,
      serviceCharge: service,
      discount,
      total: grandTotal,
      items: state.items.slice(),
      validation: {
        isBalanced: Math.abs(grandTotal - (state.detectedTotal || grandTotal)) <= 100
      }
    };
    cur.rawText = state.rawText;
    cur.words = state.words;
    cur.imageWidth = state.imageWidth;
    cur.imageHeight = state.imageHeight;
    cur.status = cur.parsed.validation.isBalanced ? 'verified' : 'discrepancy';
  }

  function addToQueue(filePathsOrData) {
    if (!filePathsOrData) return;
    const list = Array.isArray(filePathsOrData) ? filePathsOrData : [filePathsOrData];
    if (list.length === 0) return;

    const previousLength = state.queue.length;

    list.forEach(filePath => {
      const filename = typeof filePath === 'string' && !filePath.startsWith('data:') 
        ? filePath.split(/[\\/]/).pop() 
        : `Document_${state.queue.length + 1}`;
      
      state.queue.push({
        id: 'q_' + Math.random().toString(36).substring(2, 9),
        filePath,
        filename,
        isPdf: filename.toLowerCase().endsWith('.pdf'),
        status: 'pending',
        parsed: null,
        rawText: '',
        words: [],
        confidence: 0,
        previewDataUrl: null,
        imageWidth: 0,
        imageHeight: 0
      });
    });

    elements.queueBadgeCount.textContent = state.queue.length;
    elements.headerQueueCount.textContent = state.queue.length;
    elements.queueDrawer.classList.remove('collapsed');

    renderQueueList();

    // If queue was empty or nothing was active, switch to first newly added item
    if (previousLength === 0 || state.activeQueueIndex === -1) {
      selectQueueItem(previousLength);
    }
  }

  function renderQueueList() {
    if (!elements.queueList) return;
    elements.queueList.innerHTML = '';

    if (state.queue.length === 0) {
      elements.queueList.innerHTML = '<div class="queue-empty-msg">No documents in queue.<br>Drop multiple files or click "Open File(s)".</div>';
      elements.queueBadgeCount.textContent = '0';
      elements.headerQueueCount.textContent = '0';
      return;
    }

    elements.queueBadgeCount.textContent = state.queue.length;
    elements.headerQueueCount.textContent = state.queue.length;

    state.queue.forEach((item, idx) => {
      const card = document.createElement('div');
      card.className = `queue-item ${idx === state.activeQueueIndex ? 'active' : ''}`;
      
      const totalText = item.parsed?.total ? formatIdr(item.parsed.total) : (item.status === 'pending' ? 'Pending' : 'Rp 0');
      const merchantText = item.parsed?.merchant || item.filename;

      card.innerHTML = `
        <div class="queue-item-row-top">
          <span class="queue-item-title" title="${escapeHtml(merchantText)}">${escapeHtml(merchantText)}</span>
          <div style="display: flex; align-items: center; gap: 4px;">
            <span class="queue-item-status-dot ${item.status}" title="Status: ${item.status}"></span>
            <button class="btn-queue-delete-item" data-index="${idx}" title="Delete this receipt from queue">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
        <div class="queue-item-row-bottom">
          <span>${item.parsed?.items?.length ? item.parsed.items.length + ' items' : (item.isPdf ? 'PDF' : 'Image')}</span>
          <span style="font-family: var(--font-mono); font-weight: 600;">${totalText}</span>
        </div>
      `;

      const delBtn = card.querySelector('.btn-queue-delete-item');
      if (delBtn) {
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteQueueItem(idx);
        });
      }

      card.addEventListener('click', () => {
        if (state.activeQueueIndex !== idx) {
          saveCurrentFormToQueueItem();
          selectQueueItem(idx);
        }
      });

      elements.queueList.appendChild(card);
    });
  }

  function deleteQueueItem(index) {
    if (index < 0 || index >= state.queue.length) return;
    const removed = state.queue[index];
    const isDeletingActive = (state.activeQueueIndex === index);

    state.queue.splice(index, 1);

    if (state.queue.length === 0) {
      clearAllFormData();
      renderQueueList();
      showToast(`Removed ${removed.filename} from queue`);
      return;
    }

    if (isDeletingActive) {
      const nextIndex = Math.min(index, state.queue.length - 1);
      selectQueueItem(nextIndex);
    } else if (state.activeQueueIndex > index) {
      state.activeQueueIndex--;
      renderQueueList();
    } else {
      renderQueueList();
    }

    showToast(`Removed ${removed.filename}`);
  }

  function deleteAllQueue() {
    if (state.queue.length === 0) {
      showToast('Queue is already empty');
      return;
    }

    if (confirm(`Are you sure you want to delete all ${state.queue.length} documents from the queue?`)) {
      const count = state.queue.length;
      state.queue = [];
      clearAllFormData();
      renderQueueList();
      showToast(`Cleared all ${count} documents from queue`);
    }
  }

  async function selectQueueItem(index) {
    if (index < 0 || index >= state.queue.length) return;
    state.activeQueueIndex = index;
    renderQueueList();

    const item = state.queue[index];

    // If item already has parsed data and image preview cached, restore directly!
    if (item.parsed && (item.previewDataUrl || state.currentDataUrl)) {
      state.isPdf = item.isPdf;
      state.currentFilePath = typeof item.filePath === 'string' && !item.filePath.startsWith('data:') ? item.filePath : null;
      elements.activeFileTitle.textContent = `${item.filename} (Queue #${index + 1})`;

      if (item.previewDataUrl) {
        state.currentDataUrl = item.previewDataUrl;
        elements.receiptImage.src = item.previewDataUrl;
        elements.receiptImage.classList.remove('hidden');
        elements.dropOverlay.classList.add('hidden');
      }

      state.words = item.words || [];
      state.imageWidth = item.imageWidth || 0;
      state.imageHeight = item.imageHeight || 0;
      renderBoundingBoxes(state.words, state.imageWidth, state.imageHeight);
      updateImageTransform();

      populateFormData(item.parsed, item.confidence || 95, item.rawText);
      elements.systemStatusMsg.textContent = `Loaded #${index + 1} from queue (${item.status}).`;
      return;
    }

    // Otherwise, load and process document
    await loadDocument(item.filePath);
  }

  async function processAllQueueRemaining() {
    saveCurrentFormToQueueItem();
    const pendingIndices = state.queue
      .map((item, idx) => item.status === 'pending' ? idx : -1)
      .filter(idx => idx !== -1);

    if (pendingIndices.length === 0) {
      showToast('All documents in queue are already processed.');
      return;
    }

    elements.systemStatusMsg.textContent = `Batch processing ${pendingIndices.length} document(s)...`;

    for (let i = 0; i < pendingIndices.length; i++) {
      const idx = pendingIndices[i];
      await selectQueueItem(idx);
      saveCurrentFormToQueueItem();
      renderQueueList();
    }

    showToast(`Batch OCR complete! ${pendingIndices.length} documents processed.`);
    elements.systemStatusMsg.textContent = 'All queue documents processed. Ready for Master Export.';
  }

  async function exportBatchMasterExcel() {
    saveCurrentFormToQueueItem();

    const readyItems = state.queue
      .filter(q => q.parsed && (q.parsed.items?.length > 0 || q.parsed.merchant || q.parsed.total > 0))
      .map(q => q.parsed);

    if (readyItems.length === 0) {
      alert('No processed receipts found in queue. Please process documents before exporting.');
      return;
    }

    const defaultFilename = `SmartOCR_Master_Ledger_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const targetPath = await window.api.saveExcelDialog(defaultFilename);
    if (!targetPath) return;

    elements.systemStatusMsg.textContent = `Exporting ${readyItems.length} receipts to Master Excel...`;

    const res = await window.api.exportBatchExcel(readyItems, targetPath);
    if (res.success) {
      elements.systemStatusMsg.textContent = `Master Excel created successfully: ${targetPath}`;
      showToast(`Master Excel Exported (${readyItems.length} receipts)!`);
      alert(`Master Accounting Ledger exported successfully!\n\n${readyItems.length} receipts saved into consolidated multi-tab workbook at:\n${targetPath}`);
    } else {
      elements.systemStatusMsg.textContent = `Batch export failed: ${res.error}`;
      alert(`Batch Export Failed: ${res.error}`);
    }
  }

  // --- Robust Form & Canvas Reset ---
  function clearAllFormData() {
    state.items = [];
    state.currentFilePath = null;
    state.currentDataUrl = null;
    state.isPdf = false;
    state.pdfDocument = null;
    state.words = [];
    state.rawText = '';
    state.detectedTotal = 0;
    state.activeQueueIndex = -1;

    // Reset and hide preview image completely
    elements.receiptImage.src = '';
    elements.receiptImage.classList.add('hidden');
    elements.ocrBoxesOverlay.innerHTML = '';
    elements.ocrBoxesOverlay.classList.add('hidden');
    elements.pdfPageNav.classList.add('hidden');
    elements.dropOverlay.classList.remove('hidden');

    state.zoom = 1;
    state.pan = { x: 0, y: 0 };
    updateImageTransform();

    // Reset form fields
    elements.activeFileTitle.textContent = 'No document active';
    elements.ocrConfidenceTag.textContent = 'Confidence: -';
    elements.inputMerchant.value = '';

    const profile = PROFILES[state.activeProfile] || PROFILES.auto;
    elements.inputCategory.value = state.activeProfile !== 'auto' ? profile.category : '';

    elements.inputDate.value = '';
    elements.inputTime.value = '';
    elements.inputInvoice.value = '';
    elements.inputPayment.value = 'CASH';
    elements.inputTax.value = '0';
    elements.inputService.value = '0';
    elements.inputDiscount.value = '0';
    elements.rawTextContent.value = '';

    renderLineItemsTable();
    recalculateTotals();
    renderQueueList();

    elements.btnRerunOcr.disabled = true;
    elements.systemStatusMsg.textContent = 'Form cleared. Canvas empty and ready for new document.';
    showToast('Form cleared');
  }

  // --- Drag and Drop & User Interaction Handlers ---
  function setupEventListeners() {
    // Open Dialog (Single or Multiple documents)
    const handleOpenFiles = async () => {
      const files = await window.api.openImageDialog();
      if (files && files.length > 0) {
        if (files.length === 1 && state.queue.length === 0) {
          addToQueue(files);
        } else {
          addToQueue(files);
        }
      }
    };

    elements.btnOpenFiles.addEventListener('click', handleOpenFiles);
    elements.btnBrowseEmpty.addEventListener('click', handleOpenFiles);

    // Queue Drawer & Batch Buttons
    if (elements.btnToggleQueue) {
      elements.btnToggleQueue.addEventListener('click', () => {
        elements.queueDrawer.classList.toggle('collapsed');
      });
    }

    if (elements.btnProcessAllQueue) {
      elements.btnProcessAllQueue.addEventListener('click', processAllQueueRemaining);
    }

    if (elements.btnExportBatchMaster) {
      elements.btnExportBatchMaster.addEventListener('click', exportBatchMasterExcel);
    }

    // Queue Trash Actions (Clear Selected or Clear All)
    if (elements.btnQueueTrash) {
      elements.btnQueueTrash.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.queueTrashMenu.classList.toggle('hidden');
      });
    }

    if (elements.btnDeleteSelectedQueue) {
      elements.btnDeleteSelectedQueue.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.queueTrashMenu.classList.add('hidden');
        if (state.activeQueueIndex >= 0 && state.queue[state.activeQueueIndex]) {
          deleteQueueItem(state.activeQueueIndex);
        } else {
          showToast('No queue document selected');
        }
      });
    }

    if (elements.btnDeleteAllQueue) {
      elements.btnDeleteAllQueue.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.queueTrashMenu.classList.add('hidden');
        deleteAllQueue();
      });
    }

    // Close trash menu popover when clicking anywhere outside
    document.addEventListener('click', (e) => {
      if (elements.queueTrashMenu && !elements.queueTrashMenu.classList.contains('hidden')) {
        if (!e.target.closest('#btnQueueTrash') && !e.target.closest('#queueTrashMenu')) {
          elements.queueTrashMenu.classList.add('hidden');
        }
      }
    });

    // Toggle OCR Bounding Boxes
    if (elements.btnToggleBBox) {
      elements.btnToggleBBox.addEventListener('click', () => {
        state.showOcrBoxes = !state.showOcrBoxes;
        elements.btnToggleBBox.classList.toggle('active', state.showOcrBoxes);
        if (elements.ocrBoxesOverlay) {
          elements.ocrBoxesOverlay.classList.toggle('hidden', !state.showOcrBoxes);
        }
        showToast(state.showOcrBoxes ? 'OCR Word Boxes Visible' : 'OCR Word Boxes Hidden');
      });
    }

    // Focus tracking for interactive click-to-field
    document.addEventListener('focusin', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
        if (e.target.id !== 'licenseKeyInput' && e.target.id !== 'rawTextContent') {
          state.lastFocusedInput = e.target;
        }
      }
    });

    // Keyboard Shortcuts (Ctrl+Enter to advance queue, Alt+A for line item)
    window.addEventListener('keydown', (e) => {
      // Ctrl + Enter: Confirm current item & advance
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        saveCurrentFormToQueueItem();
        renderQueueList();
        if (state.queue.length > 0 && state.activeQueueIndex < state.queue.length - 1) {
          showToast(`Saved #${state.activeQueueIndex + 1}. Loading next...`);
          selectQueueItem(state.activeQueueIndex + 1);
        } else {
          showToast('Current receipt saved and verified.');
        }
      }
      // Alt + A: Add row
      if (e.altKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        addEmptyLineItem();
      }
    });

    // Business Profile Selector (Switches parsing & category profile WITHOUT injecting preview images)
    if (elements.profileSelect) {
      elements.profileSelect.addEventListener('change', (e) => {
        handleProfileChange(e.target.value);
      });
    }

    // Re-run OCR
    elements.btnRerunOcr.addEventListener('click', () => {
      if (state.isPdf && state.pdfDocument) {
        renderAndProcessPdfPage(state.pdfCurrentPage);
      } else if (state.currentFilePath) {
        loadReceiptImage(state.currentFilePath);
      } else if (state.currentDataUrl) {
        loadReceiptImage(state.currentDataUrl);
      }
    });

    // Clear Form (Resets canvas, preview image, bounding boxes, and fields cleanly)
    elements.btnClear.addEventListener('click', () => {
      if (confirm('Clear form and reset all fields?')) {
        clearAllFormData();
      }
    });

    // Add Row
    elements.btnAddRow.addEventListener('click', addEmptyLineItem);

    // Totals Inputs
    ['inputTax', 'inputService', 'inputDiscount'].forEach(id => {
      document.getElementById(id).addEventListener('input', () => {
        recalculateTotals();
        saveCurrentFormToQueueItem();
      });
    });

    // Form inputs change tracking
    ['inputMerchant', 'inputCategory', 'inputDate', 'inputTime', 'inputInvoice', 'inputPayment'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => {
          saveCurrentFormToQueueItem();
        });
      }
    });

    // Tabs
    elements.tabFormBtn.addEventListener('click', () => {
      elements.tabFormBtn.classList.add('active');
      elements.tabRawBtn.classList.remove('active');
      elements.formTabContent.classList.remove('hidden');
      elements.rawTabContent.classList.add('hidden');
    });

    elements.tabRawBtn.addEventListener('click', () => {
      elements.tabRawBtn.classList.add('active');
      elements.tabFormBtn.classList.remove('active');
      elements.rawTabContent.classList.remove('hidden');
      elements.formTabContent.classList.add('hidden');
    });

    // Export Excel
    elements.btnExportExcel.addEventListener('click', handleExportExcel);

    // License Modal
    elements.licenseBadge.addEventListener('click', () => {
      elements.licenseModal.classList.add('open');
      elements.licenseModalFeedback.textContent = '';
      elements.licenseKeyInput.value = '';
    });

    elements.btnCloseLicenseModal.addEventListener('click', () => {
      elements.licenseModal.classList.remove('open');
    });

    elements.btnCancelLicense.addEventListener('click', () => {
      elements.licenseModal.classList.remove('open');
    });

    elements.btnCopyUid.addEventListener('click', () => {
      const uid = elements.modalDeviceUid.textContent;
      navigator.clipboard.writeText(uid).then(() => {
        elements.btnCopyUid.textContent = 'Copied!';
        setTimeout(() => { elements.btnCopyUid.textContent = 'Copy UID'; }, 2000);
      });
    });

    elements.btnActivateLicense.addEventListener('click', activateLicenseKey);

    // Drag and Drop (Batch Multiple Files)
    const dropBox = elements.dropBox;
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropBox.classList.add('drag-over');
    });

    window.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropBox.classList.remove('drag-over');
    });

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropBox.classList.remove('drag-over');

      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        const fileList = Array.from(e.dataTransfer.files);
        const paths = fileList.map(f => f.path).filter(Boolean);

        if (paths.length > 0) {
          addToQueue(paths);
        } else {
          // Fallback if browser security clears .path
          const first = fileList[0];
          const reader = new FileReader();
          reader.onload = () => addToQueue(reader.result);
          reader.readAsDataURL(first);
        }
      }
    });
  }

  // Helper: Format IDR Currency
  function formatIdr(amount) {
    return 'Rp ' + Math.round(amount || 0).toLocaleString('id-ID');
  }

  // Helper: Escape HTML
  function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/[&<>"']/g, function(m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
  }

  // Start app
  window.addEventListener('DOMContentLoaded', init);
})();
