const ROOM_CODE = /^[A-Za-z0-9]{4}$/;

/**
 * Link để máy khác quét QR: trang game, kèm ?room=MÃ nếu đang ở trong phòng.
 * @param {string} href URL hiện tại của trang.
 * @param {string} [roomCode]
 * @returns {string}
 */
export function buildShareUrl(href, roomCode) {
  const url = new URL(href);
  url.hash = '';
  url.search = '';
  if (roomCode) url.searchParams.set('room', roomCode.toUpperCase());
  return url.toString();
}

/**
 * Đọc mã phòng từ query string; chỉ nhận đúng 4 ký tự chữ/số.
 * @param {string} search Ví dụ location.search.
 * @returns {string|null} Mã viết hoa, hoặc null nếu không hợp lệ.
 */
export function parseRoomParam(search) {
  const code = new URLSearchParams(search).get('room');
  return code && ROOM_CODE.test(code) ? code.toUpperCase() : null;
}
