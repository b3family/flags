import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreQuestion, decideWinner, secondsLeft } from '../../../src/js/scoring.js';

const cfg = { questionTimeSeconds: 10, minPointsCorrect: 1 };

test('scoreQuestion: đúng ngay lập tức được điểm tối đa', () => {
  assert.equal(scoreQuestion({ correct: true, elapsedMs: 0 }, cfg), 10);
});

test('scoreQuestion: đúng càng muộn càng ít điểm', () => {
  const early = scoreQuestion({ correct: true, elapsedMs: 2000 }, cfg);
  const late = scoreQuestion({ correct: true, elapsedMs: 8000 }, cfg);
  assert.equal(early, 8);
  assert.equal(late, 2);
  assert.ok(early > late);
});

test('scoreQuestion: đúng ở giây cuối vẫn được tối thiểu 1 điểm', () => {
  assert.equal(scoreQuestion({ correct: true, elapsedMs: 9999 }, cfg), 1);
  assert.equal(scoreQuestion({ correct: true, elapsedMs: 10000 }, cfg), 1);
});

test('scoreQuestion: sai hoặc không trả lời được 0 điểm', () => {
  assert.equal(scoreQuestion({ correct: false, elapsedMs: 100 }, cfg), 0);
  assert.equal(scoreQuestion({ correct: null, elapsedMs: null }, cfg), 0);
});

test('scoreQuestion: elapsed âm hoặc vượt giờ bị kẹp trong khoảng hợp lệ', () => {
  assert.equal(scoreQuestion({ correct: true, elapsedMs: -500 }, cfg), 10);
  assert.equal(scoreQuestion({ correct: true, elapsedMs: 99999 }, cfg), 1);
});

test('secondsLeft: không âm và không vượt thời gian câu hỏi', () => {
  assert.equal(secondsLeft(0, cfg), 10);
  assert.equal(secondsLeft(10000, cfg), 0);
  assert.equal(secondsLeft(20000, cfg), 0);
  assert.equal(secondsLeft(-1, cfg), 10);
});

test('decideWinner: điểm cao hơn thắng, bằng nhau là hòa', () => {
  assert.equal(decideWinner(50, 30), 'a');
  assert.equal(decideWinner(30, 50), 'b');
  assert.equal(decideWinner(40, 40), 'draw');
});
