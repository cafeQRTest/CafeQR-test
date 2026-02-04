//scripts/use-android-target.js

const fs = require('fs');
const path = require('path');

const targetDirName = process.argv[2];
if (!targetDirName) {
  console.error('Usage: node scripts/use-android-target.js <android-pos-test|android-delivery-test>');
  process.exit(1);
}

const root = process.cwd();
const android = path.join(root, 'android');
const target = path.join(root, targetDirName);

// If the target exists, swap it in as ./android
if (fs.existsSync(target)) {
  // If ./android exists, move it aside (backup)
  if (fs.existsSync(android)) {
    const backup = path.join(root, `android-backup-${Date.now()}`);
    fs.renameSync(android, backup);
  }
  fs.renameSync(target, android);
}

// If target does NOT exist, do nothing (let cap add create ./android)

// Ensure assets folder exists if ./android exists
if (fs.existsSync(android)) {
  fs.mkdirSync(path.join(android, 'app', 'src', 'main', 'assets'), { recursive: true });
  fs.mkdirSync(path.join(android, 'app', 'src', 'main', 'assets', 'public'), { recursive: true });
}
