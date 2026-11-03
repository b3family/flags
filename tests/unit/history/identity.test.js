import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileProfile } from '../../../src/js/profile.js';

const profile = { name: 'Bin', avatar: '🐼' };

test('reconcileProfile: hồ sơ chưa có playerId thì gắn user id hiện tại (status new)', () => {
  const r = reconcileProfile(profile, 'u1');
  assert.equal(r.status, 'new');
  assert.deepEqual(r.profile, { name: 'Bin', avatar: '🐼', playerId: 'u1' });
});

test('reconcileProfile: cùng playerId thì giữ nguyên (status same)', () => {
  const r = reconcileProfile({ ...profile, playerId: 'u1' }, 'u1');
  assert.equal(r.status, 'same');
  assert.equal(r.profile.playerId, 'u1');
});

test('reconcileProfile: playerId khác user id hiện tại nghĩa là mất danh tính cũ (status changed)', () => {
  const r = reconcileProfile({ ...profile, playerId: 'old' }, 'u2');
  assert.equal(r.status, 'changed');
  assert.equal(r.profile.playerId, 'u2');
  assert.equal(r.previousPlayerId, 'old');
});

test('reconcileProfile: không sửa object đầu vào', () => {
  const input = { ...profile };
  reconcileProfile(input, 'u1');
  assert.equal(input.playerId, undefined);
});
