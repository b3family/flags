/**
 * Đối chiếu hồ sơ lưu trên máy với user id đang đăng nhập, để không âm thầm mất
 * danh tính (và lịch sử đấu gắn với nó).
 * @param {{name: string, avatar: string, playerId?: string}} profile
 * @param {string} userId User id ẩn danh hiện tại của Supabase.
 * @returns {{profile: object, status: 'new'|'same'|'changed', previousPlayerId?: string}}
 *   new: hồ sơ chưa có playerId, gắn mới. same: khớp. changed: playerId cũ khác user hiện tại
 *   (mất phiên đăng nhập cũ, lịch sử cũ không còn truy cập được từ máy này).
 */
export function reconcileProfile(profile, userId) {
  const next = { ...profile, playerId: userId };
  if (!profile.playerId) return { profile: next, status: 'new' };
  if (profile.playerId === userId) return { profile: next, status: 'same' };
  return { profile: next, status: 'changed', previousPlayerId: profile.playerId };
}
