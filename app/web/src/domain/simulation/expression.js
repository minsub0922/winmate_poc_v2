/** A finite satisfaction score wins over setup mood and the look's resting face. */
export function resolveExpression(satisfaction, mood, base = 'flat') {
  if (typeof satisfaction === 'number' && Number.isFinite(satisfaction)) {
    return satisfaction >= 60 ? 'happy' : satisfaction >= 40 ? 'flat' : 'stern';
  }
  if (mood === '만족' || mood === '호의') return 'happy';
  if (mood === '의심' || mood === '불만') return 'stern';
  if (mood === '중립') return 'flat';
  return base === 'happy' || base === 'stern' ? base : 'flat';
}
