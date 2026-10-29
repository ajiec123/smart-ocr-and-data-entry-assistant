const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const LicenseService = require('../services/licensing');
const ImageProcessor = require('../services/image-processor');
const OCREngine = require('../services/ocr-engine');
const ReceiptParser = require('../services/parser');
const ExcelExporter = require('../services/excel-exporter');

let mainWindow = null;
const licenseService = new LicenseService();
const imageProcessor = new ImageProcessor();
const ocrEngine = new OCREngine();
const receiptParser = new ReceiptParser();
const excelExporter = new ExcelExporter();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'Smart OCR & Data Entry Assistant',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(() => {
  setupIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', async () => {
  try {
    await ocrEngine.terminate();
  } catch {}
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function setupIpcHandlers() {
  // Licensing
  ipcMain.handle('license:check', () => {
    return licenseService.checkLicense();
  });

  ipcMain.handle('license:get-uid', () => {
    return licenseService.getDeviceUID();
  });

  ipcMain.handle('license:activate', (event, key) => {
    return licenseService.activate(key);
  });

  // Dialogs
  ipcMain.handle('dialog:open-images', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Receipt Documents (PDF or Images)',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Receipts & Documents (PDF & Images)', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff'] },
        { name: 'PDF Documents (*.pdf)', extensions: ['pdf'] },
        { name: 'Image Files (*.png, *.jpg, etc.)', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths;
  });

  ipcMain.handle('file:read-binary', async (event, filePath) => {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'File does not exist: ' + filePath };
      }
      const buffer = fs.readFileSync(filePath);
      return {
        success: true,
        base64: buffer.toString('base64'),
        size: buffer.length,
        filename: path.basename(filePath)
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('parser:parse-text', async (event, rawText) => {
    try {
      const parsed = receiptParser.parse(rawText);
      return { success: true, parsed };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('dialog:save-excel', async (event, defaultName) => {
    if (!mainWindow) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Excel File',
      defaultPath: defaultName || 'SmartOCR_Receipt_Export.xlsx',
      filters: [{ name: 'Excel Spreadsheet (*.xlsx)', extensions: ['xlsx'] }]
    });

    if (result.canceled) return null;
    return result.filePath;
  });

  // Preprocessing
  ipcMain.handle('image:preprocess', async (event, imageInput, options) => {
    try {
      const processed = await imageProcessor.process(imageInput, options);
      return {
        success: true,
        dataUrl: processed.dataUrl,
        width: processed.width,
        height: processed.height
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Full OCR Processing
  ipcMain.handle('ocr:process', async (event, imageInput, options = {}) => {
    try {
      // 1. Send progress: Enhancing image
      event.sender.send('ocr:progress', { status: 'preprocessing', progress: 0.15, message: 'Enhancing image contrast...' });

      const processed = await imageProcessor.process(imageInput, options);

      // 2. Send progress: Running OCR
      event.sender.send('ocr:progress', { status: 'ocr_starting', progress: 0.35, message: 'Reading document text...' });

      const ocrResult = await ocrEngine.recognize(processed.buffer, (m) => {
        if (m.status === 'recognizing text') {
          const p = 0.35 + (m.progress || 0) * 0.5;
          event.sender.send('ocr:progress', { status: m.status, progress: p, message: `Recognizing text (${Math.round(m.progress * 100)}%)...` });
        }
      });

      // 3. Send progress: Parsing data
      event.sender.send('ocr:progress', { status: 'parsing', progress: 0.90, message: 'Structuring fields & line items...' });

      const parsed = receiptParser.parse(ocrResult.text);

      event.sender.send('ocr:progress', { status: 'completed', progress: 1.0, message: 'Done' });

      return {
        success: true,
        previewDataUrl: processed.dataUrl,
        ocrConfidence: ocrResult.confidence,
        rawText: ocrResult.text,
        words: ocrResult.words,
        lines: ocrResult.lines,
        imageWidth: processed.width,
        imageHeight: processed.height,
        parsed
      };
    } catch (err) {
      event.sender.send('ocr:progress', { status: 'error', progress: 0, message: err.message });
      return { success: false, error: err.message };
    }
  });

  // Excel Exporters
  ipcMain.handle('excel:export-single', async (event, receiptData, targetPath) => {
    try {
      const savedPath = await excelExporter.exportSingleReceipt(receiptData, targetPath);
      return { success: true, savedPath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('excel:export-batch', async (event, receipts, targetPath) => {
    try {
      const savedPath = await excelExporter.exportBatchLedger(receipts, targetPath);
      return { success: true, savedPath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Sample data management
  ipcMain.handle('samples:list', async () => {
    const samplesDir = path.join(__dirname, '..', '..', 'assets', 'samples');
    if (!fs.existsSync(samplesDir)) return [];
    const files = fs.readdirSync(samplesDir).filter(f => f.endsWith('.png') || f.endsWith('.pdf'));
    return files.map(file => {
      const isPdf = file.endsWith('.pdf');
      const cleanName = file.replace('sample_', '').replace(/\.(png|pdf)$/, '').replace(/_/g, ' ').toUpperCase();
      return {
        filename: file,
        name: isPdf ? `[PDF] ${cleanName}` : cleanName,
        path: path.join(samplesDir, file)
      };
    });
  });

  ipcMain.handle('samples:load', async (event, filename) => {
    const filePath = path.join(__dirname, '..', '..', 'assets', 'samples', filename);
    if (!fs.existsSync(filePath)) return null;
    return filePath;
  });
}
