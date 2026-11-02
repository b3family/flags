import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildShareUrl, parseRoomParam } from '../../../src/js/share.js';

test('buildShareUrl: bỏ query và hash cũ, giữ đường dẫn /flags/', () => {
  assert.equal(
    buildShareUrl('https://b3family.github.io/flags/?x=1#abc'),
    'https://b3family.github.io/flags/',
  );
});

test('buildShareUrl: có mã phòng thì thêm ?room=MÃ viết hoa', () => {
  assert.equal(
    buildShareUrl('https://b3family.github.io/flags/', 'k7m2'),
    'https://b3family.github.io/flags/?room=K7M2',
  );
});

test('buildShareUrl: thay mã phòng cũ trong URL thay vì nối thêm', () => {
  assert.equal(
    buildShareUrl('https://b3family.github.io/flags/?room=AAAA', 'BBBB'),
    'https://b3family.github.io/flags/?room=BBBB',
  );
});

test('parseRoomParam: lấy mã hợp lệ và viết hoa', () => {
  assert.equal(parseRoomParam('?room=k7m2'), 'K7M2');
  assert.equal(parseRoomParam('?a=1&room=THTD'), 'THTD');
});

test('parseRoomParam: từ chối mã sai độ dài, ký tự lạ hoặc không có', () => {
  assert.equal(parseRoomParam(''), null);
  assert.equal(parseRoomParam('?room=ABC'), null);
  assert.equal(parseRoomParam('?room=ABCDE'), null);
  assert.equal(parseRoomParam('?room=<b>1'), null);
});
