/**
 * Fixed-work CPU burn used to simulate real compute in the benchmark.
 *
 * The important property is that this does a fixed amount of WORK, not work
 * for a fixed DURATION. A `setTimeout`, or a loop that spins until a deadline,
 * takes the same wall-clock time on every machine and therefore hides all
 * hardware differences. A fixed iteration count finishes sooner on faster
 * hardware, which is exactly the signal a runner benchmark needs.
 *
 * The loop is a serial dependent integer chain: every iteration consumes the
 * previous iteration's output, and nothing is allocated. That keeps it bound by
 * clock speed and multiply latency, both of which have moved very little across
 * CPU generations, so old and new hardware land much closer together than they
 * would on an allocation-heavy loop. An earlier version built strings and
 * churned objects, which leaned on the allocator, memory bandwidth and the GC,
 * the three things that improved most between generations, and it also made
 * results noisier because of GC timing.
 */

/**
 * Units that take roughly 1 second on a single GitHub Actions vCPU.
 *
 * This is an ESTIMATE for the dependent-chain loop below: an Apple M5 Pro
 * measures ~295M units/sec, and a GHA vCPU is roughly 2x slower on a
 * latency-bound integer chain. Run `node tools/test-delay/calibrate.mjs` ON A
 * RUNNER to get the real figure and replace this constant, or override it
 * per-run with UNIT_TEST_UNITS_PER_SECOND.
 */
export const UNITS_PER_SECOND = 150_000_000;

/**
 * Burn `units` of CPU. Returns the accumulator so the work cannot be
 * optimized away.
 */
export function burnCpu(units) {
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

/** Resolve a non-negative number from an env var, falling back to `fallback`. */
export function envNumber(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function sleep(ms) {
  return ms > 0
    ? new Promise((resolve) => setTimeout(resolve, ms))
    : Promise.resolve();
}
