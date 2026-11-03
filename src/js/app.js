import { buildQuiz, pickSet } from './quiz.js';
import { createMatch } from './match.js';
import { secondsLeft } from './scoring.js';
import { beep } from './sound.js';
import { buildShareUrl, parseRoomParam } from './share.js';
import { drawQr } from './qr.js';
import { summarizeMatch, formatWhen } from './history.js';
import { reconcileProfile } from './profile.js';
import { createOutbox } from './outbox.js';
import * as net from './net.js';

const AVATARS = ['🦁', '🐼', '🐯', '🐸', '🦊', '🐰', '🐨', '🦄', '🐙', '🐧', '🦖', '🐶'];
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PROFILE_KEY = 'cothunhi.profile';
const $ = (id) => document.getElementById(id);

const [cfg, { sets }] = await Promise.all([
  fetch('config/game-config.json').then((r) => r.json()),
  fetch('data/flag-sets.json').then((r) => r.json()),
]);

/** Tạo phần tử bằng textContent để tên/avatar của bé kia không bao giờ chạy như HTML. */
function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Tên nước theo mã cờ và tên bộ cờ, để hiển thị lịch sử. */
const COUNTRY_NAME = new Map(sets.flatMap((s) => s.countries.map((c) => [c.code, c.name])));
const SET_LABEL = new Map([...sets.map((s) => [s.id, `${s.icon} ${s.name}`]), ['ngau-nhien', '🎲 Ngẫu nhiên']]);

const ERRORS = {
  ROOM_NOT_FOUND: 'Không thấy phòng này 🤔',
  ROOM_FULL: 'Phòng đủ 2 bạn rồi',
  ROOM_CLOSED: 'Phòng đang chơi rồi',
  NOT_AUTHENTICATED: 'Chưa vào mạng được, thử lại nhé',
};
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2800);
}
const errorText = (e) => ERRORS[e?.message] ?? 'Mạng có vấn đề, thử lại nhé';

// ---- hồ sơ (tên + avatar) lưu trên máy ----
function loadProfile() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY)); } catch { return null; }
}
function saveProfile(p) {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch { /* chế độ riêng tư: bỏ qua */ }
}
let profile = loadProfile();

/** localStorage, hoặc bộ nhớ tạm nếu trình duyệt chặn (chế độ riêng tư). */
function safeStorage() {
  try {
    localStorage.getItem(PROFILE_KEY);
    return localStorage;
  } catch {
    const mem = {};
    return { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); } };
  }
}
/** Kết quả trận chưa gửi được (mất mạng) chờ gửi lại, để không mất lịch sử. */
const outbox = createOutbox(safeStorage());

/**
 * Gắn danh tính server (user id ẩn danh) vào hồ sơ lưu trên máy, và xin trình duyệt
 * giữ dữ liệu bền hơn. Nếu playerId lưu trên máy khác user hiện tại nghĩa là phiên cũ đã mất.
 */
function adoptIdentity() {
  navigator.storage?.persist?.().catch(() => {});
  if (!profile) return;
  const r = reconcileProfile(profile, net.getUserId());
  if (r.status === 'same') return;
  profile = r.profile;
  saveProfile(profile);
  if (r.status === 'changed') toast('Máy này mất phiên đăng nhập cũ, lịch sử cũ không xem lại được nữa 😢');
}

// ---- điều hướng màn hình ----
const screens = ['welcome', 'lobby', 'history', 'join', 'room', 'game'];
/** Màn hình có nút QR: sảnh (mời máy khác mở game) và phòng chờ (mời vào đúng phòng). */
const QR_SCREENS = ['lobby', 'room'];
function show(name) {
  for (const s of screens) $(`screen-${s}`).hidden = s !== name;
  $('btn-qr').hidden = !QR_SCREENS.includes(name);
}

// ---- mạng: đăng nhập ẩn danh ngầm khi mở app, tự thử lại nếu mất mạng ----
let netReady = false;
/** Mã phòng từ link/QR (?room=ABCD), chờ có hồ sơ và mạng rồi tự vào. */
let pendingRoom = parseRoomParam(location.search);

function refreshNetButtons() {
  $('btn-create-room').disabled = !netReady;
  $('btn-join-room').disabled = !netReady;
  $('btn-history').disabled = !netReady;
  $('net-hint').textContent = netReady ? '' : 'Đang kết nối mạng... cần có mạng để đấu cờ nhé.';
}
async function startNet() {
  try {
    await net.initNet();
    netReady = true;
    adoptIdentity();
    flushOutbox();
  } catch {
    netReady = false;
    setTimeout(startNet, 5000);
  }
  refreshNetButtons();
  maybeJoinPending();
}

function maybeJoinPending() {
  if (!pendingRoom || !profile || !netReady || onlineCtx) return;
  const code = pendingRoom;
  pendingRoom = null;
  history.replaceState(null, '', location.pathname);
  guarded(async () => { enterRoom(await net.joinRoom(code, profile)); });
}

// ---- màn chào: nhập tên + avatar ----
let chosenAvatar = profile?.avatar ?? null;
function renderAvatars() {
  const grid = $('avatar-grid');
  grid.replaceChildren(...AVATARS.map((a) => {
    const b = el('button', `avatar${a === chosenAvatar ? ' selected' : ''}`, a);
    b.setAttribute('aria-label', `Avatar ${a}`);
    b.onclick = () => { chosenAvatar = a; renderAvatars(); updateStart(); };
    return b;
  }));
}
function updateStart() {
  $('btn-start').disabled = !($('name-input').value.trim() && chosenAvatar);
}
$('name-input').oninput = updateStart;
$('btn-start').onclick = () => {
  // Giữ playerId cũ khi chỉ đổi tên/avatar, để không đứt lịch sử.
  profile = { ...profile, name: $('name-input').value.trim().slice(0, cfg.nameMaxLength), avatar: chosenAvatar };
  if (netReady) profile.playerId = net.getUserId();
  saveProfile(profile);
  goLobby();
  maybeJoinPending();
};

// ---- sảnh ----
function goLobby() {
  $('me-avatar').textContent = profile.avatar;
  $('me-name').textContent = profile.name;
  refreshNetButtons();
  show('lobby');
}
$('btn-edit-profile').onclick = () => {
  $('name-input').value = profile.name;
  chosenAvatar = profile.avatar;
  renderAvatars();
  updateStart();
  show('welcome');
};

// ---- nút QR: mời máy khác quét thay vì gõ URL ----
$('btn-qr').onclick = async () => {
  const code = onlineCtx?.code;
  const url = buildShareUrl(location.href, code);
  $('qr-note').textContent = code ? `Phòng ${code}: quét để vào thẳng phòng` : 'Quét để mở game';
  $('qr-url').textContent = url;
  $('qr-modal').hidden = false;
  const ok = await drawQr($('qr-canvas'), url);
  $('qr-canvas').hidden = !ok;
  if (!ok) $('qr-note').textContent = 'Chưa tạo được mã QR, bạn gửi link bên dưới nhé';
};
$('qr-close').onclick = () => { $('qr-modal').hidden = true; };
$('qr-modal').onclick = (e) => { if (e.target === $('qr-modal')) $('qr-modal').hidden = true; };

// ===========================================================================
// Trận đấu (online)
// ===========================================================================
/** Trận đang chạy hoặc null. */
let active = null;

function stopMatch() {
  if (!active) return;
  clearInterval(active.ticker);
  clearTimeout(active.nextTimer);
  clearTimeout(active.forfeitTimer);
  active = null;
}

function runMatch({ match, players, matchCfg, channel, roomStartedAt }) {
  stopMatch();
  $('popup').hidden = true;
  active = {
    match, players, channel, cfg: matchCfg, roomStartedAt,
    pending: {}, buttons: [],
    startedAt: 0, revealed: false, selfTimedOut: false, over: false,
    ticker: null, nextTimer: null, forfeitTimer: null,
  };
  $('bot-avatar').textContent = players.a.avatar;
  $('bot-name').textContent = players.a.name;
  $('top-avatar').textContent = players.b.avatar;
  $('top-name').textContent = players.b.name;
  show('game');
  askQuestion();
}

function updateScores() {
  if (!active) return;
  $('bot-score').textContent = active.match.totals.a;
  $('top-score').textContent = active.match.totals.b;
}

function askQuestion() {
  const A = active;
  const { match } = A;
  if (match.finished) return endMatch();

  const q = match.question;
  A.revealed = false;
  A.selfTimedOut = false;
  A.startedAt = performance.now();
  const flag = el('span', `fi fi-${q.code}`);
  flag.setAttribute('role', 'img');
  flag.setAttribute('aria-label', 'Lá cờ');
  $('flag').replaceChildren(flag);
  $('qcount').textContent = `Câu ${match.index + 1}/${match.total}`;
  $('feedback').textContent = '';
  $('top-tick').hidden = true;
  updateScores();

  A.buttons = q.options.map((opt, i) => {
    const btn = el('button', 'opt', opt.name);
    btn.onclick = () => onPick(i);
    return btn;
  });
  $('bot-options').replaceChildren(...A.buttons);

  // Đáp án của bé kia có thể đến trước khi mình sang câu này.
  const early = A.pending[match.index];
  if (early) { delete A.pending[match.index]; onRemoteAnswer(early); }

  const total = A.cfg.questionTimeSeconds * 1000;
  clearInterval(A.ticker);
  A.ticker = setInterval(() => {
    const elapsed = performance.now() - A.startedAt;
    const bar = $('timer-bar');
    bar.style.transform = `scaleX(${Math.max(0, 1 - elapsed / total)})`;
    bar.classList.toggle('low', elapsed > total * 0.7);
    $('timer-num').textContent = secondsLeft(elapsed, A.cfg);
    if (elapsed < total) return;

    if (!A.selfTimedOut) {
      A.selfTimedOut = true;
      match.timeout(['a']);
      A.buttons.forEach((b) => { b.disabled = true; });
    }
    if (match.questionDone) return reveal();
    // Chờ thêm một chút cho đáp án của bé kia (độ trễ mạng), rồi bỏ qua.
    if (elapsed >= total + cfg.opponentGraceMs) { match.timeout(); reveal(); }
  }, 50);
}

function onPick(optionIndex) {
  const A = active;
  if (!A || A.revealed) return;
  const elapsed = performance.now() - A.startedAt;
  if (A.match.answer('a', optionIndex, elapsed) === null) return;
  A.buttons.forEach((b) => { b.disabled = true; });
  A.buttons[optionIndex].classList.add('picked');
  beep('tap');
  A.channel?.sendAnswer(A.match.index, optionIndex, Math.round(elapsed));
  if (A.match.questionDone) reveal();
}

/** Đáp án của bé kia gửi qua mạng. Không tin dữ liệu: kiểm tra kiểu và giới hạn. */
function onRemoteAnswer(msg) {
  const A = active;
  if (!A || !msg) return;
  const { q, optionIndex, elapsedMs } = msg;
  const valid = Number.isInteger(q) && q >= 0 && q < A.match.total
    && Number.isInteger(optionIndex) && optionIndex >= 0 && optionIndex <= cfg.distractorCount
    && Number.isFinite(elapsedMs) && elapsedMs >= 0;
  if (!valid) return;

  if (q > A.match.index) { A.pending[q] = msg; return; }
  if (q < A.match.index) {
    if (A.match.lateAnswer(q, 'b', optionIndex, elapsedMs) !== null) updateScores();
    return;
  }
  if (A.match.answer('b', optionIndex, elapsedMs) === null) return;
  $('top-tick').hidden = false;
  if (A.match.questionDone) reveal();
}

function reveal() {
  const A = active;
  if (!A || A.revealed) return;
  A.revealed = true;
  clearInterval(A.ticker);
  const { match, players } = A;
  const q = match.question;
  const ans = match.currentAnswers;
  A.buttons.forEach((btn, i) => {
    btn.disabled = true;
    if (i === q.answerIndex) btn.classList.add('correct');
    else if (i === ans.a.optionIndex) btn.classList.add('wrong');
  });
  $('top-tick').hidden = true;
  updateScores();
  $('feedback').textContent = `+${ans.a.points}${ans.b.points ? `  ·  ${players.b.name} +${ans.b.points}` : ''}`;
  beep(ans.a.correct ? 'good' : 'bad');
  A.nextTimer = setTimeout(() => { match.next(); askQuestion(); }, cfg.revealDelayMs);
}

// ---- lưu lịch sử: nộp kết quả của mình, mất mạng thì giữ trong outbox để gửi lại ----
/** Lỗi do dữ liệu/quyền: gửi lại cũng vô ích nên bỏ khỏi outbox. */
const PERMANENT_ERRORS = new Set(['NOT_ALLOWED', 'BAD_RESULT']);
let flushing = false;

function saveResult(opponentLeft) {
  const A = active;
  outbox.add({
    id: `${onlineCtx.code}:${A.roomStartedAt}`,
    code: onlineCtx.code,
    startedAt: A.roomStartedAt,
    answers: A.match.results('a'),
    opponentLeft,
  });
  flushOutbox();
}

async function flushOutbox() {
  if (flushing || !netReady) return;
  flushing = true;
  try {
    for (const item of outbox.all()) {
      try {
        await net.submitMatchResult(item.code, item.startedAt, item.answers, item.opponentLeft);
        outbox.remove(item.id);
      } catch (e) {
        if (PERMANENT_ERRORS.has(e?.message)) outbox.remove(item.id);
        else break; // mất mạng hoặc DB chưa cập nhật: giữ lại, thử lại lần sau
      }
    }
  } finally {
    flushing = false;
  }
}

// ---- kết thúc: popup thắng / thua / hòa ----
function showPopup({ kind, emoji, title, detail, sound }) {
  $('popup').className = `popup ${kind}`;
  $('popup-emoji').textContent = emoji;
  $('popup-title').textContent = title;
  $('popup-detail').textContent = detail;
  $('popup').hidden = false;
  beep(sound);
}

function endMatch() {
  const A = active;
  A.over = true;
  const { a, b } = A.match.totals;
  const w = A.match.winner();
  const detail = `${A.players.a.name}: ${a} điểm  ·  ${A.players.b.name}: ${b} điểm`;
  net.finishRoom(onlineCtx.code).catch(() => {});
  saveResult(false);
  if (w === 'draw') showPopup({ kind: 'draw', emoji: '🤝', title: 'Hòa nhau!', detail, sound: 'good' });
  else if (w === 'a') showPopup({ kind: 'win', emoji: '🏆', title: 'Bạn thắng!', detail, sound: 'win' });
  else showPopup({ kind: 'lose', emoji: '💪', title: 'Cố lên lần sau!', detail, sound: 'good' });
}

/** Bé kia rời giữa trận: bé còn lại thắng. */
function forfeit() {
  const A = active;
  if (!A || A.over) return;
  A.over = true;
  clearInterval(A.ticker);
  clearTimeout(A.nextTimer);
  const { a, b } = A.match.totals;
  saveResult(true);
  showPopup({
    kind: 'win', emoji: '🏆', title: 'Bạn thắng!', sound: 'win',
    detail: `${A.players.b.name} đã rời đi. ${A.players.a.name}: ${a} · ${A.players.b.name}: ${b}`,
  });
}

// ===========================================================================
// Phòng: tạo, nhập mã, phòng chờ
// ===========================================================================
/** Phòng hiện tại: { code, isHost, room, startedKey, channel, unsubscribe, poller, goneTimer } hoặc null. */
let onlineCtx = null;
let busy = false;
/** Chạy một thao tác mạng, chặn bấm đúp, báo lỗi thân thiện. */
async function guarded(fn) {
  if (busy) return;
  busy = true;
  try { await fn(); } catch (e) { toast(errorText(e)); } finally { busy = false; }
}

$('btn-create-room').onclick = () => guarded(async () => {
  enterRoom(await net.createRoom(profile));
});

// -- nhập mã bằng bàn phím to trên màn hình, trẻ nhỏ không phải gõ bàn phím iPad --
let codeInput = '';
function renderCode() {
  $('code-slots').replaceChildren(...[0, 1, 2, 3].map((i) =>
    el('div', `code-slot${codeInput[i] ? ' filled' : ''}`, codeInput[i] ?? '')));
  $('btn-join-go').disabled = codeInput.length !== 4;
}
function renderKeyboard() {
  const keys = [...CODE_ALPHABET].map((ch) => {
    const k = el('button', 'key', ch);
    k.onclick = () => { if (codeInput.length < 4) { codeInput += ch; renderCode(); beep('tap'); } };
    return k;
  });
  const del = el('button', 'key del', '⌫');
  del.setAttribute('aria-label', 'Xóa');
  del.onclick = () => { codeInput = codeInput.slice(0, -1); renderCode(); };
  $('keyboard').replaceChildren(...keys, del);
}
$('btn-join-room').onclick = () => { codeInput = ''; renderCode(); show('join'); };
$('btn-join-back').onclick = goLobby;
$('btn-join-go').onclick = () => guarded(async () => {
  enterRoom(await net.joinRoom(codeInput, profile));
});

// -- phòng chờ --
function enterRoom(room) {
  const code = room.code;
  onlineCtx = {
    code, room, isHost: room.host_id === net.getUserId(),
    startedKey: null, goneTimer: null, channel: null, unsubscribe: null, poller: null,
  };
  const ctx = onlineCtx;
  ctx.channel = net.joinChannel(code, {
    onAnswer: onRemoteAnswer,
    onBye: () => { if (onlineCtx !== ctx) return; if (active) forfeit(); else if (!ctx.isHost) exitRoom('Bạn kia đã rời phòng'); },
    onPresence: (here) => onOpponentPresence(ctx, here),
  });
  ctx.unsubscribe = net.subscribeRoom(code, (r) => { if (onlineCtx === ctx) handleRoom(r); });
  // Lưới an toàn: realtime có thể lỡ sự kiện (vừa subscribe, iPad ngủ...), nên đọc lại định kỳ.
  ctx.poller = setInterval(async () => {
    const r = await net.getRoom(code).catch(() => null);
    if (r && onlineCtx === ctx && JSON.stringify(r) !== JSON.stringify(ctx.room)) handleRoom(r);
  }, cfg.roomPollMs);
  active = null;
  show('room');
  renderRoom(room);
  if (room.status === 'playing') handleRoom(room);
}

/** Bé kia mất kết nối quá lâu: trong trận thì bỏ cuộc, ở phòng chờ thì khách rời nếu chủ phòng mất. */
function onOpponentPresence(ctx, here) {
  if (onlineCtx !== ctx) return;
  clearTimeout(ctx.goneTimer);
  if (here) return;
  const hasOpponent = !ctx.isHost || ctx.room.guest_id;
  if (!hasOpponent) return;
  if (active) {
    active.forfeitTimer = setTimeout(forfeit, cfg.disconnectForfeitSeconds * 1000);
    ctx.goneTimer = active.forfeitTimer;
  } else if (!ctx.isHost) {
    ctx.goneTimer = setTimeout(() => exitRoom('Bạn kia đã rời phòng'), cfg.roomGoneSeconds * 1000);
  }
}

function handleRoom(room) {
  const ctx = onlineCtx;
  ctx.room = room;
  if (room.status === 'playing' && ctx.startedKey !== room.started_at) {
    ctx.startedKey = room.started_at;
    startOnlineMatch(room);
    return;
  }
  if (!$('screen-room').hidden) renderRoom(room);
}

function renderRoom(room) {
  const ctx = onlineCtx;
  const host = { name: room.host_name, avatar: room.host_avatar, ready: room.host_ready };
  const guest = room.guest_id ? { name: room.guest_name, avatar: room.guest_avatar, ready: room.guest_ready } : null;
  const me = ctx.isHost ? host : guest;
  const opp = ctx.isHost ? guest : host;

  $('room-code').textContent = room.code;
  fillCard($('room-me'), me, 'Bạn');
  fillCard($('room-opp'), opp);

  const setChips = [...sets.map((s) => ({ id: s.id, label: `${s.icon} ${s.name}` })), { id: 'ngau-nhien', label: '🎲 Ngẫu nhiên' }];
  $('room-set-label').textContent = ctx.isHost ? 'Chọn bộ cờ' : 'Bộ cờ do bạn kia chọn';
  $('room-sets').replaceChildren(...setChips.map((c) => chip(c.label, room.set_id === c.id, ctx.isHost,
    () => net.setRoomSet(room.code, c.id))));

  const seconds = room.question_seconds ?? cfg.questionTimeSeconds;
  $('room-time-label').textContent = ctx.isHost ? 'Thời gian mỗi câu' : 'Thời gian mỗi câu do bạn kia chọn';
  $('room-times').replaceChildren(...cfg.questionTimeOptions.map((s) => chip(`⏱ ${s} giây`, seconds === s, ctx.isHost,
    () => net.setRoomSeconds(room.code, s))));

  const ready = $('btn-ready');
  ready.disabled = !opp || room.status !== 'lobby';
  ready.textContent = me?.ready ? '✋ Chờ bạn kia...' : '✅ Sẵn sàng!';
}

/** Nút lựa chọn trong phòng chờ; chỉ chủ phòng bấm được. */
function chip(label, selected, enabled, action) {
  const b = el('button', `chip${selected ? ' selected' : ''}`, label);
  b.disabled = !enabled;
  b.onclick = () => guarded(async () => { await action(); });
  return b;
}

function fillCard(card, p, suffix) {
  if (!p) {
    card.replaceChildren(el('span', 'pav', '⏳'), el('b', null, 'Đang chờ bạn...'));
    return;
  }
  card.replaceChildren(
    el('span', 'pav', p.avatar),
    el('b', null, suffix ? `${p.name} (${suffix})` : p.name),
    el('span', null, p.ready ? '✅ Sẵn sàng' : '…'),
  );
}

$('btn-ready').onclick = () => guarded(async () => {
  const room = onlineCtx.room;
  const mine = onlineCtx.isHost ? room.host_ready : room.guest_ready;
  handleRoom(await net.setReady(room.code, !mine));
});
$('btn-room-leave').onclick = () => exitRoom();

/** Rời phòng, dọn kết nối và về sảnh. */
function exitRoom(message) {
  const ctx = onlineCtx;
  onlineCtx = null;
  stopMatch();
  $('popup').hidden = true;
  if (ctx) {
    clearTimeout(ctx.goneTimer);
    clearInterval(ctx.poller);
    ctx.channel?.sendBye();
    ctx.unsubscribe?.();
    net.leaveRoom(ctx.code).catch(() => {});
    setTimeout(() => ctx.channel?.close(), 300); // chờ lời tạm biệt gửi đi
  }
  goLobby();
  if (message) toast(message);
}

function startOnlineMatch(room) {
  const ctx = onlineCtx;
  const seed = room.seed;
  const matchCfg = { ...cfg, questionTimeSeconds: room.question_seconds ?? cfg.questionTimeSeconds };
  const set = pickSet(sets, room.set_id, seed);
  const mine = ctx.isHost
    ? { name: room.host_name, avatar: room.host_avatar }
    : { name: room.guest_name, avatar: room.guest_avatar };
  const theirs = ctx.isHost
    ? { name: room.guest_name, avatar: room.guest_avatar }
    : { name: room.host_name, avatar: room.host_avatar };
  runMatch({
    match: createMatch(buildQuiz(set, seed, matchCfg), matchCfg),
    players: { a: mine, b: theirs },
    matchCfg,
    channel: ctx.channel,
    roomStartedAt: room.started_at,
  });
}

// ---- popup: chơi lại / về sảnh ----
$('popup-again').onclick = () => guarded(async () => {
  const room = await net.resetRoom(onlineCtx.code);
  stopMatch();
  $('popup').hidden = true;
  onlineCtx.room = room;
  show('room');
  renderRoom(room);
});
$('popup-home').onclick = () => exitRoom();

// ===========================================================================
// Lịch sử đấu
// ===========================================================================
const HISTORY_PAGE = 20;
let historyOffset = 0;
const OUTCOME = {
  win: { icon: '🏆', text: 'Thắng' },
  lose: { icon: '💪', text: 'Thua' },
  draw: { icon: '🤝', text: 'Hòa' },
  unfinished: { icon: '⏳', text: 'Chưa xong' },
};

$('btn-history').onclick = () => { show('history'); loadHistory(true); };
$('btn-history-back').onclick = goLobby;
$('btn-history-more').onclick = () => loadHistory(false);

async function loadHistory(reset) {
  if (reset) {
    historyOffset = 0;
    $('history-list').replaceChildren();
    $('history-stats').replaceChildren(el('span', 'stat', 'Đang tải...'));
    $('history-empty').hidden = true;
    $('btn-history-more').hidden = true;
    await flushOutbox(); // gửi nốt kết quả còn chờ để trận mới nhất có mặt
  }
  try {
    const [stats, rows] = await Promise.all([
      reset ? net.myStats() : null,
      net.listMatches(historyOffset, HISTORY_PAGE),
    ]);
    if (stats) {
      $('history-stats').replaceChildren(
        el('span', 'stat', `🎮 ${stats.played} trận`), el('span', 'stat', `🏆 ${stats.wins}`),
        el('span', 'stat', `💪 ${stats.losses}`), el('span', 'stat', `🤝 ${stats.draws}`),
      );
    }
    const myId = net.getUserId();
    $('history-list').append(...rows.map((row) => historyRow(summarizeMatch(row, myId))));
    historyOffset += rows.length;
    $('history-empty').hidden = historyOffset > 0;
    $('btn-history-more').hidden = rows.length < HISTORY_PAGE;
  } catch (e) {
    $('history-stats').replaceChildren();
    toast(errorText(e));
  }
}

/** Một trận trong danh sách; bấm để mở/đóng chi tiết từng câu. */
function historyRow(s) {
  const o = OUTCOME[s.outcome];
  const row = el('button', `hrow ${s.outcome}`);
  const score = s.me.total === null || s.opp.total === null ? '' : `${s.me.total} – ${s.opp.total}`;
  const top = el('div', 'hrow-top');
  top.append(el('span', 'hav', s.opp.avatar), el('span', 'hname', `${o.icon} ${s.opp.name}`), el('span', 'hscore', score));
  const meta = [formatWhen(s.when), SET_LABEL.get(s.setId) ?? s.setId, `${s.seconds}s`, o.text + (s.forfeit ? ' (bỏ cuộc)' : '')];
  row.append(top, el('div', 'hmeta', meta.filter(Boolean).join(' · ')));

  let detail = null;
  row.onclick = () => {
    if (detail) { detail.remove(); detail = null; return; }
    detail = historyDetail(s);
    row.append(detail);
  };
  return row;
}

/** Chi tiết từng câu: lá cờ, nước đúng, bé chọn gì, điểm và thời gian. */
function historyDetail(s) {
  const box = el('div', 'hdetail');
  if (!s.answers.length) box.append(el('div', 'hmeta', 'Không có chi tiết từng câu.'));
  for (const a of s.answers) {
    const flag = el('span', /^[a-z]{2}$/.test(a.code) ? `fi fi-${a.code}` : 'fi');
    const name = (c) => COUNTRY_NAME.get(c) ?? c;
    const verdict = a.pick === a.code ? '✅' : a.pick === null ? '⏰ hết giờ' : `❌ chọn ${name(a.pick)}`;
    const text = el('div', null, name(a.code));
    text.append(el('div', 'hq-sub', verdict));
    const secs = a.ms === null ? '' : ` · ${(a.ms / 1000).toFixed(1)}s`;
    const q = el('div', 'hq');
    q.append(flag, text, el('span', 'hq-pts', `+${a.points}${secs}`));
    box.append(q);
  }
  return box;
}

// ---- khởi động ----
renderAvatars();
renderKeyboard();
renderCode();
if (profile) goLobby();
else show('welcome');
startNet();
