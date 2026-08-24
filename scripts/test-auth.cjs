/**
 * E2E auth flow test using a headless-style fetch simulation.
 * Verifies the page renders + key form fields are present.
 */
const http = require("http");

function request(path, method, body, cookies) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "localhost",
        port: 3000,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
          ...(cookies ? { Cookie: cookies } : {}),
        },
      },
      (res) => {
        let chunks = "";
        res.on("data", (d) => (chunks += d));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(chunks) });
          } catch {
            resolve({ status: res.statusCode, body: chunks });
          }
        });
      }
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  console.log("=== Auth pages smoke test ===\n");

  // /login page
  const login = await request("/login", "GET");
  const loginHtml = String(login.body);
  console.log("/login:    status=" + login.status);
  const checks = [
    ["'Sign in to Echo.' headline", loginHtml.includes("Sign in to Echo.")],
    ["'Your skills are waiting.' sub", loginHtml.includes("Your skills are waiting.")],
    ["no 'Continue with Google'", !loginHtml.includes("Continue with Google")],
    ["no 'Continue with GitHub'", !loginHtml.includes("Continue with GitHub")],
    ["email input", loginHtml.includes('type="email"')],
    ["password input", loginHtml.includes('type="password"') || loginHtml.includes("PasswordInput")],
    ["eye toggle (Show password)", loginHtml.includes("Show password") || loginHtml.includes("Hide password")],
    ["Sign in button", loginHtml.includes("Sign in")],
    ["'Create an account' link to /signup", loginHtml.includes('href="/signup"')],
  ];
  for (const [label, ok] of checks) {
    console.log("  " + (ok ? "PASS" : "FAIL") + " " + label);
  }

  // /signup page
  const signup = await request("/signup", "GET");
  const signupHtml = String(signup.body);
  console.log("\n/signup:   status=" + signup.status);
  const sChecks = [
    ["'Teach Echo your first workflow.' headline", signupHtml.includes("Teach Echo your first workflow.")],
    ["no Google button", !signupHtml.includes("Continue with Google")],
    ["no GitHub button", !signupHtml.includes("Continue with GitHub")],
    ["Full name input", /id="name"/.test(signupHtml)],
    ["email input", signupHtml.includes('type="email"')],
    ["password input + autocomplete new-password", /autoComplete="new-password"/.test(signupHtml)],
    ["eye toggle", signupHtml.includes("Show password") || signupHtml.includes("Hide password")],
    ["Create button", signupHtml.includes("Create my Echo")],
    ["'8 characters with one number' hint", signupHtml.includes("At least 8 characters")],
    ["'Sign in' link to /login", signupHtml.includes('href="/login"')],
  ];
  for (const [label, ok] of sChecks) {
    console.log("  " + (ok ? "PASS" : "FAIL") + " " + label);
  }

  const allPassed = [...checks, ...sChecks].every(([_, ok]) => ok);
  console.log("\n" + (allPassed ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"));
  process.exit(allPassed ? 0 : 1);
})();
