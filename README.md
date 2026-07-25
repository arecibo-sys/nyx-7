# NYX‑7

A real‑time 3D configurator for the **NYX‑7**, a fictional electric grand touring crossover coupé.
Every polygon, texture and note of the soundtrack is generated in the browser at load time — the
repository contains no models, no images and no audio files.

**Live:** https://arecibo-sys.github.io/nyx-7/

---

## What it is

The car is not an imported mesh. The shell is a **lofted parametric surface**: a series of stations
along the length of the vehicle, each a superellipse with *separate exponents above and below its
widest point*. A high exponent up top produces the flat deck and tight shoulder radius a car needs;
a lower one underneath lets the flanks tuck in over the sills. Wheel arches are cut by lifting the
rocker line with a cosine bump over each axle. Trim — the light‑catcher crease, door shut lines,
hood cuts, sill blades, mirror pods, the charge‑port ring — is placed by solving the surface
equation for the exact point it should sit on, so nothing floats and nothing sinks.

Everything else is built the same way: the tyre is a lathed carcass with grooves and 46 sipes, the
rim is ten twin‑spoke turbine blades with a 3.2° aero twist, the carbon weave is a 2×2 twill drawn
to a canvas as a colour/normal pair, the clearcoat carries a procedurally generated orange‑peel
micro‑normal.

Lighting is an automotive studio: a PMREM environment baked from a synthetic light box (overhead
softbox, vertical strip keys, rim from behind, floor bounce) plus three directional lights, ACES
filmic tone mapping and a restrained bloom pass.

## The score

A generative ambient piece written with the Web Audio API. No files, no loops.

- A four‑chord cycle (Am9 → Fmaj7 → Cmaj9 → Gsus) held about 14 s each
- Pad voices: two detuned saws, a triangle and a sub sine per note, through a slowly opening
  low‑pass, with 5 s attacks and slow vibrato
- A sub drone that glides to each new root
- Sparse FM bells on an A‑minor pentatonic, every 5–14 s
- A filtered noise bed panning slowly across the stereo field
- Reverb from a procedurally synthesised, pinked, exponentially decaying impulse response
- Interface ticks and a camera swoosh, mixed well under the music

The master ceiling is deliberately low and the whole mix ducks to silence when the tab is hidden.
Audio starts only on the entry click, as browsers require.

## Controls

| | |
|---|---|
| Orbit | drag / one finger |
| Zoom | scroll / pinch |
| Finish | six paints, each with its own flake density and roughness |
| View | five framed camera presets, eased |
| Toggles | lighting signature, spoiler deploy, auto orbit, studio floor |
| Score | volume, or mute from the header |

## Responsive & performance

The renderer profiles the device on load (pointer type, core count, memory, viewport) and picks one
of four tiers, which sets loft resolution, texture sizes, shadow map size, pixel‑ratio cap,
antialiasing and whether the bloom pass runs at all.

Framing is solved rather than tabulated: on a narrow column the *horizontal* field of view is the
binding constraint, so the camera distance is derived from it, then the aim point is dropped by the
share of the viewport the dock covers — the car composes in the clear area on phone portrait, iPad
in either orientation and desktop alike, with the orbit's polar limit re‑derived so the lowered aim
can't swing the camera under the floor.

Touch gets its own handling: less damping and near 1:1 travel, since a finger expects the model to
track it rather than glide. Damping is rescaled against the real frame delta so a phone at 40 fps
doesn't feel heavier than a desktop at 120. The shadow map is rendered once and then frozen — the
car is static and only the camera orbits — and the mobile dock drops its `backdrop-filter`, because
blurring a live WebGL canvas every frame costs more than the frosted glass is worth. If the frame
rate falls below 40 fps the pixel ratio steps down, up to twice.

`prefers-reduced-motion` disables auto‑orbit and camera easing.

## Running locally

Any static server will do — ES modules need an HTTP origin:

```bash
python3 -m http.server 8777
# → http://localhost:8777
```

Three.js r169 is loaded from a CDN via an import map. Nothing to install, nothing to build.

## Layout

```
index.html        markup + import map
styles.css        interface
src/main.js       renderer, environment, lighting, camera, UI
src/car.js        parametric body, greenhouse, wheels, trim
src/materials.js  procedural textures and the material library
src/audio.js      generative ambient score
```

## Licence

MIT.
