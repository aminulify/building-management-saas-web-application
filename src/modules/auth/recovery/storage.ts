/**
 * Recovery progress lives in sessionStorage (never in the URL): the email typed on step 1 and, after the
 * code is verified, the short-lived recovery token used on step 3. It ends with the tab.
 */
const KEY = "ag.recovery";

export interface RecoveryState { email?: string; token?: string }

export function getRecovery(): RecoveryState {
  try { return JSON.parse(sessionStorage.getItem(KEY) ?? "{}") as RecoveryState; } catch { return {}; }
}

export function setRecovery(patch: RecoveryState) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ ...getRecovery(), ...patch })); } catch { /* private mode: flow restarts on reload */ }
}

export function clearRecovery() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}
