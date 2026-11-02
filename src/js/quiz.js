import { createRng, shuffle } from './rng.js';

/**
 * Chọn bộ cờ. "ngau-nhien" chọn ổn định theo seed để hai máy ra cùng bộ.
 * @param {{id: string}[]} sets
 * @param {string} setId
 * @param {string} seed
 */
export function pickSet(sets, setId, seed) {
  if (setId === 'ngau-nhien') {
    const rng = createRng(`${seed}:set`);
    return sets[Math.floor(rng() * sets.length)];
  }
  const found = sets.find((s) => s.id === setId);
  if (!found) throw new Error(`Không tìm thấy bộ cờ "${setId}"`);
  return found;
}

/**
 * Sinh bộ câu hỏi từ một bộ cờ. Cùng (set, seed) luôn cho cùng kết quả.
 * @param {{countries: {code: string, name: string}[]}} set
 * @param {string} seed
 * @param {{questionsPerMatch: number, distractorCount: number}} cfg
 * @returns {{code: string, options: {code: string, name: string}[], answerIndex: number}[]}
 */
export function buildQuiz(set, seed, cfg) {
  const optionCount = cfg.distractorCount + 1;
  if (set.countries.length < optionCount) {
    throw new Error(`Bộ cờ cần ít nhất ${optionCount} nước`);
  }
  const rng = createRng(`${seed}:quiz`);
  const count = Math.min(cfg.questionsPerMatch, set.countries.length);
  const targets = shuffle(set.countries, rng).slice(0, count);

  return targets.map((target) => {
    const distractors = shuffle(
      set.countries.filter((c) => c.code !== target.code),
      rng,
    ).slice(0, cfg.distractorCount);
    const options = shuffle([target, ...distractors], rng);
    return {
      code: target.code,
      options,
      answerIndex: options.findIndex((o) => o.code === target.code),
    };
  });
}
