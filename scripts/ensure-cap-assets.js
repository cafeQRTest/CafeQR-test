const fs = require('fs');
const path = require('path');

const androidDir = process.argv[2];
if (!androidDir) {
  console.error('Usage: node scripts/ensure-cap-assets.js <android-dir>');
  process.exit(1);
}

const p = (...xs) => path.join(process.cwd(), androidDir, ...xs);

// Create: <androidDir>/app/src/main/assets/public
fs.mkdirSync(p('app', 'src', 'main', 'assets', 'public'), { recursive: true });

console.log('OK: assets dirs ensured in', androidDir);
