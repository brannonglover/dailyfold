#!/usr/bin/env node
/**
 * @expo/cli lives under expo/node_modules and only falls back to devicectl for
 * APPLE_DEVICE_USBMUXD. Extend fallback to APPLE_DEVICE_LOCKDOWN (InvalidHostID).
 */
import fs from 'node:fs';
import path from 'node:path';

const target = path.join(
  process.cwd(),
  'node_modules/expo/node_modules/@expo/cli/build/src/run/ios/appleDevice/installOnDeviceAsync.js',
);

if (!fs.existsSync(target)) {
  process.exit(0);
}

const originalNeedle =
  "if (error.code === 'APPLE_DEVICE_USBMUXD') {\n                // Couldn't find device, could be OTA...\n                // Fallback on much slower devicectl method which supports OTA installs.";

const patched =
  "if (error.code === 'APPLE_DEVICE_USBMUXD' || error.code === 'APPLE_DEVICE_LOCKDOWN') {\n                // Couldn't find device, could be OTA...\n                // Fallback on much slower devicectl method which supports OTA installs.\n                // Also used when lockdown pairing fails (e.g. InvalidHostID).";

const src = fs.readFileSync(target, 'utf8');

if (src.includes('APPLE_DEVICE_LOCKDOWN')) {
  process.exit(0);
}

if (!src.includes(originalNeedle)) {
  console.warn('[patch-expo-cli] Expected @expo/cli installOnDeviceAsync.js shape changed; skipping patch.');
  process.exit(0);
}

fs.writeFileSync(target, src.replace(originalNeedle, patched));
console.log('[patch-expo-cli] Applied InvalidHostID devicectl fallback patch.');
