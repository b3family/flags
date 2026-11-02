/**
 * Số giây còn lại của một câu, làm tròn lên, kẹp trong [0, questionTimeSeconds].
 * @param {number} elapsedMs Thời gian đã trôi qua kể từ lúc câu hỏi hiện ra.
 * @param {{questionTimeSeconds: number}} cfg
 * @returns {number}
 */
export function secondsLeft(elapsedMs, cfg) {
  const total = cfg.questionTimeSeconds;
  const left = Math.ceil(total - Math.max(0, elapsedMs) / 1000);
  return Math.min(total, Math.max(0, left));
}

/**
 * Điểm của một câu: đúng thì bằng số giây còn lại (tối thiểu minPointsCorrect),
 * sai hoặc không trả lời thì 0.
 * @param {{correct: boolean|null, elapsedMs: number|null}} answer
 * @param {{questionTimeSeconds: number, minPointsCorrect: number}} cfg
 * @returns {number}
 */
export function scoreQuestion(answer, cfg) {
  if (answer.correct !== true || answer.elapsedMs == null) return 0;
  return Math.max(cfg.minPointsCorrect, secondsLeft(answer.elapsedMs, cfg));
}

/**
 * So sánh tổng điểm hai bé.
 * @returns {'a'|'b'|'draw'}
 */
export function decideWinner(totalA, totalB) {
  if (totalA > totalB) return 'a';
  if (totalB > totalA) return 'b';
  return 'draw';
}
