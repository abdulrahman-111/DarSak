/** SanDak: a 16x16 pocket-notebook sprite with six moods. Pure data, no React. */

export type SandakMood = 'idle' | 'thinking' | 'needs' | 'done' | 'oops' | 'sleep';

export const SANDAK_MOODS: readonly SandakMood[] = [
  'idle',
  'thinking',
  'needs',
  'done',
  'oops',
  'sleep',
];

export const SPRITE_SIZE = 16;
/** Transparent rows above the notebook that hold the per-mood extras (badges, bubbles). */
export const SPRITE_HEADROOM = 5;

export const PALETTE: Record<string, string> = {
  O: '#0e3b3c',
  B: '#1f6f6b',
  L: '#6fbfb1',
  P: '#fff8ec',
  E: '#0f2324',
  W: '#ffffff',
  R: '#b04c16',
  C: '#e99a6c',
  Y: '#f2b441',
  K: '#23211e',
  G: '#2c5620',
  D: '#4f9ee0',
};

const BASE = [
  '...........K....',
  '..........YY....',
  '.........YY.....',
  '..OOOOOOOOOOOO..',
  '.OBBBBBBBBBBBBO.',
  '.OBLLBBBBBBBBBOP',
  '.OBLBBBBBBBBBBOP',
  '.OBBBBBBBBBBBBOP',
  '.OBBBBBBBBBBBBOP',
  '.OBBBBBBBBBBBBOP',
  '.OBBBBBBBBBBBBOP',
  '.OBBBBBBBBBBBBOP',
  '.OBBBBBBBBBBBBO.',
  '..OOOOOORROOOOO.',
  '........RR......',
  '.......R..R.....',
];

type Point = readonly [number, number];
type Override = Partial<Record<string, readonly Point[]>>;

const CHEEKS: readonly Point[] = [
  [3, 9],
  [12, 9],
];

const FACE: Record<SandakMood, Override> = {
  idle: {
    E: [
      [4, 7],
      [4, 8],
      [5, 8],
      [10, 7],
      [10, 8],
      [11, 8],
    ],
    W: [
      [5, 7],
      [11, 7],
    ],
    O: [
      [7, 10],
      [8, 10],
    ],
    C: CHEEKS,
  },
  thinking: {
    E: [
      [5, 6],
      [6, 6],
      [5, 7],
      [6, 7],
      [11, 6],
      [12, 6],
      [11, 7],
      [12, 7],
    ],
    W: [
      [6, 6],
      [12, 6],
    ],
    O: [[8, 10]],
  },
  needs: {
    E: [
      [4, 6],
      [5, 6],
      [4, 7],
      [5, 7],
      [4, 8],
      [5, 8],
      [10, 6],
      [11, 6],
      [10, 7],
      [11, 7],
      [10, 8],
      [11, 8],
    ],
    W: [
      [5, 6],
      [11, 6],
    ],
    O: [
      [7, 10],
      [8, 10],
      [7, 11],
      [8, 11],
    ],
    C: CHEEKS,
  },
  done: {
    E: [
      [4, 7],
      [5, 7],
      [3, 8],
      [6, 8],
      [10, 7],
      [11, 7],
      [9, 8],
      [12, 8],
    ],
    O: [
      [6, 10],
      [9, 10],
      [7, 11],
      [8, 11],
    ],
    C: CHEEKS,
  },
  oops: {
    E: [
      [3, 6],
      [5, 6],
      [4, 7],
      [3, 8],
      [5, 8],
      [10, 6],
      [12, 6],
      [11, 7],
      [10, 8],
      [12, 8],
    ],
    O: [
      [6, 11],
      [7, 10],
      [8, 11],
      [9, 10],
    ],
  },
  sleep: {
    E: [
      [3, 8],
      [4, 8],
      [5, 8],
      [10, 8],
      [11, 8],
      [12, 8],
    ],
    O: [[8, 10]],
    C: CHEEKS,
  },
};

/** Extras are drawn in the headroom rows (negative y) above the notebook. */
const EXTRAS: Record<SandakMood, Array<[string, readonly Point[]]>> = {
  idle: [],
  thinking: [
    [
      'L',
      [
        [1, -4],
        [2, -4],
        [3, -4],
        [4, -4],
        [5, -4],
        [6, -4],
        [7, -4],
        [0, -3],
        [1, -3],
        [2, -3],
        [3, -3],
        [4, -3],
        [5, -3],
        [6, -3],
        [7, -3],
        [8, -3],
        [1, -2],
        [2, -2],
        [3, -2],
        [4, -2],
        [5, -2],
        [6, -2],
        [7, -2],
        [2, -1],
      ],
    ],
    [
      'W',
      [
        [2, -3],
        [4, -3],
        [6, -3],
      ],
    ],
  ],
  needs: [
    [
      'R',
      [
        [1, -5],
        [2, -5],
        [1, -4],
        [2, -4],
        [1, -3],
        [2, -3],
        [1, -1],
        [2, -1],
      ],
    ],
  ],
  done: [
    [
      'G',
      [
        [5, -5],
        [4, -4],
        [0, -3],
        [3, -3],
        [1, -2],
        [2, -2],
      ],
    ],
  ],
  oops: [
    [
      'D',
      [
        [13, -3],
        [12, -2],
        [13, -2],
        [14, -2],
        [12, -1],
        [13, -1],
        [14, -1],
      ],
    ],
  ],
  sleep: [
    [
      'L',
      [
        [1, -5],
        [2, -5],
        [3, -5],
        [3, -4],
        [2, -3],
        [1, -2],
        [2, -2],
        [3, -2],
        [5, -3],
        [6, -3],
        [6, -2],
        [6, -1],
        [7, -1],
      ],
    ],
  ],
};

export type Rect = { x: number; y: number; w: number; fill: string };

const cache = new Map<SandakMood, Rect[]>();

/** Builds horizontal runs of same-coloured pixels (one rect per run, not per pixel). */
export function spriteRects(mood: SandakMood): Rect[] {
  const cached = cache.get(mood);
  if (cached) return cached;
  const grid = new Map<string, string>();
  const key = (x: number, y: number) => `${x},${y}`;
  BASE.forEach((row, y) => {
    for (let x = 0; x < SPRITE_SIZE; x++) if (row[x] !== '.') grid.set(key(x, y), row[x]);
  });
  const face = FACE[mood];
  // Eyes first so highlights (W) and mouth/cheeks sit on top of them.
  for (const char of ['E', 'W', 'O', 'C']) {
    for (const [x, y] of face[char] ?? []) grid.set(key(x, y), char);
  }
  for (const [char, points] of EXTRAS[mood]) {
    for (const [x, y] of points) grid.set(key(x, y), char);
  }
  const rects: Rect[] = [];
  for (let y = -SPRITE_HEADROOM; y < SPRITE_SIZE; y++) {
    let x = 0;
    while (x < SPRITE_SIZE) {
      const char = grid.get(key(x, y));
      if (!char) {
        x++;
        continue;
      }
      let end = x + 1;
      while (end < SPRITE_SIZE && grid.get(key(end, y)) === char) end++;
      rects.push({ x, y, w: end - x, fill: PALETTE[char] });
      x = end;
    }
  }
  cache.set(mood, rects);
  return rects;
}
