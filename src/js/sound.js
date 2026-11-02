let ctx = null;

const TONES = {
  tap: [[660, 0.06]],
  good: [[660, 0.1], [880, 0.14]],
  bad: [[260, 0.18]],
  win: [[523, 0.12], [659, 0.12], [784, 0.12], [1046, 0.3]],
};

/**
 * Phát một âm ngắn bằng WebAudio (không cần file âm thanh).
 * @param {'tap'|'good'|'bad'|'win'} kind
 */
export function beep(kind) {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    let t = ctx.currentTime;
    for (const [freq, dur] of TONES[kind]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur);
      t += dur;
    }
  } catch { /* thiết bị không hỗ trợ âm thanh: bỏ qua */ }
}
