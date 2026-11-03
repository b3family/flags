import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeMatch, formatWhen } from '../../../src/js/history.js';

const ME = 'user-me';
const OTHER = 'user-other';

const baseRow = {
  id: 'm1',
  room_code: 'ABCD',
  started_at: '2026-11-03T07:05:00.000+00:00',
  set_id: 'chau-au',
  question_seconds: 10,
  host_id: ME,
  guest_id: OTHER,
  host_name: 'Bin',
  host_avatar: '🐼',
  guest_name: 'Mít',
  guest_avatar: '🦊',
  host_total: 60,
  guest_total: 45,
  host_answers: [{ code: 'fr', pick: 'fr', ms: 1200, points: 9 }],
  guest_answers: [{ code: 'fr', pick: 'de', ms: 3000, points: 0 }],
  winner: 'host',
  ended_by: 'finished',
};

test('summarizeMatch: bé là chủ phòng và thắng thì me=host, outcome=win', () => {
  const s = summarizeMatch(baseRow, ME);
  assert.equal(s.outcome, 'win');
  assert.deepEqual(s.me, { name: 'Bin', avatar: '🐼', total: 60 });
  assert.deepEqual(s.opp, { name: 'Mít', avatar: '🦊', total: 45 });
  assert.equal(s.answers[0].points, 9);
});

test('summarizeMatch: bé là khách thì me=guest và thắng/thua đảo theo phía', () => {
  const s = summarizeMatch(baseRow, OTHER);
  assert.equal(s.outcome, 'lose');
  assert.equal(s.me.name, 'Mít');
  assert.equal(s.me.total, 45);
  assert.equal(s.opp.name, 'Bin');
  assert.equal(s.answers[0].pick, 'de');
});

test('summarizeMatch: hòa, chưa kết thúc và bỏ cuộc được phân biệt', () => {
  assert.equal(summarizeMatch({ ...baseRow, winner: 'draw' }, ME).outcome, 'draw');
  assert.equal(summarizeMatch({ ...baseRow, winner: null }, ME).outcome, 'unfinished');
  const f = summarizeMatch({ ...baseRow, ended_by: 'forfeit' }, ME);
  assert.equal(f.forfeit, true);
  assert.equal(f.outcome, 'win');
});

test('summarizeMatch: điểm hoặc đáp án chưa có thì total null và answers rỗng', () => {
  const s = summarizeMatch({ ...baseRow, host_total: null, host_answers: null, winner: null }, ME);
  assert.equal(s.me.total, null);
  assert.deepEqual(s.answers, []);
});

test('summarizeMatch: người không thuộc trận thì báo lỗi', () => {
  assert.throws(() => summarizeMatch(baseRow, 'stranger'), /không thuộc/);
});

test('formatWhen: định dạng dd/MM HH:mm theo giờ máy', () => {
  const iso = new Date(2026, 10, 3, 14, 5).toISOString();
  assert.equal(formatWhen(iso), '03/11 14:05');
});

test('formatWhen: giá trị hỏng trả về chuỗi rỗng, không ném lỗi', () => {
  assert.equal(formatWhen('khong-phai-ngay'), '');
  assert.equal(formatWhen(null), '');
});
