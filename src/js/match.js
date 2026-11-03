import { scoreQuestion, decideWinner } from './scoring.js';

/**
 * Trạng thái một trận đấu giữa hai bé ('a' và 'b'). Không phụ thuộc giao diện
 * hay mạng, nên chạy được cả chế độ chung iPad lẫn online.
 * @param {{answerIndex: number}[]} quiz
 * @param {object} cfg Cấu hình trận (xem game-config.json).
 */
export function createMatch(quiz, cfg) {
  const totals = { a: 0, b: 0 };
  let index = 0;
  let answers = { a: null, b: null };
  /** Đáp án từng câu, để nhận đáp án đến muộn qua mạng. */
  const history = [answers];

  return {
    /** Câu hỏi hiện tại, hoặc undefined khi hết đề. */
    get question() { return quiz[index]; },
    get index() { return index; },
    get total() { return quiz.length; },
    get totals() { return { ...totals }; },
    get finished() { return index >= quiz.length; },

    /** Cả hai bé đã trả lời chưa. */
    get questionDone() { return answers.a !== null && answers.b !== null; },

    /**
     * Ghi đáp án của một bé. Mỗi bé chỉ được chọn một lần mỗi câu.
     * @param {'a'|'b'} player
     * @param {number} optionIndex
     * @param {number} elapsedMs
     * @returns {number|null} Điểm nhận được, hoặc null nếu bị từ chối.
     */
    answer(player, optionIndex, elapsedMs) {
      if (this.finished || answers[player] !== null) return null;
      const correct = optionIndex === quiz[index].answerIndex;
      const points = scoreQuestion({ correct, elapsedMs }, cfg);
      answers[player] = { optionIndex, correct, points, elapsedMs };
      totals[player] += points;
      return points;
    },

    /**
     * Bé nào chưa trả lời thì tính bỏ qua (0 điểm) khi hết giờ.
     * @param {('a'|'b')[]} [players] Chỉ áp dụng cho các bé này (mặc định cả hai).
     */
    timeout(players = ['a', 'b']) {
      for (const p of players) {
        if (answers[p] === null) answers[p] = { optionIndex: null, correct: false, points: 0, elapsedMs: null };
      }
    },

    /**
     * Nhận đáp án của một câu đã qua (đến muộn do mạng). Chỉ thay được câu
     * đang bị tính "hết giờ", không đè đáp án thật.
     * @returns {number|null} Điểm cộng thêm, hoặc null nếu bị từ chối.
     */
    lateAnswer(questionIndex, player, optionIndex, elapsedMs) {
      const record = history[questionIndex]?.[player];
      if (!record || record.optionIndex !== null) return null;
      const correct = optionIndex === quiz[questionIndex].answerIndex;
      const points = scoreQuestion({ correct, elapsedMs }, cfg);
      Object.assign(record, { optionIndex, correct, points, elapsedMs });
      totals[player] += points;
      return points;
    },

    /**
     * Kết quả từng câu của một bé, để lưu vào lịch sử. Bỏ qua câu bé chưa có đáp án.
     * Lưu mã lá cờ và nước đã chọn (không lưu chỉ số đáp án) để lịch sử vẫn đúng khi
     * dữ liệu bộ cờ thay đổi sau này.
     * @param {'a'|'b'} player
     * @returns {{q: number, code: string, pick: string|null, ms: number|null, points: number}[]}
     */
    results(player) {
      const out = [];
      history.forEach((rec, q) => {
        const r = rec[player];
        if (!r) return;
        out.push({
          q,
          code: quiz[q].code,
          pick: r.optionIndex === null ? null : quiz[q].options[r.optionIndex].code,
          ms: r.elapsedMs === null ? null : Math.round(r.elapsedMs),
          points: r.points,
        });
      });
      return out;
    },

    /** Kết quả từng bé ở câu hiện tại. */
    get currentAnswers() { return { ...answers }; },

    /** Sang câu kế tiếp. */
    next() {
      index += 1;
      answers = { a: null, b: null };
      history[index] = answers;
    },

    /** @returns {'a'|'b'|'draw'} */
    winner() { return decideWinner(totals.a, totals.b); },
  };
}
