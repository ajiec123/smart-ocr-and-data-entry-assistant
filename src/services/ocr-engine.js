const { createWorker } = require('tesseract.js');
const path = require('path');
const fs = require('fs');

class OCREngine {
  constructor(options = {}) {
    this.tessdataDir = options.tessdataDir || path.join(__dirname, '..', '..', 'assets', 'tessdata');
    this.languages = options.languages || 'ind+eng'; // Indonesian + English
    this.worker = null;
    this._ensureDir();
  }

  _ensureDir() {
    try {
      if (!fs.existsSync(this.tessdataDir)) {
        fs.mkdirSync(this.tessdataDir, { recursive: true });
      }
    } catch (e) {
      console.warn('Could not create tessdata directory:', e.message);
    }
  }

  /**
   * Initializes or gets the Tesseract worker
   * @param {Function} onProgress - Callback for loading & recognition progress
   */
  async getWorker(onProgress) {
    if (this.worker) return this.worker;

    // Configure local offline paths if available
    const workerOptions = {
      cachePath: this.tessdataDir,
      logger: m => {
        if (onProgress && typeof onProgress === 'function') {
          onProgress(m);
        }
      }
    };

    // If local traineddata exists, point tesseract directly to it
    const hasLocalData = fs.existsSync(path.join(this.tessdataDir, 'ind.traineddata')) ||
                         fs.existsSync(path.join(this.tessdataDir, 'eng.traineddata'));
    
    if (hasLocalData) {
      workerOptions.langPath = this.tessdataDir;
    }

    // Try language combination, fallback to eng if ind is not yet present
    let lang = this.languages;
    if (hasLocalData && !fs.existsSync(path.join(this.tessdataDir, 'ind.traineddata'))) {
      lang = 'eng';
    }

    try {
      this.worker = await createWorker(lang, 1, workerOptions);
      return this.worker;
    } catch (err) {
      console.warn(`Worker init with ${lang} failed, attempting 'eng' fallback:`, err.message);
      this.worker = await createWorker('eng', 1, workerOptions);
      return this.worker;
    }
  }

  /**
   * Recognize text from an image buffer or file path
   * @param {Buffer|string} imageInput
   * @param {Function} onProgress - (progressEvent) => void
   * @returns {Promise<{ text: string, confidence: number, lines: Array }>}
   */
  async recognize(imageInput, onProgress) {
    const worker = await this.getWorker(onProgress);

    const result = await worker.recognize(imageInput);
    
    return {
      text: result.data.text,
      confidence: result.data.confidence,
      words: result.data.words?.map(w => ({
        text: w.text.trim(),
        confidence: w.confidence,
        bbox: w.bbox
      })).filter(w => w.text.length > 0) || [],
      lines: result.data.lines?.map(l => ({
        text: l.text.trim(),
        confidence: l.confidence,
        bbox: l.bbox
      })).filter(l => l.text.length > 0) || []
    };
  }

  async terminate() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}

module.exports = OCREngine;
