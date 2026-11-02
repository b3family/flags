// Lớp mạng: đăng nhập ẩn danh, phòng chơi, đồng bộ đáp án qua Supabase.
// supabase-js tải bằng dynamic import để chế độ chơi chung 1 iPad vẫn chạy khi mất mạng.
const SUPABASE_ESM = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

let client = null;
let userId = null;

/** @returns {string|null} ID người dùng ẩn danh hiện tại. */
export const getUserId = () => userId;

/**
 * Kết nối Supabase và đăng nhập ẩn danh (giữ phiên cũ nếu có).
 * @returns {Promise<string>} user id
 */
export async function initNet() {
  if (client) return userId;
  const cfg = await (await fetch('config/supabase.json')).json();
  const { createClient } = await import(SUPABASE_ESM);
  const c = createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  let { data: { session } } = await c.auth.getSession();
  if (!session) {
    const { data, error } = await c.auth.signInAnonymously();
    if (error) throw error;
    session = data.session;
  }
  client = c;
  userId = session.user.id;
  return userId;
}

async function call(fn, args) {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

/** @param {{name: string, avatar: string}} profile */
export const createRoom = (profile) =>
  call('create_room', { p_name: profile.name, p_avatar: profile.avatar });

/** @param {string} code @param {{name: string, avatar: string}} profile */
export const joinRoom = (code, profile) =>
  call('join_room', { p_code: code, p_name: profile.name, p_avatar: profile.avatar });

export const setRoomSet = (code, setId) => call('set_room_set', { p_code: code, p_set_id: setId });
export const setRoomSeconds = (code, seconds) => call('set_room_seconds', { p_code: code, p_seconds: seconds });
export const setReady = (code, ready) => call('set_ready', { p_code: code, p_ready: ready });
export const finishRoom = (code) => call('finish_room', { p_code: code });
export const resetRoom = (code) => call('reset_room', { p_code: code });
export const leaveRoom = (code) => call('leave_room', { p_code: code });

/**
 * Đọc trạng thái phòng hiện tại (dùng làm lưới an toàn khi lỡ sự kiện realtime).
 * @returns {Promise<object|null>} null nếu phòng không còn hoặc đọc lỗi.
 */
export async function getRoom(code) {
  const { data } = await client.from('rooms').select('*').eq('code', code).maybeSingle();
  return data;
}

/**
 * Theo dõi thay đổi của phòng (bé vào, chọn bộ cờ, sẵn sàng, bắt đầu...).
 * @param {string} code
 * @param {(room: object) => void} onRoom
 * @returns {() => void} Hàm hủy theo dõi.
 */
export function subscribeRoom(code, onRoom) {
  const ch = client
    .channel(`room-db:${code}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'rooms', filter: `code=eq.${code}` },
      (p) => { if (p.new && p.new.code) onRoom(p.new); })
    .subscribe(async (status) => {
      if (status !== 'SUBSCRIBED') return;
      const room = await getRoom(code); // đồng bộ lần đầu phòng khi sự kiện đến trước lúc subscribe xong
      if (room) onRoom(room);
    });
  return () => client.removeChannel(ch);
}

/**
 * Kênh trong phòng: đáp án, lời tạm biệt và sự có mặt của bé kia.
 * @param {string} code
 * @param {{onAnswer: (msg: object) => void, onBye: () => void, onPresence: (opponentHere: boolean) => void}} handlers
 */
export function joinChannel(code, handlers) {
  let ready = false;
  const ch = client.channel(`game:${code}`, {
    config: { broadcast: { self: false }, presence: { key: userId } },
  });
  ch.on('broadcast', { event: 'answer' }, ({ payload }) => handlers.onAnswer(payload))
    .on('broadcast', { event: 'bye' }, () => handlers.onBye())
    .on('presence', { event: 'sync' }, () => {
      const others = Object.keys(ch.presenceState()).filter((k) => k !== userId);
      handlers.onPresence(others.length > 0);
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') { ready = true; await ch.track({ at: Date.now() }); }
    });

  const send = (event, payload) => { if (ready) ch.send({ type: 'broadcast', event, payload }); };
  return {
    /** Gửi đáp án của mình cho bé kia. */
    sendAnswer: (q, optionIndex, elapsedMs) => send('answer', { q, optionIndex, elapsedMs }),
    sendBye: () => send('bye', {}),
    close: () => client.removeChannel(ch),
  };
}
