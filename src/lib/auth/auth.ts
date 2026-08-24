/**
 * Local-only auth store. Persists users + their login state in
 * localStorage so the demo works end-to-end without a backend.
 *
 * SECURITY NOTE: this is a *demo* auth — passwords are stored in
 * localStorage in plaintext. In production Echo would use Firebase
 * Auth / NextAuth / Clerk / etc. The hackathon value of this layer
 * is that signup → logout → login actually round-trips correctly,
 * and accounts are visible across browser tabs.
 */

export type StoredUser = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: string;
};

export type Session = {
  userId: string;
  email: string;
  name: string;
  signedInAt: string;
};

const USERS_KEY = "echo.users";
const SESSION_KEY = "echo.session";
const ATTEMPTS_KEY = "echo.login.attempts";
const MAX_ATTEMPTS = 3;

// Fast, non-cryptographic 32-bit hash. Good enough for the demo
// (we're not protecting state secrets, just verifying that the
// user typed the right password). Production would use bcrypt/argon2.
export function hashPassword(plain: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < plain.length; i++) {
    h ^= plain.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // Mix once more to make the result feel less like FNV-1a.
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995) >>> 0;
  h ^= h >>> 15;
  return h.toString(16).padStart(8, "0");
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota errors in the demo
  }
}

function removeKey(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function getUsers(): StoredUser[] {
  return readJson<StoredUser[]>(USERS_KEY, []);
}

function saveUsers(users: StoredUser[]): void {
  writeJson(USERS_KEY, users);
}

function genId(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  );
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export type SignupResult =
  | { ok: true; user: StoredUser }
  | { ok: false; error: string };

export function signup(
  name: string,
  email: string,
  password: string
): SignupResult {
  const trimmedName = name.trim();
  const trimmedEmail = email.trim().toLowerCase();
  if (trimmedName.length < 2) {
    return { ok: false, error: "Please enter your name." };
  }
  if (!isValidEmail(trimmedEmail)) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  if (password.length < 8) {
    return {
      ok: false,
      error: "Password must be at least 8 characters.",
    };
  }
  if (!/\d/.test(password)) {
    return {
      ok: false,
      error: "Password must include at least one number.",
    };
  }
  const users = getUsers();
  if (users.some((u) => u.email === trimmedEmail)) {
    return {
      ok: false,
      error: "An account with this email already exists. Sign in instead.",
    };
  }
  const user: StoredUser = {
    id: genId(),
    name: trimmedName,
    email: trimmedEmail,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  saveUsers(users);
  setSession({ userId: user.id, email: user.email, name: user.name, signedInAt: new Date().toISOString() });
  resetLoginAttempts();
  return { ok: true, user };
}

export type LoginResult =
  | { ok: true; user: StoredUser }
  | { ok: false; error: string; attemptsLeft: number };

export function login(email: string, password: string): LoginResult {
  const trimmedEmail = email.trim().toLowerCase();
  if (!isValidEmail(trimmedEmail)) {
    return {
      ok: false,
      error: "Please enter a valid email address.",
      attemptsLeft: getAttemptsLeft(),
    };
  }
  const users = getUsers();
  const user = users.find((u) => u.email === trimmedEmail);
  if (!user) {
    const consumed = consumeLoginAttempt();
    if (consumed <= 0) {
      return {
        ok: false,
        error: "Too many failed attempts. Try again in a minute.",
        attemptsLeft: 0,
      };
    }
    return {
      ok: false,
      error: "No account found for that email.",
      attemptsLeft: consumed,
    };
  }
  if (user.passwordHash !== hashPassword(password)) {
    const consumed = consumeLoginAttempt();
    if (consumed <= 0) {
      return {
        ok: false,
        error: "Too many failed attempts. Try again in a minute.",
        attemptsLeft: 0,
      };
    }
    return {
      ok: false,
      error: "Incorrect password.",
      attemptsLeft: consumed,
    };
  }
  setSession({ userId: user.id, email: user.email, name: user.name, signedInAt: new Date().toISOString() });
  resetLoginAttempts();
  return { ok: true, user };
}

export function logout(): void {
  removeKey(SESSION_KEY);
  resetLoginAttempts();
}

export function getSession(): Session | null {
  return readJson<Session | null>(SESSION_KEY, null);
}

function setSession(s: Session): void {
  writeJson(SESSION_KEY, s);
  // Notify other tabs / same-tab listeners
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("echo:auth", { detail: s }));
  }
}

// --- Login attempt throttling (in-memory + localStorage so refresh
// doesn't let the user keep guessing) ---

type AttemptState = {
  count: number;
  lockedUntil: number; // epoch ms, 0 if not locked
};

function getAttemptState(): AttemptState {
  return readJson<AttemptState>(ATTEMPTS_KEY, { count: 0, lockedUntil: 0 });
}

function setAttemptState(s: AttemptState): void {
  writeJson(ATTEMPTS_KEY, s);
}

function getAttemptsLeft(): number {
  const s = getAttemptState();
  if (s.lockedUntil > Date.now()) return 0;
  return Math.max(0, MAX_ATTEMPTS - s.count);
}

function consumeLoginAttempt(): number {
  const s = getAttemptState();
  if (s.lockedUntil > Date.now()) return 0;
  const next = s.count + 1;
  if (next >= MAX_ATTEMPTS) {
    setAttemptState({
      count: next,
      lockedUntil: Date.now() + 60_000, // 1 min lockout
    });
    return 0;
  }
  setAttemptState({ count: next, lockedUntil: 0 });
  return Math.max(0, MAX_ATTEMPTS - next);
}

function resetLoginAttempts(): void {
  removeKey(ATTEMPTS_KEY);
}

export function getLoginAttemptInfo(): {
  attemptsLeft: number;
  lockedUntil: number;
} {
  const s = getAttemptState();
  return {
    attemptsLeft: s.lockedUntil > Date.now() ? 0 : MAX_ATTEMPTS - s.count,
    lockedUntil: s.lockedUntil,
  };
}
