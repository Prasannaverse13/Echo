import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/auth/google/exchange
 *
 * Exchanges a Google OAuth 2.0 authorization code for an id_token,
 * decodes the id_token, and returns the user profile payload. The
 * client uses this to sign the user in via the same
 * signInWithGoogleProfile() path the rest of the app already uses.
 *
 * Body: { code: string, redirectUri?: string }
 * Response: { sub, email, name, picture } or { error }
 *
 * Why server-side? Two reasons:
 *   1. We need the GOOGLE_CLIENT_SECRET to call the token endpoint
 *      (it's never shipped to the browser).
 *   2. It lets us verify the id_token against Google's public keys
 *      before trusting its claims — important because a hacked
 *      client could otherwise forge an id_token.
 *
 * For the hackathon we skip signature verification (HTTPS is the
 * transport guarantee + the id_token audience must match our
 * client_id) and just decode the payload. Add JWKS verification
 * post-hackathon.
 */
export async function POST(req: NextRequest) {
  let body: { code?: string; redirectUri?: string };
  try {
    body = (await req.json()) as { code?: string; redirectUri?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const code = body.code;
  if (!code || typeof code !== "string") {
    return NextResponse.json(
      { error: "Missing or invalid `code` in request body" },
      { status: 400 }
    );
  }

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set on the server" },
      { status: 500 }
    );
  }
  if (!clientSecret) {
    return NextResponse.json(
      { error: "GOOGLE_CLIENT_SECRET is not set on the server" },
      { status: 500 }
    );
  }

  // The redirect_uri passed to the token endpoint MUST exactly match
  // the one we used in the authorisation request, otherwise Google
  // rejects the exchange. The client sends it back so the server
  // doesn't have to know which host it lives on (Vercel preview
  // deployments, localhost, production, etc.).
  const redirectUri =
    body.redirectUri && typeof body.redirectUri === "string"
      ? body.redirectUri
      : req.nextUrl.origin;

  // Exchange the code for tokens.
  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
    cache: "no-store",
  });

  if (!tokenResp.ok) {
    const errText = await tokenResp.text().catch(() => "(no body)");
    return NextResponse.json(
      {
        error: "Google token exchange failed",
        status: tokenResp.status,
        details: errText.slice(0, 500),
      },
      { status: 502 }
    );
  }

  const tokens = (await tokenResp.json()) as {
    access_token?: string;
    id_token?: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
  };
  if (!tokens.id_token) {
    return NextResponse.json(
      { error: "Google did not return an id_token" },
      { status: 502 }
    );
  }

  // Decode the id_token payload. We don't verify the signature here
  // (would need to fetch https://www.googleapis.com/oauth2/v1/certs
  // and check the JWT against it) — for the hackathon we trust the
  // transport (HTTPS) and the aud claim (must equal clientId).
  const claims = decodeJwtUnsafe(tokens.id_token) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
    aud?: string | string[];
    iss?: string;
    exp?: number;
  } | null;

  if (!claims) {
    return NextResponse.json(
      { error: "Could not decode id_token" },
      { status: 502 }
    );
  }
  if (claims.aud !== clientId && !(Array.isArray(claims.aud) && claims.aud.includes(clientId))) {
    return NextResponse.json(
      { error: "id_token audience does not match our client_id" },
      { status: 401 }
    );
  }
  if (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") {
    return NextResponse.json(
      { error: "id_token issuer is not Google" },
      { status: 401 }
    );
  }
  if (typeof claims.exp === "number" && claims.exp * 1000 < Date.now()) {
    return NextResponse.json({ error: "id_token has expired" }, { status: 401 });
  }
  if (!claims.sub || !claims.email || !claims.name) {
    return NextResponse.json(
      { error: "id_token is missing required claims (sub, email, name)" },
      { status: 401 }
    );
  }

  return NextResponse.json({
    sub: claims.sub,
    email: claims.email,
    name: claims.name,
    picture: claims.picture,
  });
}

function decodeJwtUnsafe<T = Record<string, unknown>>(token: string): T | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded =
      payload + "===".slice(0, (4 - (payload.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as T;
  } catch {
    return null;
  }
}
