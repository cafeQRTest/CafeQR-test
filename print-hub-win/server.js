// print-hub-win/server.js
import express from 'express';
import cors from 'cors';
import os from 'os';
import { execFile } from 'child_process';
import { spawn } from 'child_process';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/health', (req, res) => {
  res.json({ ok: true, host: os.hostname() });
});

// List installed printers via PowerShell Get-Printer (Windows 8+)
app.get('/printers', (req, res) => {
  const ps = spawn('powershell.exe', [
    '-NoProfile',
    '-Command',
    'Get-Printer | Select-Object -ExpandProperty Name'
  ]);

  let out = '';
  let err = '';

  ps.stdout.on('data', d => (out += d.toString('utf8')));
  ps.stderr.on('data', d => (err += d.toString('utf8')));

  ps.on('close', code => {
    if (code !== 0) {
      return res.status(500).json({ error: err || 'Get-Printer failed' });
    }
    const names = out
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean);
    res.json(names);
  });
});

// Raw bytes to Windows spooler via RawPrint.exe
app.post('/printRaw', (req, res) => {
  const { printerName, dataBase64 } = req.body || {};
  if (!printerName || !dataBase64) {
    return res
      .status(400)
      .json({ error: 'printerName and dataBase64 required' });
  }

  // RawPrint.exe must be in the same folder as this server
  const exe = 'RawPrint.exe';

  const child = execFile(exe, [printerName, dataBase64], { windowsHide: true }, (err) => {
    if (err) {
      return res.status(500).json({ error: err.message || String(err) });
    }
    res.json({ ok: true });
  });
});

const PORT = 3333;
app.listen(PORT, () => {
  console.log(`Print Hub on http://127.0.0.1:${PORT}/health`);
});
