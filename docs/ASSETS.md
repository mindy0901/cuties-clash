# Art & attribution

All art in the game is **external assets with a free licence**. This document records the sources,
the licences, where files go, and the attribution obligations.

⚠️ **Never** use assets from NetEase / NARAKA: BLADEPOINT (see `AGENTS.md` §1).

---

## Rules for adding art

- ✅ **Only declare a path when you are sure the file exists** (`stars` in `items.ts`,
  `art`/`skillArt` in `pets.ts`). ❌ Do not guess file names.
- ✅ **Always keep the emoji fallback** in `icon`; `ArtIcon` falls back to the emoji when an image
  fails — that way art can be added gradually and there is never an empty cell.
- ⚠️ **Check for a real alpha channel** before using an image (see the ORHstudio trap below): read the
  PNG bytes, `colorType` must be **6 = RGBA**. `game/__tests__/artAlpha.test.ts` guards this.
- ⚠️ **CC BY** sources must have an **attribution** section reachable from the menu. CC0 does not
  require it, but the source is still recorded in this file.
- ⚠️ State clearly when art is **AI generated** (the ORHstudio pack declares "AI Assisted").
- ⚠️ When you add a **new static folder** under `frontend/`, check that the `fr` image `COPY`s it —
  without that the images 404 and nginx returns `index.html` (HTTP is still 200, which is very hard to
  notice).

### Pet avatar art (fighter frame)

The avatar frame on the arena floor (`components/AvatarCard.tsx`) picks an image in this order:

1. **A dedicated avatar image** — `public/icons/pets/<petId>-avatar.png`, enabled with
   `avatar: true` in `game/pets.ts` (for another extension add `avatarExt`). Lookup function:
   `avatarArtSrc`.
2. **Pet art** — `public/icons/pets/<petId>.png` (`art: true`), already present.
3. **Emoji fallback** — `icon` in `pets.ts`.

⇒ Adding avatar images **does not require touching the component**: put the file under the right name
and switch the flag on. The frame already draws a dashed border around the image area, so with no
image yet it still looks like "space reserved for an image" rather than a bug.

## In use

### ORHstudio — Wuxia Icon Series (CC0)

Source: <https://itch.io/c/7530014/wuxia-icon-series> · author **ORHstudio**

**Licence: CC0 1.0 (public domain)** — free to use, **attribution not required**. It is still recorded
here so the provenance is known.

| Pack | Contents | Used for |
| ---- | -------- | -------- |
| [Wuxia Weapons](https://orhstudio.itch.io/wuxia-weapon-icons-complete) | 216 icons = 18 weapons × 12 material tiers | 8 items: weapons + Nanh Lò Rèn + Thần Đúc Sư |
| [Wuxia Chest Armor](https://orhstudio.itch.io/wuxia-chest-armor-icons) | 96 icons | 3 armour pieces |
| [Wuxia Shields](https://orhstudio.itch.io/wuxia-shields-icons) | 108 icons | Chuông Bão, Cờ Lụa |
| [Wuxia Rings](https://orhstudio.itch.io/wuxia-rings-icons) · [Earrings](https://orhstudio.itch.io/wuxia-earrings-icons) · [Bracelets](https://orhstudio.itch.io/wuxia-bracelets-icons) · [Amulets](https://orhstudio.itch.io/wuxia-amulets-icons) · [Tokens](https://orhstudio.itch.io/wuxia-tokens-icons) | 96 icons per set | 6 Hồn Ngọc + Trống Trận + Phù/Gương |
| [Wuxia Medicines](https://orhstudio.itch.io/wuxia-medicines-icons) | 96 icons | 4 Đan Dược |
| [Wuxia Masks](https://orhstudio.itch.io/wuxia-masks-icons) | 96 icons | Đèn Quỷ + 3 pet faces |
| [Wuxia Gloves](https://orhstudio.itch.io/wuxia-gloves-icons) | 96 icons | Song Trảo |

Sizes: **64×64, 128×128, 32×32** PNG with a transparent background + sprite sheets. The game uses the
**128×128** version (crisp when scaled up / on retina screens).

⚠️ **AI Disclosure:** the pack page says *"AI Assisted / Graphics"* — the images are AI generated, and
the author reviewed them. CC0 is still valid, but it is worth knowing before a commercial release.

### ⚠️ Trap: the pack says "transparent background" but 31 files are NOT transparent

The pack page states clearly *"Transparent background (PNG alpha)"*, but in reality **31 item files are
SOLID BLACK images** — alpha = 255 everywhere, with the black background covering 59–88% of the area.
Put straight into the game, items show up as **black blocks**, and long items (a 4×1 spear) become a
distorted black block.

How to detect it (not visible by eye in a preview image, you have to read the pixels):

```powershell
Add-Type -AssemblyName System.Drawing
$b = [System.Drawing.Bitmap]::FromFile('public\icons\items\wooden-blade-1.png')
$opaque = 0
for ($y=0; $y -lt $b.Height; $y++) { for ($x=0; $x -lt $b.Width; $x++) {
  if ($b.GetPixel($x,$y).A -gt 240) { $opaque++ } } }
"$([Math]::Round(100*$opaque/($b.Width*$b.Height)))% opaque"   # a black background gives ~100%
```

**The fix that was used:** flood fill from the border over near-black pixels only → this keeps the
black colour that lies *inside* the drawing (sword outlines, pet eyes). Then downscale to 64×64 (a
factor >3, still crisp because grid cells are only ~60–90px). Result: 12–15% opaque instead of 100%,
with the 4 corners transparent.

The fixed images live in `public/icons/` and **are committed** — there is no need to run this step
again. `frontend/src/game/__tests__/artAlpha.test.ts` guards it: every image must be a **RGBA PNG
(colour type 6)**.

---

## Mapping in use

Each item takes **one icon type** from the pack, and each star level takes a **different material
tier** — so a 4★ item looks completely different from a 1★ one at a glance.

⚠️ Art ships for star ranks **1–4** only. A **5★** item is legitimate in game (two 4★ copies merge
into it, see `docs/GAME-RULES.md` §4) but `stars` in `items.ts` stops at 4, so it draws the
template's **emoji**. Adding 5★ art later means adding the files **and** declaring `5` in `stars`.

**Material tier per star:**

| Star | Material tier |
| --- | ------------ |
| ★ | `natural_wood` |
| ★★ | `green_jade` |
| ★★★ | `ebony_steel` |
| ★★★★ | `divine_gold_inlaid_wood` |
| ★★★★★ | — (falls back to the emoji) |

Exceptions (mixed materials): `poison-dagger` starts at `rusty_stone`; `twin-claws` uses
`worn_leather` → `forged_iron` → `shining_silver`.

**Icon type for each item:**

| Item | Pack | Type |
| --- | ---- | ---- |
| `wooden-blade` | weapons | `jian_sword` |
| `fire-spear` | weapons | `spear` |
| `frost-fan` | weapons | `iron_fan` |
| `poison-dagger` | weapons | `dagger` |
| `great-axe` | weapons | `battle_axe` |
| `forge-fang` | weapons | `hook_blade` |
| `divine-forger` | weapons | `war_hammer` |
| `twin-claws` | gloves | `tiger_claw_glove` |
| `hide-vest` | chest-armor | `cloth_armor` |
| `chain-mail` | chest-armor | `chainmail` |
| `warden-plate` | chest-armor | `general_chestplate` |
| `jade-fury` | amulets | `dragon_jade` |
| `jade-vampire` | amulets | `phoenix_jade` |
| `jade-guard` | amulets | `qilin_jade` |
| `jade-haste` | rings | `yinyang_ring` |
| `jade-crit` | earrings | `tiger_fang_earring` |
| `jade-sword` | tokens | `sword_token` |
| `war-drum` | bracelets | `bell_bracelet` |
| `ghost-lantern` | masks | `fox_mask` |
| `storm-bell` | shields | `sun_shield` |
| `silk-banner` | shields | `rectangular_shield` |
| `frost-seal` | tokens | `cloud_token` |
| `mirror-shard` | tokens | `hexagon_token` |
| `venom-vial` | medicines | `black_medicine` |
| `heal-dew` | medicines | `white_medicine` |
| `tiger-tonic` | medicines | `orange_medicine` |
| `iron-brew` | medicines | `gold_medicine` |

**Pets** (masks, tier ★★★): `fire-pup`→`tiger_mask` · `white-rabbit`→`fox_mask` ·
`spirit-cat`→`skull_mask`

**Skills** (weapons, tier ★★★): `fire-pup`→`monk_spade` · `white-rabbit`→`ji_halberd` ·
`spirit-cat`→`whip`

To change the mapping, edit the icon-selection table and re-run the copy script — **not** by hand,
file by file.

---

## Fallback options

### game-icons.net (CC BY 3.0)

Source: <https://game-icons.net/> · a library of ~5000 single-colour SVGs, tintable to the game's
colours.

**Licence: CC BY 3.0 — attribution is MANDATORY.** Source: [about](https://game-icons.net/about.html),
[license.txt](https://raw.githubusercontent.com/game-icons/icons/master/license.txt).

How to attribute: `Icons made by {author}. Available on https://game-icons.net`

The game must have an **attribution** section reachable from the menu (the
[FAQ](https://game-icons.net/faq.html) states this is enough for video games). Authors currently used:
**Lorc**, **Delapouite**.

Advantage: it can be downloaded automatically from the GitHub repo, no manual steps.

### Kenney (CC0)

Source: <https://kenney.nl/assets> · every pack states **CC0** clearly. European fantasy style, better
suited to **UI icons** (buttons, stats) than to wuxia items.

---

## Where to put files

```
public/icons/
├─ items/   <templateId>-<star>.png     e.g. wooden-blade-1.png, great-axe-4.png
├─ pets/    <petId>.png                 e.g. fire-pup.png
├─ skills/  <petId>-skill.png           e.g. fire-pup-skill.png
└─ ui/      (interface icons, optional)
```

For an extension other than `png`, declare `artExt` in the template.

## How the code finds art

`frontend/src/game/art.ts` resolves the path; `frontend/src/components/ItemIcon.tsx` displays it
(`ItemIcon`, `PetIcon`, `SkillIcon`), built on `ArtIcon`.

**Important principle:** only return a path when you **know for sure the file exists**, based on the
star list declared in `items.ts` (`stars: [1, 2, 3, 4]`) / `pets.ts` (`art: true`). Do not guess file
names — a wrong guess shows a broken icon.

When there is no art, or the image fails to load → it **falls back to the emoji**. That way art can be
added little by little, and the game has never shown an empty cell.

```ts
// items.ts — declare which stars have art
{
  id: 'wooden-blade',
  icon: '🗡️',                    // fallback, always keep
  stars: [1, 2, 3, 4],          // art exists for star ranks 1–4 (5★ uses the emoji)
  artExt: 'png',                // optional, defaults to 'png'
}

// pets.ts
{
  id: 'fire-pup',
  icon: '🐶',                    // fallback, always keep
  art: true,                    // public/icons/pets/fire-pup.png exists
  skillArt: true,               // public/icons/skills/fire-pup-skill.png exists
}
```

## Guard tests

`frontend/src/game/__tests__/art.test.ts` checks:
- every template declaring `stars` has a **real file** for each of those stars
- every pet `art`/`skillArt` flag has a file
- **no leftover files** in `public/icons/` (a file matching no template — a sign of a wrong mapping)
- it returns `null` at the right moment so the emoji fallback kicks in

This test already caught 4 leftover `vine-fan-*.png` files from a bad mapping.

`frontend/src/game/__tests__/artAlpha.test.ts` checks that every image is a **RGBA PNG** (has an alpha
channel) — see the "Trap" section above.
