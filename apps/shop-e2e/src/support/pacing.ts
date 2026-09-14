/**
 * Per-test pacing applied by the generated e2e specs.
 *
 * Each generated spec records when its test started and calls padTo() at the
 * end. padTo() spends two budgets:
 *
 *   1. Idle wait, until E2E_TEST_DURATION_MS (default 25000ms) has elapsed
 *      since the test began. This is a fixed DURATION, so it takes the same
 *      wall-clock time on every machine, and any real browser work the test
 *      already did is absorbed into it.
 *   2. E2E_TEST_CPU_SECONDS (default 2s) of real compute. This is a fixed
 *      amount of WORK, so faster hardware finishes it sooner.
 *
 * The two budgets are interleaved across E2E_TEST_BLOCKS (default 10) rounds of
 * compute-then-sleep, the same shape the unit test setup uses. The totals are
 * unchanged: a test takes 25s plus the burn, about 27s on a GHA vCPU and less on
 * faster silicon. The CPU portion stays
 * additive because the sleep budget is computed once, before any burning, so a
 * fast machine cannot absorb its own saving.
 *
 * Roughly 7% of each test is CPU, in line with real Playwright runs being
 * mostly wait-bound. Set E2E_TEST_DURATION_MS=0 and E2E_TEST_CPU_SECONDS=0 to
 * run at full speed locally.
 */
export const DEFAULT_E2E_TEST_DURATION_MS = 25_000;
export const DEFAULT_E2E_TEST_CPU_SECONDS = 2;
export const DEFAULT_E2E_TEST_BLOCKS = 10;

/**
 * Units that take roughly 1 second on a single GitHub Actions vCPU. Keep this
 * in sync with UNITS_PER_SECOND in tools/test-delay/burn.mjs; run
 * `node tools/test-delay/calibrate.mjs` on a runner to measure it.
 */
export const UNITS_PER_SECOND = 150_000_000;

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function e2eTestDurationMs(): number {
  return envNumber('E2E_TEST_DURATION_MS', DEFAULT_E2E_TEST_DURATION_MS);
}

export function e2eTestCpuSeconds(): number {
  return envNumber('E2E_TEST_CPU_SECONDS', DEFAULT_E2E_TEST_CPU_SECONDS);
}

/**
 * Fixed-work CPU burn. Mirrors burnCpu() in tools/test-delay/burn.mjs; it is
 * duplicated rather than imported so the e2e project stays self-contained and
 * typechecks without reaching outside its own rootDir.
 *
 * A serial dependent integer chain with no allocation: each iteration consumes
 * the previous one's output, so throughput tracks clock speed and multiply
 * latency rather than allocator, memory bandwidth and GC performance. That
 * keeps old and new hardware much closer together.
 */
export function burnCpu(units: number): number {
  let a = 1;
  let b = 0x9e3779b9;
  for (let i = 0; i < units; i++) {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a ^ (a >>> 15);
    t = Math.imul(t, 1 | a) >>> 0;
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) >>> 0;
    b = (b ^ (t ^ (t >>> 14))) >>> 0;
  }
  return b;
}

function sleep(ms: number): Promise<void> {
  return ms > 0
    ? new Promise((resolve) => setTimeout(resolve, ms))
    : Promise.resolve();
}

/**
 * Spend the remaining idle budget and the CPU budget in alternating blocks.
 */
export async function padTo(startedAt: number): Promise<void> {
  const blocks = Math.max(
    1,
    Math.round(envNumber('E2E_TEST_BLOCKS', DEFAULT_E2E_TEST_BLOCKS)),
  );

  const remaining = startedAt + e2eTestDurationMs() - Date.now();
  const sleepPerBlock = remaining > 0 ? remaining / blocks : 0;

  const totalUnits = Math.round(
    e2eTestCpuSeconds() * envNumber('E2E_UNITS_PER_SECOND', UNITS_PER_SECOND),
  );
  const unitsPerBlock = Math.round(totalUnits / blocks);

  for (let i = 0; i < blocks; i++) {
    if (unitsPerBlock > 0) {
      burnCpu(unitsPerBlock);
    }
    await sleep(sleepPerBlock);
  }
}
