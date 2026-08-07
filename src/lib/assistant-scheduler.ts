const BASE_LEAD_BUSINESS_DAYS: Record<number, number> = {
  1: 3,
  2: 5,
  3: 10,
  4: 15,
  5: 20,
};

export type ActiveTaskWorkloadInfo = {
  dueDate?: string | null;
};

export function formatDateUtc(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function parseUtcDate(dateStr: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!match) return null;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10) - 1;
  const day = Number.parseInt(match[3], 10);
  return new Date(Date.UTC(year, month, day));
}

export function isWeekendUtc(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6; // Sunday = 0, Saturday = 6
}

export function addBusinessDays(startDate: Date, businessDays: number): Date {
  const current = new Date(
    Date.UTC(
      startDate.getUTCFullYear(),
      startDate.getUTCMonth(),
      startDate.getUTCDate(),
    ),
  );
  let added = 0;
  while (added < businessDays) {
    current.setUTCDate(current.getUTCDate() + 1);
    if (!isWeekendUtc(current)) {
      added += 1;
    }
  }
  return current;
}

export function getBaseLeadBusinessDays(complexity: number): number {
  const clamped = Math.max(1, Math.min(5, Math.round(complexity)));
  return BASE_LEAD_BUSINESS_DAYS[clamped] ?? 10;
}

export function calculateTargetDate(input: {
  complexity: number;
  activeTasks?: ActiveTaskWorkloadInfo[] | null;
  referenceDate?: Date;
}): {
  date: Date;
  dateString: string;
  baseLeadDays: number;
  workloadDays: number;
  totalLeadDays: number;
  isFallback: boolean;
} {
  const ref = input.referenceDate ? new Date(input.referenceDate) : new Date();
  const now = new Date(
    Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()),
  );

  const baseLeadDays = getBaseLeadBusinessDays(input.complexity);

  if (!input.activeTasks) {
    const targetDate = addBusinessDays(now, baseLeadDays);
    return {
      date: targetDate,
      dateString: formatDateUtc(targetDate),
      baseLeadDays,
      workloadDays: 0,
      totalLeadDays: baseLeadDays,
      isFallback: true,
    };
  }

  const activeCount = input.activeTasks.length;
  const workloadDays = Math.min(activeCount * 2, 10);

  let startFloor = new Date(now);
  const thirtyDaysAhead = new Date(now);
  thirtyDaysAhead.setUTCDate(thirtyDaysAhead.getUTCDate() + 30);

  for (const task of input.activeTasks) {
    if (!task.dueDate) continue;
    const taskDate = parseUtcDate(task.dueDate);
    if (!taskDate) continue;

    if (taskDate >= now && taskDate <= thirtyDaysAhead) {
      if (taskDate > startFloor) {
        startFloor = new Date(taskDate);
      }
    }
  }

  const totalLeadDays = baseLeadDays + workloadDays;
  const targetDate = addBusinessDays(startFloor, totalLeadDays);

  return {
    date: targetDate,
    dateString: formatDateUtc(targetDate),
    baseLeadDays,
    workloadDays,
    totalLeadDays,
    isFallback: false,
  };
}

export function parseOrRollDate(
  rawInput: string,
  referenceDate = new Date(),
): {
  date: Date | null;
  dateString: string | null;
  requiresCorrection: boolean;
  message?: string;
} {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { date: null, dateString: null, requiresCorrection: false };
  }

  const ref = new Date(referenceDate);
  const today = new Date(
    Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()),
  );

  // ISO date format: YYYY-MM-DD
  const isoMatch = /^\d{4}-\d{2}-\d{2}$/.exec(trimmed);
  if (isoMatch) {
    const parsed = parseUtcDate(trimmed);
    if (!parsed) {
      return {
        date: null,
        dateString: null,
        requiresCorrection: true,
        message: "Invalid date format.",
      };
    }
    if (parsed < today) {
      return {
        date: parsed,
        dateString: formatDateUtc(parsed),
        requiresCorrection: true,
        message: "Date is in the past. Please select a future date.",
      };
    }
    return {
      date: parsed,
      dateString: formatDateUtc(parsed),
      requiresCorrection: false,
    };
  }

  const explicitYearMatch = /\b(20\d\d)\b/.exec(trimmed);
  if (explicitYearMatch) {
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      return {
        date: null,
        dateString: null,
        requiresCorrection: true,
        message: "Unrecognized date format.",
      };
    }
    const utcDate = new Date(
      Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()),
    );
    if (utcDate < today) {
      return {
        date: utcDate,
        dateString: formatDateUtc(utcDate),
        requiresCorrection: true,
        message: "Past date with an explicit year requires correction.",
      };
    }
    return {
      date: utcDate,
      dateString: formatDateUtc(utcDate),
      requiresCorrection: false,
    };
  }

  // No explicit year specified (e.g. "August 30" or "Aug 5")
  const tempParsed = new Date(`${trimmed}, ${today.getUTCFullYear()}`);
  if (Number.isNaN(tempParsed.getTime())) {
    return {
      date: null,
      dateString: null,
      requiresCorrection: true,
      message: "Unrecognized date format.",
    };
  }

  const parsed = new Date(
    Date.UTC(
      today.getUTCFullYear(),
      tempParsed.getMonth(),
      tempParsed.getDate(),
    ),
  );

  // If month/day has passed in current year, roll to next year's occurrence
  if (parsed < today) {
    parsed.setUTCFullYear(parsed.getUTCFullYear() + 1);
  }

  return {
    date: parsed,
    dateString: formatDateUtc(parsed),
    requiresCorrection: false,
  };
}
