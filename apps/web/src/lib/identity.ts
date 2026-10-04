/**
 * Per-tab identity (DECISIONS D-011). sessionStorage only re-authenticates THIS tab after a refresh;
 * it is never used to sync exercise state — all state comes from the server over Socket.IO.
 */
export interface Identity {
  token: string;
  actor: 'DS' | string;
  callsign?: string;
  pin?: string;
}

const key = (code: string) => `vanguard:${code.toUpperCase()}`;

export function saveIdentity(code: string, id: Identity): void {
  try {
    sessionStorage.setItem(key(code), JSON.stringify(id));
  } catch {
    /* storage unavailable — user re-joins after refresh */
  }
}

export function loadIdentity(code: string): Identity | null {
  try {
    const raw = sessionStorage.getItem(key(code));
    return raw ? (JSON.parse(raw) as Identity) : null;
  } catch {
    return null;
  }
}

export function clearIdentity(code: string): void {
  try {
    sessionStorage.removeItem(key(code));
  } catch {
    /* ignore */
  }
}
