const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

export function toMoneyNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function parseCalendarDate(value, fallback = new Date()) {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  const parsed = new Date(raw || fallback);
  if (Number.isNaN(parsed.getTime())) return parseCalendarDate(fallback, new Date());
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

export function calculateRemainingAmount(targetValue, accumulatedValue) {
  return Math.max(0, toMoneyNumber(targetValue) - toMoneyNumber(accumulatedValue));
}

export function countCalendarDays(startDate, endDate) {
  const start = parseCalendarDate(startDate);
  const end = parseCalendarDate(endDate, start);
  const diff = Math.floor((end.getTime() - start.getTime()) / DAY_MS);
  return Math.max(0, diff + 1);
}

export function countValidDays(startDate, endDate, allowedWeekdays = DEFAULT_WEEKDAYS) {
  const allowed = Array.isArray(allowedWeekdays) && allowedWeekdays.length > 0
    ? allowedWeekdays.map(Number)
    : DEFAULT_WEEKDAYS;
  const start = parseCalendarDate(startDate);
  const totalDays = countCalendarDays(start, endDate);
  let count = 0;
  for (let index = 0; index < totalDays; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    if (allowed.includes(date.getDay())) count += 1;
  }
  return count;
}

export function calculateRequiredDaily(remainingAmount, validDaysRemaining) {
  const days = Math.max(1, Number(validDaysRemaining || 0));
  return toMoneyNumber(remainingAmount) / days;
}

export function calculateRequiredWeekly(remainingAmount, daysRemaining) {
  const weeks = Math.max(1, Number(daysRemaining || 0) / 7);
  return toMoneyNumber(remainingAmount) / weeks;
}

export function calculateRequiredMonthly(remainingAmount, daysRemaining) {
  const months = Math.max(1, Number(daysRemaining || 0) / 30.4375);
  return toMoneyNumber(remainingAmount) / months;
}

function calculateExpectedProgress(startDate, targetDate, referenceDate) {
  const start = parseCalendarDate(startDate, referenceDate);
  const end = parseCalendarDate(targetDate, start);
  const reference = parseCalendarDate(referenceDate, new Date());
  const totalDays = Math.max(1, countCalendarDays(start, end));
  const elapsedDays = Math.min(totalDays, Math.max(0, countCalendarDays(start, reference)));
  return Math.min(100, (elapsedDays / totalDays) * 100);
}

function buildNextDailyPlan(referenceDate, targetDate, amountPerDay, allowedWeekdays = DEFAULT_WEEKDAYS, limit = 4) {
  const allowed = Array.isArray(allowedWeekdays) && allowedWeekdays.length > 0
    ? allowedWeekdays.map(Number)
    : DEFAULT_WEEKDAYS;
  const start = parseCalendarDate(referenceDate, new Date());
  const end = parseCalendarDate(targetDate, start);
  const days = [];
  let cursor = new Date(start);
  while (cursor.getTime() <= end.getTime() && days.length < limit) {
    if (allowed.includes(cursor.getDay())) {
      days.push({
        date: new Date(cursor),
        amount: amountPerDay,
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function calculateGoalProgress({
  targetValue,
  accumulatedValue,
  startDate,
  targetDate,
  allowedWeekdays,
  referenceDate = new Date(),
} = {}) {
  const target = toMoneyNumber(targetValue);
  const accumulated = toMoneyNumber(accumulatedValue);
  const remaining = calculateRemainingAmount(target, accumulated);
  const progressPercent = target > 0 ? Math.min(100, (accumulated / target) * 100) : 0;
  const daysRemaining = countCalendarDays(referenceDate, targetDate);
  const validDaysRemaining = countValidDays(referenceDate, targetDate, allowedWeekdays);
  const requiredDaily = calculateRequiredDaily(remaining, validDaysRemaining);
  const requiredWeekly = calculateRequiredWeekly(remaining, daysRemaining);
  const requiredMonthly = calculateRequiredMonthly(remaining, daysRemaining);
  const expectedProgressPercent = calculateExpectedProgress(startDate || referenceDate, targetDate || referenceDate, referenceDate);
  const gap = expectedProgressPercent - progressPercent;
  const statusColor = progressPercent >= expectedProgressPercent ? 'green' : gap <= 15 ? 'yellow' : 'red';
  const statusLabel = statusColor === 'green' ? 'No ritmo' : statusColor === 'yellow' ? 'Atenção' : 'Atrasada';

  return {
    targetValue: target,
    accumulatedValue: accumulated,
    remainingAmount: remaining,
    progressPercent,
    expectedProgressPercent,
    daysRemaining,
    validDaysRemaining,
    requiredDaily,
    requiredWeekly,
    requiredMonthly,
    statusColor,
    statusLabel,
    nextDailyPlan: buildNextDailyPlan(referenceDate, targetDate || referenceDate, requiredDaily, allowedWeekdays),
  };
}

export function calculateEquipmentReadiness({ price, reserved } = {}) {
  const targetValue = toMoneyNumber(price);
  const reservedValue = toMoneyNumber(reserved);
  const remainingAmount = calculateRemainingAmount(targetValue, reservedValue);
  const progressPercent = targetValue > 0 ? Math.min(100, (reservedValue / targetValue) * 100) : 0;
  const isReady = targetValue > 0 && reservedValue >= targetValue;
  let status = 'Planejando';
  if (isReady) status = 'Liberado para compra';
  else if (progressPercent >= 75) status = 'Quase liberado';
  else if (reservedValue > 0) status = 'Juntando';
  return {
    targetValue,
    reservedValue,
    remainingAmount,
    progressPercent,
    isReady,
    status,
  };
}

function priorityWeight(goal) {
  const priority = String(goal?.priority || '').toLowerCase();
  if (priority === 'high' || priority === 'alta') return 0;
  if (priority === 'medium' || priority === 'media') return 1;
  return 2;
}

function buildAllocation(goal, amount, reason) {
  return {
    goalId: goal.id,
    title: goal.title,
    category: goal.category,
    amount,
    reason,
  };
}

export function calculateWeeklyAllocation({
  availableAmount,
  primaryGoal,
  financialGoals = [],
  equipmentGoals = [],
} = {}) {
  let remaining = toMoneyNumber(availableAmount);
  const allocations = [];
  const warnings = [];

  if (primaryGoal && remaining > 0) {
    const need = Math.min(
      remaining,
      toMoneyNumber(primaryGoal.requiredWeekly || primaryGoal.remainingAmount),
      toMoneyNumber(primaryGoal.remainingAmount),
    );
    if (need > 0) {
      allocations.push(buildAllocation(primaryGoal, need, 'Prioridade da meta principal'));
      remaining -= need;
    }
    if (toMoneyNumber(primaryGoal.requiredWeekly) > need) {
      warnings.push('O valor disponível não cobre totalmente o ritmo da meta principal.');
    }
  }

  const secondaryFinancial = financialGoals
    .filter((goal) => !goal.isPrimary && toMoneyNumber(goal.remainingAmount) > 0)
    .sort((a, b) => priorityWeight(a) - priorityWeight(b));

  for (const goal of secondaryFinancial) {
    if (remaining <= 0) break;
    const amount = Math.min(
      remaining,
      toMoneyNumber(goal.requiredWeekly || goal.remainingAmount),
      toMoneyNumber(goal.remainingAmount),
    );
    if (amount > 0) {
      allocations.push(buildAllocation(goal, amount, 'Meta financeira ativa'));
      remaining -= amount;
    }
  }

  const orderedEquipment = equipmentGoals
    .filter((goal) => toMoneyNumber(goal.remainingAmount) > 0)
    .sort((a, b) => priorityWeight(a) - priorityWeight(b));

  for (const goal of orderedEquipment) {
    if (remaining <= 0) break;
    const amount = Math.min(remaining, toMoneyNumber(goal.remainingAmount));
    if (amount > 0) {
      allocations.push(buildAllocation(goal, amount, 'Equipamento sem comprometer a meta principal'));
      remaining -= amount;
    }
  }

  return {
    availableAmount: toMoneyNumber(availableAmount),
    allocations,
    unallocatedAmount: Math.max(0, remaining),
    warnings,
  };
}

export function calculateStudyProgress({
  startDate,
  targetDate,
  minutesPerSession,
  allowedWeekdays,
  completedSessions = 0,
  completedMinutes = 0,
  pace = 'normal',
} = {}) {
  const availableDays = countValidDays(startDate || new Date(), targetDate || new Date(), allowedWeekdays);
  const paceMultiplier = pace === 'leve' ? 0.7 : pace === 'intenso' ? 1.25 : 1;
  const plannedSessions = Math.max(1, Math.round(availableDays * paceMultiplier));
  const plannedMinutes = plannedSessions * Math.max(0, Number(minutesPerSession || 0));
  const progressPercent = plannedSessions > 0 ? Math.min(100, (Number(completedSessions || 0) / plannedSessions) * 100) : 0;
  const weeklyMinutes = Math.round((Array.isArray(allowedWeekdays) && allowedWeekdays.length ? allowedWeekdays.length : 7) * Math.max(0, Number(minutesPerSession || 0)) * paceMultiplier);

  return {
    plannedSessions,
    completedSessions: Number(completedSessions || 0),
    plannedMinutes,
    completedMinutes: Number(completedMinutes || 0),
    weeklyMinutes,
    progressPercent,
  };
}
