import { buildQuiz, pickSet } from './quiz.js';
import { createMatch } from './match.js';
import { secondsLeft } from './scoring.js';
import { beep } from './sound.js';
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

// ---- điều hướng màn hình ----
const screens = ['welcome', 'lobby', 'sets', 'join', 'room', 'game'];
function show(name) {
  for (const s of screens) $(`screen-${s}`).hidden = s !== name;
}

// ---- mạng: đăng nhập ẩn danh ngầm khi mở app ----
let netReady = false;
const netStarting = net.initNet().then(() => { netReady = true; }).catch(() => { netReady = false; });
function refreshNetButtons() {
  $('btn-create-room').disabled = !netReady;
  $('btn-join-room').disabled = !netReady;
  $('net-hint').textContent = netReady ? '' : 'Chưa có mạng — vẫn chơi chung 1 iPad được nhé.';
}
netStarting.then(refreshNetButtons);

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
  profile = { name: $('name-input').value.trim().slice(0, cfg.nameMaxLength), avatar: chosenAvatar };
  saveProfile(profile);
  goLobby();
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
$('btn-local').onclick = () => show('sets');
$('btn-sets-back').onclick = goLobby;

// ---- chọn bộ cờ (chế độ chung 1 iPad) ----
function renderSets() {
  const cards = sets.map((s) => setCard(s.id, s.icon, s.name));
  const random = setCard('ngau-nhien', '🎲', 'Ngẫu nhiên');
  random.classList.add('random');
  $('set-grid').replaceChildren(...cards, random);
}
function setCard(id, icon, name) {
  const b = el('button', 'set-card');
  b.append(el('span', 'emoji', icon), name);
  b.onclick = () => startLocalMatch(id);
  return b;
}

// ===========================================================================
// Trận đấu: dùng chung cho chế độ chung 1 iPad (local) và online
// ===========================================================================
/** Trận đang chạy: { match, players, online, ... } hoặc null. */
let active = null;
let lastSetId = 'ngau-nhien';

function stopMatch() {
  if (!active) return;
  clearInterval(active.ticker);
  clearTimeout(active.nextTimer);
  clearTimeout(active.forfeitTimer);
  active = null;
}

function runMatch({ match, players, online }) {
  stopMatch();
  $('popup').hidden = true;
  active = {
    match, players, online,
    pending: {}, buttons: { a: [], b: [] },
    startedAt: 0, revealed: false, selfTimedOut: false, over: false,
    ticker: null, nextTimer: null, forfeitTimer: null,
  };
  $('bot-avatar').textContent = players.a.avatar;
  $('bot-name').textContent = players.a.name;
  $('top-avatar').textContent = players.b.avatar;
  $('top-name').textContent = players.b.name;
  $('screen-game').classList.toggle('online', online);
  $('panel-top').classList.toggle('panel-flip', !online);
  $('top-options').hidden = online;
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
  const { match, online, players } = A;
  if (match.finished) return endMatch();

  const q = match.question;
  A.revealed = false;
  A.selfTimedOut = false;
  A.startedAt = performance.now();
  $('flag').replaceChildren(Object.assign(el('span', `fi fi-${q.code}`), { role: 'img' }));
  $('flag').firstChild.setAttribute('aria-label', 'Lá cờ');
  $('qcount').textContent = `Câu ${match.index + 1} / ${match.total}`;
  $('feedback').textContent = '';
  $('top-tick').hidden = true;
  updateScores();

  const seats = online ? [['a', 'bot-options']] : [['a', 'bot-options'], ['b', 'top-options']];
  for (const [player, containerId] of seats) {
    A.buttons[player] = q.options.map((opt, i) => {
      const btn = el('button', 'opt', opt.name);
      btn.onclick = () => onPick(player, i);
      return btn;
    });
    $(containerId).replaceChildren(...A.buttons[player]);
  }

  // Đáp án của bé kia có thể đến trước khi mình sang câu này.
  const early = A.pending[match.index];
  if (early) { delete A.pending[match.index]; onRemoteAnswer(early); }

  const total = cfg.questionTimeSeconds * 1000;
  clearInterval(A.ticker);
  A.ticker = setInterval(() => {
    const elapsed = performance.now() - A.startedAt;
    const bar = $('timer-bar');
    bar.style.transform = `scaleX(${Math.max(0, 1 - elapsed / total)})`;
    bar.classList.toggle('low', elapsed > total * 0.7);
    $('timer-num').textContent = secondsLeft(elapsed, cfg);
    if (elapsed < total) return;

    if (!A.selfTimedOut) {
      A.selfTimedOut = true;
      match.timeout(online ? ['a'] : ['a', 'b']);
      for (const p of Object.keys(A.buttons)) A.buttons[p].forEach((b) => { b.disabled = true; });
    }
    if (match.questionDone) return reveal();
    // Chờ thêm một chút cho đáp án của bé kia (độ trễ mạng), rồi bỏ qua.
    if (elapsed >= total + cfg.opponentGraceMs) { match.timeout(); reveal(); }
  }, 50);
}

function onPick(player, optionIndex) {
  const A = active;
  if (!A || A.revealed) return;
  const elapsed = performance.now() - A.startedAt;
  const pts = A.match.answer(player, optionIndex, elapsed);
  if (pts === null) return;
  A.buttons[player].forEach((b) => { b.disabled = true; });
  A.buttons[player][optionIndex].classList.add('picked');
  beep('tap');
  if (A.online && player === 'a') A.channel?.sendAnswer(A.match.index, optionIndex, Math.round(elapsed));
  if (A.match.questionDone) reveal();
}

/** Đáp án của bé kia gửi qua mạng. Không tin dữ liệu: kiểm tra kiểu và giới hạn. */
function onRemoteAnswer(msg) {
  const A = active;
  if (!A || !A.online || !msg) return;
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
  const { match, players, online } = A;
  const q = match.question;
  const ans = match.currentAnswers;
  for (const p of Object.keys(A.buttons)) {
    A.buttons[p].forEach((btn, i) => {
      btn.disabled = true;
      if (i === q.answerIndex) btn.classList.add('correct');
      else if (i === ans[p].optionIndex) btn.classList.add('wrong');
    });
  }
  $('top-tick').hidden = true;
  updateScores();
  $('feedback').textContent = online
    ? `+${ans.a.points}${ans.b.points ? `  ·  ${players.b.name} +${ans.b.points}` : ''}`
    : `${players.a.name} +${ans.a.points}  ·  ${players.b.name} +${ans.b.points}`;
  beep(ans.a.correct || ans.b.correct ? 'good' : 'bad');
  A.nextTimer = setTimeout(() => { match.next(); askQuestion(); }, cfg.revealDelayMs);
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
  const { match, players, online } = A;
  const { a, b } = match.totals;
  const w = match.winner();
  const detail = `${players.a.name}: ${a} điểm  ·  ${players.b.name}: ${b} điểm`;

  if (online) {
    net.finishRoom(onlineCtx.code).catch(() => {});
    if (w === 'draw') showPopup({ kind: 'draw', emoji: '🤝', title: 'Hòa nhau!', detail, sound: 'good' });
    else if (w === 'a') showPopup({ kind: 'win', emoji: '🏆', title: 'Bạn thắng!', detail, sound: 'win' });
    else showPopup({ kind: 'lose', emoji: '💪', title: 'Cố lên lần sau!', detail, sound: 'good' });
  } else if (w === 'draw') {
    showPopup({ kind: 'draw', emoji: '🤝', title: 'Hòa nhau!', detail, sound: 'good' });
  } else {
    showPopup({ kind: 'win', emoji: '🏆', title: `${players[w].name} thắng!`, detail, sound: 'win' });
  }
}

/** Bé kia rời giữa trận: bé còn lại thắng. */
function forfeit() {
  const A = active;
  if (!A || A.over) return;
  A.over = true;
  clearInterval(A.ticker);
  clearTimeout(A.nextTimer);
  const { a, b } = A.match.totals;
  showPopup({
    kind: 'win', emoji: '🏆', title: 'Bạn thắng!', sound: 'win',
    detail: `${A.players.b.name} đã rời đi. ${A.players.a.name}: ${a} · ${A.players.b.name}: ${b}`,
  });
}

// ---- chế độ 2 bé chung 1 iPad ----
function startLocalMatch(setId) {
  lastSetId = setId;
  onlineCtx = null;
  const seed = `${Date.now()}-${Math.random()}`;
  const set = pickSet(sets, setId, seed);
  runMatch({
    match: createMatch(buildQuiz(set, seed, cfg), cfg),
    players: {
      a: { name: profile.name, avatar: profile.avatar },
      b: { name: 'Bạn 2', avatar: AVATARS.find((x) => x !== profile.avatar) },
    },
    online: false,
  });
}

// ===========================================================================
// Online: nhập mã, phòng chờ, vào trận
// ===========================================================================
/** Phòng online hiện tại: { code, isHost, room, startedKey, channel, unsubscribe, goneTimer } hoặc null. */
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
    startedKey: null, goneTimer: null, channel: null, unsubscribe: null,
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
  if (active?.online) {
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

  const chipList = [...sets.map((s) => ({ id: s.id, label: `${s.icon} ${s.name}` })), { id: 'ngau-nhien', label: '🎲 Ngẫu nhiên' }];
  $('room-set-label').textContent = ctx.isHost ? 'Chọn bộ cờ' : 'Bộ cờ do bạn kia chọn';
  $('room-sets').replaceChildren(...chipList.map((c) => {
    const b = el('button', `chip${room.set_id === c.id ? ' selected' : ''}`, c.label);
    b.disabled = !ctx.isHost;
    b.onclick = () => guarded(async () => { await net.setRoomSet(room.code, c.id); });
    return b;
  }));

  const ready = $('btn-ready');
  ready.disabled = !opp || room.status !== 'lobby';
  ready.textContent = me?.ready ? '✋ Chờ bạn kia...' : '✅ Sẵn sàng!';
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
  const set = pickSet(sets, room.set_id, seed);
  const mine = ctx.isHost
    ? { name: room.host_name, avatar: room.host_avatar }
    : { name: room.guest_name, avatar: room.guest_avatar };
  const theirs = ctx.isHost
    ? { name: room.guest_name, avatar: room.guest_avatar }
    : { name: room.host_name, avatar: room.host_avatar };
  runMatch({
    match: createMatch(buildQuiz(set, seed, cfg), cfg),
    players: { a: mine, b: theirs },
    online: true,
  });
  active.channel = ctx.channel;
}

// ---- popup: chơi lại / về sảnh ----
$('popup-again').onclick = () => {
  if (onlineCtx) {
    guarded(async () => {
      const room = await net.resetRoom(onlineCtx.code);
      stopMatch();
      $('popup').hidden = true;
      onlineCtx.room = room;
      show('room');
      renderRoom(room);
    });
  } else {
    startLocalMatch(lastSetId);
  }
};
$('popup-home').onclick = () => {
  if (onlineCtx) exitRoom();
  else { $('popup').hidden = true; goLobby(); }
};

// ---- khởi động ----
renderAvatars();
renderSets();
renderKeyboard();
renderCode();
if (profile) goLobby();
else show('welcome');
