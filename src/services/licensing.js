const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { machineIdSync } = require('node-machine-id');

// Master application salt for license signing
const LICENSE_SECRET = 'SmartOCR-2026-Commercial-Hardware-Sign-Key-v1';

class LicenseService {
  constructor(storageDir) {
    this.storageDir = storageDir || this._getDefaultStorageDir();
    this.licenseFile = path.join(this.storageDir, 'license.lic');
    this._ensureStorage();
  }

  _getDefaultStorageDir() {
    const appData = process.env.APPDATA || (process.platform === 'darwin' 
      ? path.join(process.env.HOME || '', 'Library', 'Application Support')
      : path.join(process.env.HOME || '', '.config'));
    const dir = path.join(appData, 'SmartOCR');
    return dir;
  }

  _ensureStorage() {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
    } catch (e) {
      console.error('Failed to create license directory:', e);
    }
  }

  /**
   * Retrieves stable hardware identifier (Device UID)
   * Format: SOCR-XXXX-XXXX-XXXX-XXXX
   */
  getDeviceUID() {
    let rawId = '';
    
    // 1. Try node-machine-id
    try {
      rawId = machineIdSync({ original: true });
    } catch {
      // 2. Fallback to native OS queries on Windows
      if (process.platform === 'win32') {
        try {
          const stdout = execSync('powershell -NoProfile -Command "(Get-CimInstance -Class Win32_ComputerSystemProduct).UUID"', {
            encoding: 'utf8',
            timeout: 3000
          });
          rawId = stdout.trim();
        } catch {
          try {
            const wmic = execSync('wmic csproduct get uuid', { encoding: 'utf8', timeout: 3000 });
            rawId = wmic.replace('UUID', '').trim();
          } catch {
            rawId = `${process.env.COMPUTERNAME || 'PC'}-${process.env.USERNAME || 'USER'}`;
          }
        }
      } else {
        rawId = `${process.env.USER || 'USER'}-${process.arch}-${process.platform}`;
      }
    }

    // Hash into clean 16-character uppercase formatted string
    const hash = crypto.createHash('sha256').update(`SMARTOCR-HW-${rawId}`).digest('hex').toUpperCase();
    return `SOCR-${hash.slice(0, 4)}-${hash.slice(4, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}`;
  }

  /**
   * Generates a signed license key for a given Device UID.
   * Format: KEY-XXXX-XXXX-XXXX-XXXX (Base32/Hex signed payload)
   * Used by keygen tool for Tokopedia/Shopee buyers.
   */
  generateLicenseKey(deviceUID, customerName = 'Retail Buyer', type = 'LIFETIME') {
    const payload = {
      uid: deviceUID.trim().toUpperCase(),
      owner: customerName,
      type: type, // 'LIFETIME' or 'ANNUAL'
      issuedAt: new Date().toISOString()
    };

    const payloadJson = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', LICENSE_SECRET)
      .update(payloadJson)
      .digest('hex');

    const combined = {
      p: payload,
      s: signature
    };

    return Buffer.from(JSON.stringify(combined)).toString('base64');
  }

  /**
   * Validates a license key string against the current machine's Device UID
   */
  verifyLicenseKey(licenseKeyString) {
    try {
      if (!licenseKeyString || typeof licenseKeyString !== 'string') {
        return { valid: false, error: 'License key is required.' };
      }

      const decoded = JSON.parse(Buffer.from(licenseKeyString.trim(), 'base64').toString('utf8'));
      if (!decoded.p || !decoded.s) {
        return { valid: false, error: 'Malformed license structure.' };
      }

      // 1. Verify cryptographic HMAC signature
      const expectedSignature = crypto.createHmac('sha256', LICENSE_SECRET)
        .update(JSON.stringify(decoded.p))
        .digest('hex');

      if (decoded.s !== expectedSignature) {
        return { valid: false, error: 'Invalid license signature or altered key.' };
      }

      // 2. Verify hardware lock (Device UID matching)
      const currentUID = this.getDeviceUID();
      if (decoded.p.uid !== currentUID) {
        return {
          valid: false,
          error: `License locked to another machine. Target: ${decoded.p.uid}, Current: ${currentUID}`
        };
      }

      return {
        valid: true,
        license: decoded.p
      };
    } catch (err) {
      return { valid: false, error: 'Invalid or corrupted license key format.' };
    }
  }

  /**
   * Activates the software by verifying and saving the key locally
   */
  activate(licenseKeyString) {
    const result = this.verifyLicenseKey(licenseKeyString);
    if (!result.valid) {
      return result;
    }

    try {
      fs.writeFileSync(this.licenseFile, licenseKeyString.trim(), 'utf8');
      return {
        valid: true,
        activated: true,
        license: result.license
      };
    } catch (err) {
      return { valid: false, error: `Failed to save license file: ${err.message}` };
    }
  }

  /**
   * Checks current license status from disk
   */
  checkLicense() {
    const currentUID = this.getDeviceUID();
    if (!fs.existsSync(this.licenseFile)) {
      return {
        activated: false,
        deviceUID: currentUID,
        status: 'UNACTIVATED',
        message: 'No license key found. Please activate your license.'
      };
    }

    try {
      const key = fs.readFileSync(this.licenseFile, 'utf8').trim();
      const verification = this.verifyLicenseKey(key);
      if (verification.valid) {
        return {
          activated: true,
          deviceUID: currentUID,
          status: 'ACTIVATED',
          owner: verification.license.owner,
          type: verification.license.type,
          issuedAt: verification.license.issuedAt
        };
      } else {
        return {
          activated: false,
          deviceUID: currentUID,
          status: 'INVALID',
          error: verification.error
        };
      }
    } catch (err) {
      return {
        activated: false,
        deviceUID: currentUID,
        status: 'ERROR',
        error: err.message
      };
    }
  }
}

module.exports = LicenseService;
