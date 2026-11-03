import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch } from '../../../src/js/match.js';

const cfg = { questionTimeSeconds: 10, minPointsCorrect: 1 };
const quiz = [{ answerIndex: 2 }, { answerIndex: 0 }];

test('match: đúng thì cộng điểm theo giây còn lại, sai thì không', () => {
  const m = createMatch(quiz, cfg);
  assert.equal(m.answer('a', 2, 3000), 7);
  assert.equal(m.answer('b', 1, 1000), 0);
  assert.deepEqual(m.totals, { a: 7, b: 0 });
});

test('match: mỗi bé chỉ trả lời một lần mỗi câu', () => {
  const m = createMatch(quiz, cfg);
  m.answer('a', 0, 1000);
  assert.equal(m.answer('a', 2, 1000), null);
  assert.equal(m.totals.a, 0);
});

test('match: questionDone chỉ true khi cả hai đã trả lời hoặc hết giờ', () => {
  const m = createMatch(quiz, cfg);
  m.answer('a', 2, 1000);
  assert.equal(m.questionDone, false);
  m.timeout();
  assert.equal(m.questionDone, true);
  assert.equal(m.currentAnswers.b.points, 0);
});

test('match: timeout không đè đáp án đã có', () => {
  const m = createMatch(quiz, cfg);
  m.answer('a', 2, 1000);
  m.timeout();
  assert.equal(m.currentAnswers.a.points, 9);
});

test('match: timeout chỉ định bé nào thì bé kia vẫn được chờ', () => {
  const m = createMatch(quiz, cfg);
  m.timeout(['a']);
  assert.equal(m.questionDone, false);
  assert.equal(m.currentAnswers.a.points, 0);
  assert.equal(m.currentAnswers.b, null);
});

test('match: lateAnswer thay thế câu đã bị tính hết giờ và cộng điểm đúng', () => {
  const m = createMatch(quiz, cfg);
  m.timeout();
  m.next();
  assert.equal(m.lateAnswer(0, 'b', 2, 4000), 6);
  assert.equal(m.totals.b, 6);
});

test('match: lateAnswer từ chối khi bé đã có đáp án thật hoặc câu không tồn tại', () => {
  const m = createMatch(quiz, cfg);
  m.answer('a', 2, 1000);
  m.timeout();
  m.next();
  assert.equal(m.lateAnswer(0, 'a', 2, 0), null);
  assert.equal(m.lateAnswer(9, 'b', 0, 0), null);
  assert.equal(m.totals.a, 9);
});

const quizWithOptions = [
  { code: 'fr', answerIndex: 1, options: [{ code: 'de' }, { code: 'fr' }, { code: 'it' }, { code: 'es' }] },
  { code: 'jp', answerIndex: 0, options: [{ code: 'jp' }, { code: 'kr' }, { code: 'cn' }, { code: 'vn' }] },
];

test('match: results trả về từng câu của một bé gồm lá cờ, nước đã chọn, ms và điểm', () => {
  const m = createMatch(quizWithOptions, cfg);
  m.answer('a', 1, 2000);
  m.timeout();
  m.next();
  m.answer('a', 1, 500);
  const r = m.results('a');
  assert.deepEqual(r[0], { q: 0, code: 'fr', pick: 'fr', ms: 2000, points: 8 });
  assert.deepEqual(r[1], { q: 1, code: 'jp', pick: 'kr', ms: 500, points: 0 });
});

test('match: results ghi pick=null và ms=null khi hết giờ không trả lời', () => {
  const m = createMatch(quizWithOptions, cfg);
  m.timeout();
  assert.deepEqual(m.results('b'), [{ q: 0, code: 'fr', pick: null, ms: null, points: 0 }]);
});

test('match: results bỏ qua câu bé chưa có đáp án (chưa tới hoặc đang chờ)', () => {
  const m = createMatch(quizWithOptions, cfg);
  assert.deepEqual(m.results('a'), []);
  m.answer('b', 0, 100);
  assert.deepEqual(m.results('a'), []);
});

test('match: results phản ánh đáp án đến muộn thay cho câu bị tính hết giờ', () => {
  const m = createMatch(quizWithOptions, cfg);
  m.timeout();
  m.next();
  m.lateAnswer(0, 'b', 1, 4000);
  assert.deepEqual(m.results('b')[0], { q: 0, code: 'fr', pick: 'fr', ms: 4000, points: 6 });
});

test('match: next reset đáp án, hết đề thì finished và có người thắng', () => {
  const m = createMatch(quiz, cfg);
  m.answer('a', 2, 0);
  m.timeout();
  m.next();
  assert.equal(m.finished, false);
  assert.equal(m.answer('b', 0, 0), 10);
  m.timeout();
  m.next();
  assert.equal(m.finished, true);
  assert.equal(m.answer('a', 0, 0), null);
  assert.equal(m.winner(), 'draw');
});
