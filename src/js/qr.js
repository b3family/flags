// Vẽ mã QR lên canvas. Thư viện tải khi cần, nên game vẫn chạy nếu CDN lỗi.
const QR_ESM = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/+esm';
let factory = null;

/**
 * Vẽ QR của `text` lên canvas (nền trắng, có viền yên tĩnh 4 ô như chuẩn QR).
 * @param {HTMLCanvasElement} canvas
 * @param {string} text
 * @param {number} [size] Cạnh canvas tính bằng px.
 * @returns {Promise<boolean>} false nếu không tải được thư viện.
 */
export async function drawQr(canvas, text, size = 320) {
  try {
    if (!factory) {
      const mod = await import(QR_ESM);
      factory = mod.default ?? mod;
    }
    const qr = factory(0, 'M');
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    const quiet = 4;
    const cell = Math.max(1, Math.floor(size / (count + quiet * 2)));
    canvas.width = canvas.height = cell * (count + quiet * 2);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
      }
    }
    return true;
  } catch {
    return false;
  }
}
