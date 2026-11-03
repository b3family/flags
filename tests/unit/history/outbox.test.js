import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOutbox } from '../../../src/js/outbox.js';

/** Storage giả giống localStorage, để test không phụ thuộc trình duyệt. */
function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
  };
}

const item = (code, startedAt) => ({ id: `${code}:${startedAt}`, code, startedAt, answers: [], opponentLeft: false });

test('outbox: thêm rồi đọc lại được, khởi tạo lại vẫn còn (bền qua reload)', () => {
  const storage = fakeStorage();
  createOutbox(storage).add(item('ABCD', 't1'));
  assert.equal(createOutbox(storage).all().length, 1);
});

test('outbox: thêm trùng id thì thay thế chứ không nhân đôi', () => {
  const box = createOutbox(fakeStorage());
  box.add(item('ABCD', 't1'));
  box.add({ ...item('ABCD', 't1'), opponentLeft: true });
  assert.equal(box.all().length, 1);
  assert.equal(box.all()[0].opponentLeft, true);
});

test('outbox: remove chỉ xóa đúng mục theo id', () => {
  const box = createOutbox(fakeStorage());
  box.add(item('AAAA', 't1'));
  box.add(item('BBBB', 't2'));
  box.remove('AAAA:t1');
  assert.deepEqual(box.all().map((i) => i.code), ['BBBB']);
});

test('outbox: dữ liệu hỏng trong storage không làm app lỗi, coi như rỗng', () => {
  const box = createOutbox(fakeStorage({ 'cothunhi.outbox': '{không-phải-json' }));
  assert.deepEqual(box.all(), []);
  box.add(item('ABCD', 't1'));
  assert.equal(box.all().length, 1);
});

test('outbox: storage ném lỗi (chế độ riêng tư) thì add/all không ném ra ngoài', () => {
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const box = createOutbox(broken);
  assert.doesNotThrow(() => box.add(item('ABCD', 't1')));
  assert.deepEqual(box.all(), []);
});
