export type HaldolPhase = 'INJECTION' | 'ZOMBIE' | 'MODERATE' | 'BEST';

export interface CycleStatus {
  day: number;
  phase: HaldolPhase;
  label: string;
  effortLevel: number;
}

/**
 * Calculates the Haldol cycle status based on an anchor injection date and a target date.
 * The cycle is a repeating 14-day cycle with distinct phases.
 * 
 * @param anchorDate The date of any known Haldol injection
 * @param targetDate The date to calculate the status for (defaults to now)
 * @returns CycleStatus object containing the day, phase, label, and effort level
 */
export const getCycleStatus = (anchorDate: Date, targetDate: Date = new Date()): CycleStatus => {
  // Ensure we are working with UTC midnight to avoid timezone shifting issues
  const anchor = new Date(anchorDate).setHours(0, 0, 0, 0);
  const target = new Date(targetDate).setHours(0, 0, 0, 0);
  
  const diffTime = Math.abs(target - anchor);
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  const cycleDay = diffDays % 14;

  let phase: HaldolPhase;
  let label: string;
  let effortLevel: number;

  if (cycleDay === 0) {
    phase = 'INJECTION';
    label = 'Injection Day';
    effortLevel = 0.8;
  } else if (cycleDay >= 1 && cycleDay <= 5) {
    phase = 'ZOMBIE';
    label = 'Rest Phase (Zombie)';
    effortLevel = 0.2;
  } else if (cycleDay >= 6 && cycleDay <= 9) {
    phase = 'MODERATE';
    label = 'Building Phase';
    effortLevel = 0.5;
  } else {
    phase = 'BEST';
    label = 'Best Window';
    effortLevel = 1.0;
  }

  return {
    day: cycleDay,
    phase,
    label,
    effortLevel
  };
};

/**
 * Returns the UI Tailwind color class for a given phase.
 */
export const getPhaseColor = (phase: HaldolPhase): string => {
  switch (phase) {
    case 'INJECTION': return 'text-blue-400';
    case 'ZOMBIE': return 'text-slate-500'; // Dimmed for unconditional acceptance
    case 'MODERATE': return 'text-yellow-500';
    case 'BEST': return 'text-green-500';
    default: return 'text-slate-400';
  }
};
