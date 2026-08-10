import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const enginePath = path.resolve(__dirname, '../src/lib/goals-engine.js');
const source = fs.readFileSync(enginePath, 'utf8');
const module = new vm.SourceTextModule(source, {
  context: vm.createContext({ console }),
  identifier: enginePath,
});

await module.link(() => {
  throw new Error('goals-engine.js deve continuar puro e sem imports.');
});
await module.evaluate();

const {
  calculateEquipmentReadiness,
  calculateGoalProgress,
  calculateWeeklyAllocation,
} = module.namespace;

const progress = calculateGoalProgress({
  targetValue: 10000,
  accumulatedValue: 1000,
  startDate: '2026-08-10',
  targetDate: '2026-12-20',
  referenceDate: '2026-08-10',
});
assert.equal(progress.remainingAmount, 9000);
assert.equal(progress.progressPercent, 10);

const equipmentNotReady = calculateEquipmentReadiness({ price: 1800, reserved: 1799 });
assert.equal(equipmentNotReady.isReady, false);

const equipmentReady = calculateEquipmentReadiness({ price: 1800, reserved: 1800 });
assert.equal(equipmentReady.isReady, true);

const allocation = calculateWeeklyAllocation({
  availableAmount: 500,
  primaryGoal: {
    id: 'primary',
    title: 'Reserva Dezembro',
    category: 'financial',
    isPrimary: true,
    requiredWeekly: 400,
    remainingAmount: 9000,
  },
  equipmentGoals: [
    {
      id: 'monitor',
      title: 'Monitor',
      category: 'equipment',
      remainingAmount: 1000,
      priority: 'medium',
    },
  ],
});

assert.equal(allocation.allocations[0].amount, 400);
assert.equal(allocation.allocations[1].amount, 100);
assert.equal(
  allocation.allocations.reduce((sum, item) => sum + item.amount, 0) <= 500,
  true,
);

const personalAllocation = calculateWeeklyAllocation({
  availableAmount: 0,
  primaryGoal: {
    id: 'personal',
    title: 'Viagem',
    category: 'financial',
    scope: 'personal',
    requiredWeekly: 300,
    remainingAmount: 10000,
  },
});
assert.equal(personalAllocation.allocations.length, 0);
assert.equal(personalAllocation.availableAmount, 0);

console.log('goals-engine: todos os testes passaram');
