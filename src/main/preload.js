const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Licensing
  getLicenseStatus: () => ipcRenderer.invoke('license:check'),
  getDeviceUID: () => ipcRenderer.invoke('license:get-uid'),
  activateLicense: (key) => ipcRenderer.invoke('license:activate', key),

  // File Dialogs
  openImageDialog: () => ipcRenderer.invoke('dialog:open-images'),
  saveExcelDialog: (defaultFilename) => ipcRenderer.invoke('dialog:save-excel', defaultFilename),
  readBinaryFile: (filePath) => ipcRenderer.invoke('file:read-binary', filePath),

  // Image & OCR Processing
  preprocessImage: (imageInput, options) => ipcRenderer.invoke('image:preprocess', imageInput, options),
  processReceipt: (imageInput, options) => ipcRenderer.invoke('ocr:process', imageInput, options),
  parseRawText: (rawText) => ipcRenderer.invoke('parser:parse-text', rawText),
  onOcrProgress: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('ocr:progress', subscription);
    return () => ipcRenderer.removeListener('ocr:progress', subscription);
  },

  // Excel Export
  exportSingleExcel: (receiptData, targetPath) => ipcRenderer.invoke('excel:export-single', receiptData, targetPath),
  exportBatchExcel: (receipts, targetPath) => ipcRenderer.invoke('excel:export-batch', receipts, targetPath),

  // Samples
  listSamples: () => ipcRenderer.invoke('samples:list'),
  loadSample: (sampleName) => ipcRenderer.invoke('samples:load', sampleName)
});
