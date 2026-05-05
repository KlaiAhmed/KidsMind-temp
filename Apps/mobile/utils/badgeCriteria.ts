// Apps/mobile/utils/badgeCriteria.ts

interface BadgeCriteria {
  type: string;
  threshold: number;
}

export function formatCriteria(raw: string): string {
  if (!raw || raw.trim() === '') {
    return '';
  }

  // If already a human-readable string (not JSON), return as-is
  const firstChar = raw.trim()[0];
  if (firstChar !== '{' && firstChar !== '[') {
    return raw;
  }

  try {
    const parsed = JSON.parse(raw) as BadgeCriteria;
    const { type, threshold } = parsed;

    switch (type) {
      case 'STREAK_DAYS':
        return `Log in ${threshold} days in a row`;
      case 'TOTAL_QUIZZES':
        return `Complete ${threshold} quizzes`;
      case 'TOTAL_CORRECT':
        return `Answer ${threshold} questions correctly`;
      case 'TOTAL_PERFECT':
        return 'Score 100% on any quiz';
      case 'XP_MILESTONE':
        return `Reach ${threshold} XP`;
      default:
        return `Complete the challenge`;
    }
  } catch {
    return '';
  }
}
