import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';

const isDev = process.env.NODE_ENV !== 'production';
let cachedEnvMap = null;

function stripWrappingQuotes(value) {
  const str = String(value || '').trim();
  if (!str) return '';
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    return str.slice(1, -1);
  }
  return str;
}

function parseEnvFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const out = {};

    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const idx = trimmed.indexOf('=');
      if (idx <= 0) continue;

      const key = trimmed.slice(0, idx).trim();
      const value = stripWrappingQuotes(trimmed.slice(idx + 1));
      if (!key) continue;
      out[key] = value;
    }

    return out;
  } catch {
    return {};
  }
}

function getEnvFallbackMap() {
  if (cachedEnvMap) return cachedEnvMap;

  const cwd = process.cwd();
  const localEnv = parseEnvFile(path.join(cwd, '.env.local'));
  const serverEnv = parseEnvFile(path.join(cwd, '.env.server.local'));

  // `.env.server.local` wins over `.env.local` for server-only secrets.
  cachedEnvMap = { ...localEnv, ...serverEnv };
  return cachedEnvMap;
}

function readServerEnv(key) {
  if (process.env[key]) return process.env[key];
  return getEnvFallbackMap()[key] || '';
}

function normalizePrivateKey(raw) {
  const key = stripWrappingQuotes(raw).replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
  if (!key) return '';
  return key.endsWith('\n') ? key : `${key}\n`;
}

export function getFirebaseAdminCreds() {
  // Directly pull from process.env because Vercel injects environment variables here,
  // whereas the fallback .env parser might not work correctly in a serverless environment or if the files don't exist.
  const projectId = process.env.FIREBASE_PROJECT_ID || readServerEnv('FIREBASE_PROJECT_ID');
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || readServerEnv('FIREBASE_CLIENT_EMAIL');
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY || readServerEnv('FIREBASE_PRIVATE_KEY');

  return {
    projectId,
    clientEmail,
    privateKey: normalizePrivateKey(privateKeyRaw),
  };
}

export function ensureFirebaseAdminInitialized() {
  if (admin.apps.length) return { ok: true };

  const creds = getFirebaseAdminCreds();
  const missing = [];
  if (!creds.projectId) missing.push('FIREBASE_PROJECT_ID');
  if (!creds.clientEmail) missing.push('FIREBASE_CLIENT_EMAIL');
  if (!creds.privateKey) missing.push('FIREBASE_PRIVATE_KEY');

  if (missing.length) {
    return { ok: false, reason: 'missing_env', missing };
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: creds.projectId,
        clientEmail: creds.clientEmail,
        privateKey: creds.privateKey,
      }),
    });
    return { ok: true };
  } catch (e) {
    if (isDev) {
      console.error('[push] Firebase Admin init failed:', e?.message || e);
    }
    return { ok: false, reason: 'init_failed', error: e?.message || 'init_failed' };
  }
}

export { admin };
