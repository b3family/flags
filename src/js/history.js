/**
 * Chuyển một dòng bảng `matches` thành dạng dễ hiển thị theo góc nhìn của một bé.
 * @param {object} row Dòng trong bảng matches.
 * @param {string} myId User id của bé đang xem.
 * @returns {{
 *   id: string, code: string, when: string, setId: string, seconds: number,
 *   me: {name: string, avatar: string, total: number|null},
 *   opp: {name: string, avatar: string, total: number|null},
 *   outcome: 'win'|'lose'|'draw'|'unfinished', forfeit: boolean,
 *   answers: {code: string, pick: string|null, ms: number|null, points: number}[]
 * }}
 */
export function summarizeMatch(row, myId) {
  const mine = row.host_id === myId ? 'host' : row.guest_id === myId ? 'guest' : null;
  if (!mine) throw new Error('Trận này không thuộc về bé đang xem');
  const theirs = mine === 'host' ? 'guest' : 'host';

  let outcome = 'unfinished';
  if (row.winner === 'draw') outcome = 'draw';
  else if (row.winner === mine) outcome = 'win';
  else if (row.winner === theirs) outcome = 'lose';

  const side = (s) => ({ name: row[`${s}_name`], avatar: row[`${s}_avatar`], total: row[`${s}_total`] });
  return {
    id: row.id,
    code: row.room_code,
    when: row.started_at,
    setId: row.set_id,
    seconds: row.question_seconds,
    me: side(mine),
    opp: side(theirs),
    outcome,
    forfeit: row.ended_by === 'forfeit',
    answers: row[`${mine}_answers`] ?? [],
  };
}

/**
 * Định dạng thời điểm theo giờ máy: dd/MM HH:mm. Giá trị hỏng trả về chuỗi rỗng.
 * @param {string|null} iso
 * @returns {string}
 */
export function formatWhen(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
