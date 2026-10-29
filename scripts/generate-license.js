#!/usr/bin/env node
const LicenseService = require('../src/services/licensing');
const licenseService = new LicenseService();

const args = process.argv.slice(2);
let deviceUID = args[0];
const customerName = args[1] || 'Tokopedia Buyer';
const licenseType = args[2] || 'LIFETIME';

if (!deviceUID) {
  console.log('Smart OCR & Data Entry Assistant - License Key Generator');
  console.log('========================================================');
  console.log('Usage: node scripts/generate-license.js <DEVICE_UID> [CUSTOMER_NAME] [TYPE]');
  console.log('\nExample:');
  console.log('  node scripts/generate-license.js SOCR-A1B2-C3D4-E5F6 "Toko Berkah" LIFETIME\n');
  
  // Show this machine's UID as an example
  deviceUID = licenseService.getDeviceUID();
  console.log(`Detected Current Machine UID: ${deviceUID}`);
  console.log('Generating sample activation key for this machine...\n');
}

const key = licenseService.generateLicenseKey(deviceUID, customerName, licenseType);

console.log('----------------------------------------------------');
console.log(`Target Device UID : ${deviceUID}`);
console.log(`Registered Owner  : ${customerName}`);
console.log(`License Type      : ${licenseType}`);
console.log('----------------------------------------------------');
console.log('LICENSE ACTIVATION KEY:');
console.log(key);
console.log('----------------------------------------------------');
console.log('Send this key to your customer to activate SmartOCR.');
