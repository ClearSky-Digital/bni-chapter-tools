import { BNIMember, PartnerPair } from '../types';

export interface RunHistoryItem {
  id: string;
  timestamp: string;
  pairs: { memberA: string; memberB: string }[];
}

export interface SmartPairsResult {
  pairs: PartnerPair[];
  spotlightMember?: BNIMember;
  repeatedCount: number;
}

const HISTORY_KEY = 'bni_1to1_history_v1';
const MAX_HISTORY_RUNS = 4;

export function getRunHistory(): RunHistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Failed to parse history from localStorage', e);
    return [];
  }
}

export function saveRunHistory(pairs: PartnerPair[]): RunHistoryItem[] {
  if (typeof window === 'undefined') return [];
  const currentHistory = getRunHistory();
  
  const newRun: RunHistoryItem = {
    id: `run-${Date.now()}`,
    timestamp: new Date().toISOString(),
    pairs: pairs.map((p) => ({
      memberA: p.memberA.fullName,
      memberB: p.memberB.fullName,
    })),
  };

  const updatedHistory = [newRun, ...currentHistory].slice(0, MAX_HISTORY_RUNS);
  
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updatedHistory));
  } catch (e) {
    console.error('Failed to save history to localStorage', e);
  }

  return updatedHistory;
}

export function clearRunHistory(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(HISTORY_KEY);
}

export function haveMetRecently(
  nameA: string,
  nameB: string,
  history: RunHistoryItem[]
): boolean {
  for (const run of history) {
    for (const pair of run.pairs) {
      if (
        (pair.memberA === nameA && pair.memberB === nameB) ||
        (pair.memberA === nameB && pair.memberB === nameA)
      ) {
        return true;
      }
    }
  }
  return false;
}

export function generateSmartPairs(
  members: BNIMember[],
  history: RunHistoryItem[],
  enableFilter: boolean
): SmartPairsResult {
  if (members.length === 0) return { pairs: [], repeatedCount: 0 };

  const shuffled = [...members].sort(() => Math.random() - 0.5);
  let spotlightMember: BNIMember | undefined = undefined;

  // Extract odd member as the designated Spotlight Target if count is odd
  if (shuffled.length % 2 !== 0) {
    spotlightMember = shuffled.pop();
  }

  const pairs: PartnerPair[] = [];
  let repeatedCount = 0;

  for (let i = 0; i < shuffled.length; i += 2) {
    const memberA = shuffled[i];
    const memberB = shuffled[i + 1];

    if (enableFilter && haveMetRecently(memberA.fullName, memberB.fullName, history)) {
      repeatedCount++;
    }

    pairs.push({
      id: `pair-${i}-${Date.now()}`,
      memberA,
      memberB,
    });
  }

  return { pairs, spotlightMember, repeatedCount };
}