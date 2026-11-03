const DEFAULT_KEY = 'cothunhi.outbox';

/**
 * Hộp thư chờ gửi: kết quả trận chưa gửi được (mất mạng) được giữ trong storage
 * và gửi lại sau, để không mất lịch sử.
 * @param {{getItem: (k: string) => string|null, setItem: (k: string, v: string) => void}} storage
 * @param {string} [key]
 */
export function createOutbox(storage, key = DEFAULT_KEY) {
  const read = () => {
    try {
      const list = JSON.parse(storage.getItem(key));
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  };
  const write = (list) => {
    try { storage.setItem(key, JSON.stringify(list)); } catch { /* storage bị chặn: bỏ qua */ }
  };
  return {
    /** @returns {object[]} Các mục đang chờ gửi. */
    all: read,
    /** Thêm một mục `{id, ...}`; trùng id thì thay thế. */
    add(item) {
      write([...read().filter((i) => i.id !== item.id), item]);
    },
    remove(id) {
      write(read().filter((i) => i.id !== id));
    },
  };
}
