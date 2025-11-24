// utils/logoBitmap.js

export async function fileToBitmapGrid(file, maxWidth = 384, maxHeight = 128) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });

  // Keep aspect ratio, but limit physical size
  const scale = Math.min(
    maxWidth / img.width,
    maxHeight / img.height,
    1 // never upscale
  );

  const w = Math.max(8, Math.round(img.width * scale));
  const h = Math.max(8, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  const { data } = imageData;

  let bits = '';

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx + 0];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // simple luminance
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      // threshold (you can tune 160 → darker / lighter)
      const isDark = lum < 160;
      bits += isDark ? '1' : '0';
    }
  }

  return {
    bitmap: bits, // length = w * h, row‑major
    cols: w,
    rows: h,
  };
}
