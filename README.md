# Benchmark: Nx Cloud Platform vs Nx Using Remote Cache Only

Recent changes to the Nx Cloud platform significantly increase the cache hit rate and
reduce compute, while also making CI much faster. This benchmark demonstrates the impact
and explains where the savings come from.

Across a realistic mix of pull requests, the platform verifies changes **10.5x faster** and
uses **2.7x less compute** than the same workspace running on remote cache alone.

## The workspace

The repository is a synthetic but realistically shaped monorepo.

|                                   | Count |
| --------------------------------- | ----- |
| Projects                          | 511   |
| Feature libraries                 | 302   |
| UI libraries                      | 130   |
| Utility libraries                 | 70    |
| Applications and support projects | 9     |

## The tasks

A full CI run executes 1,634 tasks.

| Target        | Tasks | Notes                                                    |
| ------------- | ----- | -------------------------------------------------------- |
| typecheck     | 510   | one per library                                          |
| lint          | 510   | one per library                                          |
| test          | 507   | Vitest, one per library                                  |
| e2e-ci slices | 100   | one Playwright spec per task                             |
| build         | 3     | only the two applications and the products package build |
| validate      | 1     | simulates a CI check that is not project specific        |

Some tasks have to run in a particular order:

- Applications must be built before e2e tests can run, because the tests exercise the
  built artifacts through a preview server.
- Typechecks run in dependency order so they do not consume extra CPU and RAM.
- E2E tests have to run one at a time, simulating a shared resource they all need.

Note that real repositories often have many more dependencies between tasks, for example
many buildable libraries. Nx Cloud does even better in those cases, because it freely moves
tasks between agents to get optimal performance.

### Simulated load

Unit tests model a realistic Vitest profile rather than pure sleep. Each of the 1,111 spec
files costs a fixed-work CPU burn (`UNIT_TEST_CPU_SECONDS`, default 5s on one GitHub
Actions vCPU) plus idle wait (`UNIT_TEST_SLEEP_MS`, default 7300ms), about 12.3s per file.
Spec files run one at a time, so Nx owns all concurrency and each burn genuinely gets one
core.

Each e2e test is padded to `E2E_TEST_DURATION_MS` (default 25000ms) and then burns
`E2E_TEST_CPU_SECONDS` (default 2s) of real compute, about 27s per test, of which roughly
7% scales with hardware. That matches real Playwright runs being mostly wait-bound.

In both cases the compute and the wait are interleaved across ten rounds of
compute-then-sleep rather than one long burn followed by one long sleep. The totals are
unchanged; the shape just matches a real test run more closely.

The CPU half runs a fixed number of iterations (`tools/test-delay/burn.mjs`) rather than
spinning for a fixed duration, so faster runners finish it sooner. A `setTimeout` would
take the same wall time on any machine and would hide exactly the hardware differences this
benchmark exists to measure.

The burn is a serial dependent integer chain that allocates nothing, so it tracks clock
speed and multiply latency rather than allocator, memory bandwidth and GC performance.
Those have changed little across CPU generations, which keeps old and new runners closer
together and makes results less noisy. `UNITS_PER_SECOND` is calibrated for one GitHub
Actions vCPU; run `node tools/test-delay/calibrate.mjs` on a runner to re-measure it.

## The three scenarios

Every measurement below covers the same three types of change:

- **Full rebuild** — a global change, so every task in the graph reruns.
- **Large change** — a shared UI library changes, invalidating a large slice of the graph.
- **Feature change** — a single feature library changes (a typical pull request).

Two numbers are reported for each. **Verification time** is the wall-clock time a
developer waits. **Compute** is the total machine time consumed across every VM or agent,
which is what the run actually costs.

## Baseline: remote cache only

[nrwl/cache-dte-bench](https://github.com/nrwl/cache-dte-bench) is the same repository
using only remote caching, without Nx agents, Nx Ultracache or distributed task execution. This baseline
has the same performance characteristics as a DIY caching solution, and it uses
one VM per task type: build, typecheck, lint, test, e2e and validate.

| Scenario       | Verification time | Compute   |
| -------------- | ----------------- | --------- |
| Full rebuild   | 1h 7m 11s         | 2h 6m 15s |
| Large change   | 42m 21s           | 1h 12m 9s |
| Feature change | 42m 21s           | 46m 43s   |

## Nx Cloud

| Scenario       | Verification time | Compute    | vs baseline                    |
| -------------- | ----------------- | ---------- | ------------------------------ |
| Full rebuild   | 11m 45s           | 1h 12m 17s | 5.7x faster, 43% less compute  |
| Large change   | 6m 27s            | 35m 2s     | 6.6x faster, 51% less compute  |
| Feature change | 3m 20s            | 14m 36s    | 12.7x faster, 69% less compute |

A typical feature pull request is verified in a little over three minutes.

## Total compute

The overall saving depends on how often each kind of change occurs, and that ratio differs
between repositories. This comparison assumes 80% of CI executions are feature changes,
17% are large changes, and 3% are full rebuilds.

| Weighted average  | Baseline | Nx Cloud |
| ----------------- | -------- | -------- |
| Verification time | 43m 6s   | 4m 7s    |
| Compute           | 53m 26s  | 19m 48s  |

That is **10.5x faster** verification using **2.7x less compute** (a 63% reduction).

It is certainly possible to make the DIY solution faster, but doing so costs more compute.

## How did we achieve this?

Two core mechanisms produce these savings:

- Ultracache
- Task distribution with dynamic packing

**Ultracache.** Nx Cloud instruments CI executions to learn what each task reads and
writes, down to every single file. That is far more precise than a conservative declaration
of everything a task might read. Combined with splitting tests into individual targets, it
makes each test independently cacheable, which drastically lowers p75. Another benefit is
that the cache configuration is always correct. Ultracache is a more advanced version of the
cache and requires Nx Cloud's task distribution.

**Task distribution with dynamic packing.** Nx Cloud learns how long each task takes and
what its CPU and RAM profile is. It understands critical paths and schedules work to
minimize wall-clock time. For instance, it can start the e2e tests that have to run one at a
time, then pack the rest of the VM with other tasks.

The core intuition is that you pay for VM minutes, not for how hard the VM works. As a
result, most CI executions either have low average CPU and RAM usage, often 20% of
capacity, or they run into out-of-memory errors and CPU throttling. That is what happens
when you set the parallelism flag by hand. You experiment with it until performance is
decent and CI is reasonably stable, and then the flag has to be retuned as the workspace
changes. With Nx Cloud you set nothing. It knows what tasks run in what order, which tasks
can coexist on the same agent, and how much each one consumes, so it assigns work
dynamically to keep VMs near capacity, which means fewer VM minutes.

A good analogy is moving house and packing your things into trucks. Traditional CI lets you
set how many items go into each truck, which is the parallelism flag. Some items are huge,
like sofas, and some are small, like plates, but it makes no difference: every truck gets the
same five items. You might get lucky and fill a truck, or it might leave half empty. Nx Cloud
loads each truck dynamically until it is full.

You can see the task allocation across all agents during a full rebuild:

![Task allocation across six agents during a full rebuild. Each row is an agent and each
block is a task, packed end to end with almost no idle time.](docs/images/full-rebuild-agent-timeline.png)

You can see the number of concurrent tasks changes based on capacity, and in the very end it's reduced to six,
because we have leftover e2e tests we need to finish, and we have nothing to pack.

## What if my workspace is messy?

Both mechanisms, and the rest of Nx Cloud, help more in messy real world workspaces than in
a clean benchmark. In a real workspace your tasks have messy dependencies, so your manual
cache configuration tends to be a lot more conservative, while Ultracache always picks up
exactly what you need.

A real workspace also has many more dependencies between tasks, and those tasks have very
different CPU and RAM profiles. No matter how messy they are, Nx Cloud partitions them into
smaller units, runs them in the right order, and packs VMs to their limits. Because this
benchmark is artificial and uniform, that messiness is not there, so the baseline performs
better here than it would in practice.
