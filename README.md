# Flappy Peacock

A complete, small Flappy Bird–style game — starring a peacock — written in
plain HTML, CSS and JavaScript. No frameworks, no build step, no
`npm install`. Everything the game needs is in this repository.

Made by Nirdosh.

```
flappy-bird-/
├── index.html   the page and the <canvas> the game is drawn on
├── style.css    only the page *around* the canvas
└── game.js      the entire game
```

## How to play

Open `index.html` in your browser. That's it.

If you prefer a local server (handy while editing, so a refresh always picks
up your changes):

```bash
npx serve .
# or
python -m http.server
```

Then visit the address it prints.

**Controls** — <kbd>Space</kbd>, <kbd>↑</kbd>, <kbd>W</kbd>, a click, or a tap
on a phone. The first press starts the game and the second press after death
restarts it. There is a Sound button to mute it.

## How the code is organised

`game.js` is the interesting file. It is split into eight numbered sections
in this order, and you can read it from top to bottom like a story:

| Section | What's in it |
| --- | --- |
| 1. `CONFIG` | every number you might want to change |
| 2. `STATE` | the data that changes while you play |
| 3. `HELPERS` | `clamp`, `lerp`, `randomBetween` |
| 4. `SETUP` | canvas scaling, sounds, high-score storage |
| 5. `GAME FLOW` | `startGame`, `resetGame`, `endGame` |
| 6. `UPDATE` | the rules: gravity, pipes, collisions, score |
| 7. `DRAW` | the pictures |
| 8. `WIRING` | input handlers and the main loop |

The one idea worth internalising is the split between **`update()` and
`draw()`**:

- `update(dt)` changes the numbers. It decides where the bird and pipes are.
- `draw()` changes the pixels. It only looks at the numbers and puts circles
  and rectangles on the canvas.

Keeping them separate means the game's behaviour doesn't depend on how the
screen is being painted, and it makes the rules much easier to reason about.

## The five ideas this game is built from

If you only remember five things from this project, make it these.

**1. A game loop.** `requestAnimationFrame` calls a function roughly 60 times
a second, and the browser only calls it again once your function returns.
That is the entire engine:

```js
function loop(now) {
  const dt = (now - lastTime) / 1000;  // seconds since the last frame
  update(dt);
  draw();
  requestAnimationFrame(loop);        // ask for the next frame
}
```

**2. `dt`, not "pixels per frame".** Movement is always
`speed × dt`. If you hard-coded `bird.y += 4` the game would run twice as
fast on a 120Hz monitor as on a 60Hz one. Because we multiply by `dt`, the
game feels identical everywhere. `dt` is also clamped in the loop so that
switching to another browser tab can't teleport the bird into a pipe.

**3. Gravity plus impulses.** The bird is never told *where* to go. Gravity
adds to its speed every frame, and a flap simply overwrites that speed:

```js
bird.vy += CONFIG.gravity * dt;   // speed up downwards
bird.y  += bird.vy * dt;         // then move
bird.vy  = -CONFIG.flapStrength; // a flap throws out the old speed
```

Flap strength and gravity are the only two numbers controlling the whole
feel of the game.

**4. Collision = distance.** The bird is an invisible circle, each pipe is a
rectangle. Find the closest point on the rectangle to the bird's centre and
check whether it is nearer than the bird's radius. That's
`circleHitsRect()`, eight lines, and it handles every case including the
corners.

**5. Difficulty is a formula, not a special case.** `getDifficulty()` turns
the score into a gap height and a scroll speed. Everything harder about the
game is a consequence of that one function.

## Things to try

Change a number in `CONFIG`, save, refresh. That is the whole edit-test loop,
and it is the fastest way to learn what each number does.

- `gravity: 1800` and `flapStrength: 620` — the two numbers that decide
  whether the game feels floaty or brutal. Try `gravity: 1200` for a slow,
  floaty bird.
- `CONFIG.pipe.gapStart` — how wide the opening is at the start.
- `CONFIG.pipe.speedMax` — how fast things get at full difficulty.
- `CONFIG.difficultyRamp` — raise it to 50 and the game stays easy for a long
  time.
- `CONFIG.birdRadius` — the peacock's collision size. The *drawn* peacock is
  about 57 x 59 px but this circle is only 32 px across, and that deliberate
  mismatch is what makes the game forgiving. Try `8` to make it very easy, or
  `22` to make it brutal.
- `CONFIG.colors` — the whole palette in one place, including every shade of
  the peacock and its tail feathers.

## The peacock

The bird is drawn in four passes, back to front, in `drawBird()`:

1. `drawTail()` — a fan of nine feathers, each a shaft plus a three-ring
  "eye" spot at the tip. Longest feather in the middle so it reads as a fan.
2. `drawBody()` — body ellipse, darker underside, and a wing that sweeps up
  and back down on every flap.
3. `drawHead()` — the long neck as a single thick stroked curve.
4. Inside `drawHead()` — the crest (three stalks with balls on the ends),
   head, beak and eye. The crest does more to say "peacock" than anything
   else on screen.

Everything is drawn in "bird space": the origin is the peacock's centre and
`+x` is the direction it is travelling, so `drawBird` can rotate the whole
thing with one `ctx.rotate(bird.tilt)`.

Some slightly bigger exercises, roughly in order of difficulty:

1. **Add a second pipe lane** offset by half a `spacing`, so there are always
   two pipes to choose between. You'll need to change the array to hold
   lanes and to make sure you only score once for the pair.
2. **Coins** in the gap. Give them the same `circleHitsRect` treatment, and
   remember to delete them when they scroll off the left edge, the way
   `updatePipes` deletes pipes.
3. **A pause key** (<kbd>P</kbd>). Guard `loop()` so it skips `update(dt)`
   but still calls `draw()`.
4. **Parallax clouds** in the background. Move them at half the pipe speed and
   draw them before `drawPipes()`.

## A note on the comments

The comments explain *why* a line exists rather than restating what it does.
`bird.y += bird.vy * dt` needs no comment; `gapWander` existing at all needs
one, because the reason is invisible in the code: without it you can get a
random gap that is physically impossible to reach from the last one.

## Browser support

Any current browser. The game uses `requestAnimationFrame`, the Web Audio
API, `localStorage`, and `canvas.roundRect` (which has a plain-rectangle
fallback, see `fillRoundedRect`).
