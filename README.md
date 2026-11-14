# Sellbird Sky

Fly the Sellbird swallow through a painted sky over the rooftops and eat every email before the
90-second round runs out.

- **Emails** are worth a point. Eat them in quick succession for a streak: every five in a row
  adds to the multiplier.
- **Gold replies** are worth five, but they dart away as you close in.
- **Red spam** costs five points and knocks you off course. More of it shows up late in the round.

## Controls

| | Desktop | Phone |
|---|---|---|
| Steer | Mouse toward where you want to go, or W A S D / arrows | Drag anywhere |
| Flap (speed) | Hold click, Space or Shift | Hold **Flap**, or put a second finger down |

Flapping uses breath, which comes back while you glide. Diving trades height for speed and climbing
bleeds it off. Fly too low and the swallow pulls up over the rooftops on its own.

## How it's made

Everything is generated in code with [three.js](https://threejs.org). There are no models or
textures to download.

- **The swallow** (`src/world/swallow.ts`) is modeled on the bird in the sellbird.ai hero video:
  - a steel-blue back with a blue-violet sheen, a rust face and throat, a dark breast band and a cream belly
  - scimitar wings jointed at the shoulder and wrist, with feathered trailing edges
  - a forked tail with long streamers and white underside spots
  - it glides with short bursts of wingbeats, sweeps its wings back in a dive, and spreads its tail in turns
- **The sky** (`src/world/sky.ts`) is a painted dome:
  - deep blue overhead and pale at the horizon, with a warm glow round the sun
  - a line of cream cumulus along the horizon
  - big 3D clouds you can fly through
- **The city** (`src/world/city.ts`) has:
  - limestone blocks with zinc mansard roofs, dormers, balconies and terracotta chimney pots
  - parks, street trees, a river with quays, and domed landmarks
  - one 20 × 20 block tile wrapped round the camera, so it never ends
- **The painterly look** (`src/render/painterly.ts`) comes from a final pass:
  - a Kuwahara filter flattens the frame into brush-like patches while keeping edges
  - the strokes wobble slightly, with a paper grain and a soft vignette on top
- **Sound** (`src/audio/sound.ts`) is synthesized:
  - wind that rises with speed, and wingbeats
  - a swallow's twitter for each email, pitched higher as a streak grows
  - a chime for replies and a buzz for spam
  - a slow pentatonic music box underneath

Quality steps down on its own when frames run slow (resolution first, then the paint pass).

### URL options

| | |
|---|---|
| `?quality=0` … `3` | Fix the quality tier: 0 is sharpest, 3 turns the paint pass off |
| `?raw` | Turn off the paint pass |
| `?secs=30` | Change the round length |

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build into dist/
```

It deploys as a static Vite site. Vercel picks it up with no configuration.

## Credits

The sky's art direction takes its cue from Vicente Lucendo's *Summer Afternoon* WebGL piece, as
rebuilt in the [SummerTime](https://github.com/KRSHH/SummerTime) port. All of this repo's shaders
and geometry are its own; none of that project's code or assets are used.
