const sharp = require('sharp');
const fs = require('fs');

class ImageProcessor {
  /**
   * Preprocess receipt image for OCR or UI display
   * @param {string|Buffer} input - File path or image Buffer
   * @param {Object} options - Transformation options
   * @param {string} options.preset - 'original' | 'grayscale' | 'contrast' | 'binarize'
   * @param {number} options.rotation - 0, 90, 180, 270
   * @param {number} options.threshold - 0-255 for binarize preset (default: 160)
   * @param {boolean} options.sharpen - apply unsharp mask
   */
  async process(input, options = {}) {
    const {
      preset = 'contrast',
      rotation = 0,
      threshold = 160,
      sharpen = true,
      maxWidth = 2000
    } = options;

    let pipeline = sharp(input).rotate(); // auto-orient via EXIF

    if (rotation && rotation !== 0) {
      pipeline = pipeline.rotate(rotation);
    }

    // Resize if too huge to keep processing snappy while preserving OCR text quality
    // OR upscale if image is low-resolution (e.g. mobile thermal receipt captures < 1000px)
    const metadata = await pipeline.metadata();
    if (metadata.width && metadata.width > maxWidth) {
      pipeline = pipeline.resize({ width: maxWidth, withoutEnlargement: true });
    } else if (metadata.width && metadata.width < 1000) {
      // Upscale low-res thermal receipts so Tesseract can resolve dot-matrix text & faint digits
      pipeline = pipeline.resize({ width: 1200, withoutEnlargement: false, kernel: sharp.kernel.lanczos3 });
    }

    switch (preset) {
      case 'grayscale':
        pipeline = pipeline
          .withMetadata({ density: 300 })
          .grayscale();
        if (sharpen) {
          pipeline = pipeline.sharpen({ sigma: 0.8, m1: 0.8, m2: 1.2 });
        }
        break;

      case 'contrast':
        pipeline = pipeline
          .withMetadata({ density: 300 })
          .grayscale()
          .normalize(); // stretch dynamic range safely without clipping faint text
        if (sharpen) {
          pipeline = pipeline.sharpen({ sigma: 0.8, m1: 1.0, m2: 1.5 });
        }
        break;

      case 'binarize':
        pipeline = pipeline
          .withMetadata({ density: 300 })
          .grayscale()
          .normalize()
          .threshold(threshold, { greyscale: true });
        break;

      case 'original':
      default:
        pipeline = pipeline.withMetadata({ density: 300 });
        break;
    }

    // Convert to PNG for lossless OCR feeding
    const buffer = await pipeline.png().toBuffer();
    const processedMeta = await sharp(buffer).metadata();

    return {
      buffer,
      mimeType: 'image/png',
      width: processedMeta.width,
      height: processedMeta.height,
      dataUrl: `data:image/png;base64,${buffer.toString('base64')}`
    };
  }
}

module.exports = ImageProcessor;
