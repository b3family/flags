import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildQuiz, pickSet } from '../../../src/js/quiz.js';

const cfg = JSON.parse(readFileSync(new URL('../../../src/config/game-config.json', import.meta.url)));
const { sets } = JSON.parse(readFileSync(new URL('../../../src/data/flag-sets.json', import.meta.url)));

test('dữ liệu: có >= 5 bộ cờ, mỗi bộ >= 8 nước, mã nước không trùng trong bộ', () => {
  assert.ok(sets.length >= 5);
  for (const s of sets) {
    assert.ok(s.countries.length >= 8, `${s.id} có ít hơn 8 nước`);
    const codes = new Set(s.countries.map((c) => c.code));
    assert.equal(codes.size, s.countries.length, `${s.id} có mã trùng`);
  }
});

test('buildQuiz: cùng seed cho ra cùng đề (hai máy thấy giống nhau)', () => {
  const a = buildQuiz(sets[0], 'seed-1', cfg);
  const b = buildQuiz(sets[0], 'seed-1', cfg);
  assert.deepEqual(a, b);
});

test('buildQuiz: khác seed thì đề khác', () => {
  const a = buildQuiz(sets[2], 'seed-1', cfg);
  const b = buildQuiz(sets[2], 'seed-2', cfg);
  assert.notDeepEqual(a, b);
});

test('buildQuiz: mỗi câu có 4 đáp án khác nhau và chứa đáp án đúng', () => {
  for (const s of sets) {
    const quiz = buildQuiz(s, 'abc', cfg);
    for (const q of quiz) {
      assert.equal(q.options.length, cfg.distractorCount + 1);
      assert.equal(new Set(q.options.map((o) => o.code)).size, q.options.length);
      assert.equal(q.options[q.answerIndex].code, q.code);
    }
  }
});

test('buildQuiz: không lặp lá cờ giữa các câu, số câu = min(cấu hình, số nước)', () => {
  for (const s of sets) {
    const quiz = buildQuiz(s, 'xyz', cfg);
    assert.equal(quiz.length, Math.min(cfg.questionsPerMatch, s.countries.length));
    assert.equal(new Set(quiz.map((q) => q.code)).size, quiz.length);
  }
});

test('buildQuiz: bộ cờ quá ít nước thì báo lỗi', () => {
  const tiny = { id: 't', name: 't', countries: sets[0].countries.slice(0, 3) };
  assert.throws(() => buildQuiz(tiny, 's', cfg), /ít nhất/);
});

test('pickSet: "ngau-nhien" chọn ổn định theo seed, id cụ thể trả đúng bộ', () => {
  assert.equal(pickSet(sets, 'ngau-nhien', 's1').id, pickSet(sets, 'ngau-nhien', 's1').id);
  assert.equal(pickSet(sets, 'chau-au', 'whatever').id, 'chau-au');
  assert.throws(() => pickSet(sets, 'khong-co', 's'), /Không tìm thấy/);
});
