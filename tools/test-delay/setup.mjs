/**
 * Vitest setup file that models a realistic unit-test load for the benchmark.
 *
 * Vitest evaluates setup files once per test file, so each spec file costs:
 *   - UNIT_TEST_CPU_SECONDS (default 5s) of real, fixed-work CPU compute
 *   - UNIT_TEST_SLEEP_MS    (default 7.3s) of idle wait
 *
 * That is 12.3s per spec file across 1,111 spec files.
 *
 * The two are interleaved across UNIT_TEST_BLOCKS (default 10) rounds of
 * compute-then-sleep rather than one long burn followed by one long sleep. The
 * totals are identical; the shape is simply closer to a real Vitest run, which
 * alternates between CPU work (transpilation, module loading, jsdom setup) and
 * waiting on I/O.
 *
 * The CPU half is a fixed number of iterations, so faster hardware finishes it
 * sooner; the sleep half is hardware-independent by design.
 *
 * Set UNIT_TEST_CPU_SECONDS=0 and UNIT_TEST_SLEEP_MS=0 to run at full speed.
 */
import { burnCpu, envNumber, sleep, UNITS_PER_SECOND } from './burn.mjs';

const cpuSeconds = envNumber('UNIT_TEST_CPU_SECONDS', 5);
const sleepMs = envNumber('UNIT_TEST_SLEEP_MS', 7_300);
const unitsPerSecond = envNumber(
  'UNIT_TEST_UNITS_PER_SECOND',
  UNITS_PER_SECOND,
);
const blocks = Math.max(1, Math.round(envNumber('UNIT_TEST_BLOCKS', 10)));

const totalUnits = Math.round(cpuSeconds * unitsPerSecond);
const unitsPerBlock = Math.round(totalUnits / blocks);
const sleepPerBlock = sleepMs / blocks;

const startedAt = Date.now();

for (let i = 0; i < blocks; i++) {
  if (unitsPerBlock > 0) {
    burnCpu(unitsPerBlock);
  }
  await sleep(sleepPerBlock);
}

if (process.env['UNIT_TEST_CPU_REPORT']) {
  console.log(
    `[test-delay] ${blocks} blocks of ${unitsPerBlock.toLocaleString()} units ` +
      `+ ${sleepPerBlock.toFixed(0)}ms sleep took ${(
        (Date.now() - startedAt) /
        1000
      ).toFixed(2)}s`,
  );
}
