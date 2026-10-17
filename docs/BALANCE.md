# Balancing 60 stages

> Do not tune numbers by feel. The process below has been used and gives repeatable results.

## 1. Goals

| Phase | Desired win rate |
| --- | --- |
| Early game | High — the player must see themselves getting stronger |
| Stages **23–47** | **~50–70%** — the main tension zone |
| Late game (already 4★) | Gradually easier — a reward for building correctly |

❌ Avoid both extremes: **0%** (stuck, players quit) and **a uniform 100%** (boring, no reason left to
optimise the Trang bị).

## 2. Process

1. Create a **temporary probe file** `frontend/src/game/__tests__/_balance.probe.test.ts` that simulates
   the win rate across **all 60 stages** with a "typical player" build: pet level + item count + star
   tier **rising with the stage**, run over many seeds.
2. Run it and read the table:

   ```bash
   pnpm test --reporter=verbose src/game/__tests__/_balance.probe.test.ts
   ```

3. Adjust `game/stages.ts` (`maxHp`, `attackDamage`, `enemyStar`, `enemyItems`) and run again.
4. Repeat until it matches the goals in §1.
5. ⚠️ **DELETE the probe file as soon as you are done** (`AGENTS.md` §6). Files named
   `_*.probe.test.ts` are in the repo's warning list.

## 3. Parameters currently in use

```
maxHp        ≈ 400 + (index - 1) × 54      boss ×1.35
attackDamage ≈   8 + (index - 1) × 0.95    boss ×1.12
enemy stars   1★ when index < 16 · 2★ < 31 · 3★ < 46 · 4★ from 46
enemyItems    ⌊(index + 3) / 7⌋            max 6
```

Rival blueprint details live in `game/stages.ts` (`getStage`, `makeRivalBlueprint`).

## 4. Measuring simulation performance (when you need to know whether it is a bottleneck)

Reference numbers from the dev machine, sweeping 60 stages × 120 seeds ("typical player" build):

| Metric | Value |
| --- | --- |
| `simulateBattle` average | **0.138 ms/battle** (~7,200 battles/second) |
| Building a combatant | 0.001 ms/pair |
| Events per battle | average 47 · highest 93 |
| Playback duration | 93 events × 60 ms ≈ 5.6 s |

⇒ **The simulation is not the bottleneck.** One battle costs under 1% of a 60 FPS frame budget, and it
only runs once per click. Render measurements in the browser (playback ×8): p50 **3.6 ms**, p99 3.7 ms,
**0 long tasks**.

⚠️ Consequence: **do not** rewrite `simulateBattle` in WASM/Rust or "optimise" it. Changing languages
saves less than the measurement error, yet it breaks the determinism contract and makes the build far
more complicated. If you do need to optimise, the place worth looking at is the **number of React
re-renders** during playback.

How to measure again: a temporary probe `_bench.probe.test.ts` using `performance.now()` around the
`simulateBattle` loop, then delete it as soon as you are done.
