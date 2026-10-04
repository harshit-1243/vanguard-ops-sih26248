/** Fictional 8×8 theatre grid. Columns A–H (x 0–7), rows 1–8 (y 0–7). 1 cell = 1 km (fictional). */
export const COLS = 8;
export const ROWS = 8;
export const COL_LETTERS = 'ABCDEFGH';
export const CELL_RE = /^[A-H][1-8]$/;

export type Cell = string;
export interface Vec {
  x: number;
  y: number;
}

export function isCell(value: unknown): value is Cell {
  return typeof value === 'string' && CELL_RE.test(value);
}

export function cellIndex(cell: Cell): { col: number; row: number } {
  if (!isCell(cell)) throw new Error(`Invalid cell "${cell}"`);
  return { col: COL_LETTERS.indexOf(cell[0]!), row: Number(cell[1]) - 1 };
}

export function cellFromIndex(col: number, row: number): Cell {
  return `${COL_LETTERS[col]}${row + 1}`;
}

export function cellCentre(cell: Cell): Vec {
  const { col, row } = cellIndex(cell);
  return { x: col + 0.5, y: row + 0.5 };
}

export function inGrid(v: Vec): boolean {
  return v.x >= 0 && v.x < COLS && v.y >= 0 && v.y < ROWS;
}

/** Cell containing a point; points outside the grid are clamped to the nearest edge cell. */
export function vecToCell(v: Vec): Cell {
  const col = Math.min(COLS - 1, Math.max(0, Math.floor(v.x)));
  const row = Math.min(ROWS - 1, Math.max(0, Math.floor(v.y)));
  return cellFromIndex(col, row);
}

export function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function cellDistance(a: Cell, b: Cell): number {
  return dist(cellCentre(a), cellCentre(b));
}

/** Chebyshev distance between cells (0 = same, 1 = adjacent incl. diagonals). */
export function cellSteps(a: Cell, b: Cell): number {
  const ia = cellIndex(a);
  const ib = cellIndex(b);
  return Math.max(Math.abs(ia.col - ib.col), Math.abs(ia.row - ib.row));
}

export function areAdjacent(a: Cell, b: Cell): boolean {
  return cellSteps(a, b) === 1;
}

export function neighbours(cell: Cell): Cell[] {
  const { col, row } = cellIndex(cell);
  const out: Cell[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const c = col + dx;
      const r = row + dy;
      if (c >= 0 && c < COLS && r >= 0 && r < ROWS) out.push(cellFromIndex(c, r));
    }
  }
  return out;
}

export function allCells(): Cell[] {
  const out: Cell[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) out.push(cellFromIndex(col, row));
  }
  return out;
}

export const TERRAIN_CODES = {
  '.': 'OPEN',
  F: 'FOREST',
  U: 'URBAN',
  '~': 'RIVER',
  '=': 'BRIDGE',
  '^': 'RIDGE',
  W: 'SEA',
  M: 'MARSH',
  H: 'HILLS',
} as const;
export type TerrainCode = keyof typeof TERRAIN_CODES;
export type TerrainName = (typeof TERRAIN_CODES)[TerrainCode];
export const TERRAIN_RE = /^[.FU~=^WMH]{8}$/;

export function terrainAt(terrain: readonly string[], cell: Cell): TerrainCode {
  const { col, row } = cellIndex(cell);
  return (terrain[row]?.[col] ?? '.') as TerrainCode;
}

/** 0 = sea/river level, 1 = plains, 2 = hills, 3 = ridge. Used by a future 3D sand-model client. */
export function elevationClass(code: TerrainCode): number {
  switch (code) {
    case 'W':
    case '~':
    case '=':
    case 'M':
      return 0;
    case 'H':
      return 2;
    case '^':
      return 3;
    default:
      return 1;
  }
}
