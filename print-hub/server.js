// print-hub/server.js  (Node 18+)
import express from 'express';
import net from 'net';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json({ limit: '512kb' }));

app.post('/print', async (req, res) => {
  const { host, port = 9100, dataBase64 } = req.body || {};
  if (!host || !dataBase64) return res.status(400).json({ error: 'host and dataBase64 required' });
  const data = Buffer.from(dataBase64, 'base64');
  const socket = new net.Socket();
  socket.setTimeout(8000);
  socket.connect(port, host, () => socket.write(data));
  socket.on('close', () => res.json({ ok: true }));
  socket.on('error', (e) => res.status(500).json({ error: e.message }));
});
app.listen(3333, () => console.log('Print Hub on http://127.0.0.1:3333/print'));
