# Balancing 60 stages

> Do not tune numbers by feel. The process below has been used and gives repeatable results.

## 1. Goals

| Phase | Desired win rate |
| --- | --- |
| Early game | High — the player must see themselves getting stronger |
| Stages **23–47** | **~50–70%** — the main tension zone |
| Late game (already 4★/5★) | Gradually easier — a reward for building correctly |

❌ Avoid both extremes: **0%** (stuck, players quit) and **a uniform 100%** (boring, no reason left to
optimise the Trang bị).

⚠️ **Enemy stars are the sharpest knob in the game.** A whole loadout going up one star rank is worth
far more than several stages of `maxHp` / `attackDamage` growth, and it snaps from "always winnable" to
"never winnable" instead of sliding. Measured at stages 49-60 with a maxed player (every item 5★, full
grid, 16-24 seeds) — that player was at **pet level 5**, which was the cap when the numbers were
recorded (the cap is **10** now, so the late stages are a little easier than the table below):

| Enemy loadout | Player win rate |
| --- | --- |
| Everything at **4★** | **81-100%** (stage 60 boss 13%) |
| Weapons 4★, everything else 5★ | **0%** |
| One single item at 5★ | 0-100%, depending on which item |
| Everything at **5★** | **0%** |

⇒ The enemy ladder therefore still stops at **4★** (`enemyStar` in `game/stages.ts`): **5★ is the
player's reward** for merging two 4★ copies, not a tier the enemy may reach. Put a 5★ enemy in and the
last map becomes impossible for *every* build, so "add a 5th enemy tier" is not a one-line change — it
needs the whole late-game curve retuned and re-measured.

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
enemy stars   1★ when index < 16 · 2★ < 31 · 3★ < 46 · 4★ from 46   (player-only 5★, see §1)
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
