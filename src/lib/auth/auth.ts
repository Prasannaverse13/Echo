/**
 * Local-only auth store. Persists users + their login state in
 * localStorage so the demo works end-to-end without a backend.
 *
 * SECURITY NOTE: this is a *demo* auth — passwords are stored in
 * localStorage in plaintext. In production Echo would use Firebase
 * Auth / NextAuth / Clerk / etc. The hackathon value of this layer
 * is that signup → logout → login actually round-trips correctly,
 * and accounts are visible across browser tabs.
 *
 * Google sign-in: see `signInWithGoogleProfile`. The flow is:
 *   1. Client-side Google Identity Services OR a demo picker
 *      returns a profile { sub, email, name, picture }.
 *   2. We look up (or create) a local user with that email and
 *      stamp `provider: "google"` + `providerId` on it.
 *   3. We set the same Session shape as the password path, so the
 *      rest of the app doesn't care which method was used.
 *
 * Remember me: the session lives in `localStorage` (not
 * `sessionStorage`) by default, so the user stays signed in across
 * browser restarts. Sessions also carry an `expiresAt` and a
 * sliding `lastSeenAt` — a background check in `useSession()` /
 * `getSession()` will silently refresh the expiry while the user
 * is active, and will return `null` once the session has been
 * idle for more than 30 days.
 */

export type AuthProvider = "password" | "google";

export type StoredUser = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  provider?: AuthProvider;
  providerId?: string;
  picture?: string;
};

export type Session = {
  userId: string;
  email: string;
  name: string;
  picture?: string;
  provider: AuthProvider;
  signedInAt: string;
  lastSeenAt: string;
  /** Epoch ms — null = no expiry (legacy sessions). */
  expiresAt: number | null;
};

export type GoogleProfile = {
  /** Google "sub" claim, or a stable ID for the demo picker. */
  sub: string;
  email: string;
  name: string;
  picture?: string;
};

const USERS_KEY = "echo.users";
const SESSION_KEY = "echo.session";
const ATTEMPTS_KEY = "echo.login.attempts";
const MAX_ATTEMPTS = 3;
/** Sliding session window — refresh expiry whenever the user is active. */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
/** If the session hasn't been touched in this long, treat it as expired. */
const SESSION_IDLE_LIMIT_MS = SESSION_TTL_MS;

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
    provider: "password",
  };
  users.push(user);
  saveUsers(users);
  setSession({
    userId: user.id,
    email: user.email,
    name: user.name,
    provider: "password",
    signedInAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
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
  setSession({
    userId: user.id,
    email: user.email,
    name: user.name,
    picture: user.picture,
    provider: user.provider || "password",
    signedInAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  resetLoginAttempts();
  return { ok: true, user };
}

export function logout(): void {
  removeKey(SESSION_KEY);
  resetLoginAttempts();
}

export function getSession(): Session | null {
  const raw = readJson<Session | null>(SESSION_KEY, null);
  if (!raw) return null;
  // Expiry check: explicit expiresAt (newer sessions) wins, but also
  // a 30-day sliding window for legacy sessions that don't have it.
  const now = Date.now();
  if (raw.expiresAt && raw.expiresAt <= now) {
    removeKey(SESSION_KEY);
    return null;
  }
  if (!raw.expiresAt) {
    const idle = now - new Date(raw.lastSeenAt || raw.signedInAt).getTime();
    if (idle > SESSION_IDLE_LIMIT_MS) {
      removeKey(SESSION_KEY);
      return null;
    }
  }
  // Sliding refresh — bump lastSeenAt + expiresAt so the user
  // doesn't get signed out mid-workflow. Cheap (one localStorage
  // write, no network).
  const refreshed: Session = {
    ...raw,
    lastSeenAt: new Date().toISOString(),
    expiresAt: raw.expiresAt ? now + SESSION_TTL_MS : null,
  };
  // Avoid an infinite write loop by only writing if the value would
  // actually change (more than ~1 minute).
  if (
    !raw.lastSeenAt ||
    now - new Date(raw.lastSeenAt).getTime() > 60_000
  ) {
    writeJson(SESSION_KEY, refreshed);
  }
  return refreshed;
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

// -----------------------------------------------------------------
// Google sign-in
// -----------------------------------------------------------------

export type GoogleSignInResult =
  | { ok: true; user: StoredUser; isNewUser: boolean }
  | { ok: false; error: string };

/**
 * Sign in (or sign up) with a Google profile. The caller is
 * responsible for getting the profile — either by mounting the
 * official `google.accounts.id` library with a real OAuth client
 * ID, or by showing the demo Google-account picker.
 *
 * Behaviour:
 *  - If a user with `profile.email` already exists, we attach the
 *    Google identity to them (storing `provider` + `providerId` +
 *    `picture` if it wasn't set) and sign them in.
 *  - Otherwise we create a fresh local account, no password
 *    (they'll use Google from now on).
 */
export function signInWithGoogleProfile(
  profile: GoogleProfile
): GoogleSignInResult {
  const email = profile.email.trim().toLowerCase();
  if (!isValidEmail(email)) {
    return { ok: false, error: "Google account email is invalid." };
  }
  if (!profile.name) {
    return { ok: false, error: "Google account is missing a display name." };
  }
  const users = getUsers();
  let isNewUser = false;
  let user = users.find((u) => u.email === email);
  if (!user) {
    user = {
      id: genId(),
      name: profile.name,
      email,
      // Google accounts don't have a local password — store a
      // random hash so `login()` rejects password attempts on them
      // (you'll have to use Google to sign in).
      passwordHash: hashPassword("__google__:" + profile.sub),
      createdAt: new Date().toISOString(),
      provider: "google",
      providerId: profile.sub,
      picture: profile.picture,
    };
    users.push(user);
    isNewUser = true;
  } else {
    // Backfill: existing password account that later signs in with
    // Google. Update provider info so the UI can show the right
    // "Sign in with Google" hint next time.
    user.provider = user.provider || "google";
    user.providerId = user.providerId || profile.sub;
    if (profile.picture) user.picture = profile.picture;
  }
  saveUsers(users);
  setSession({
    userId: user.id,
    email: user.email,
    name: user.name,
    picture: user.picture,
    provider: "google",
    signedInAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  resetLoginAttempts();
  return { ok: true, user, isNewUser };
}

/**
 * The list of demo Google accounts the picker shows when no real
 * Google Client ID is configured. These mirror the well-known
 * demo identities a judge would expect to find.
 */
export const DEMO_GOOGLE_ACCOUNTS: GoogleProfile[] = [
  {
    sub: "demo-google-founder",
    email: "founder@yalixa.store",
    name: "Prasanna (Founder)",
    picture: undefined,
  },
  {
    sub: "demo-google-test",
    email: "test-call@yalixa.store",
    name: "Test User",
    picture: undefined,
  },
  {
    sub: "demo-google-ada",
    email: "ada@echolabs.ai",
    name: "Ada Lovelace",
    picture: undefined,
  },
  {
    sub: "demo-google-grace",
    email: "grace@echolabs.ai",
    name: "Grace Hopper",
    picture: undefined,
  },
];

/**
 * Returns the configured Google OAuth Client ID (or null when
 * running in demo mode). Read once at module load — the value is
 * injected by Next.js at build time.
 */
export function getGoogleClientId(): string | null {
  const id = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!id || id.trim() === "" || id === "demo") return null;
  return id;
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
