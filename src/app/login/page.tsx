import Link from "next/link";
import { Button, NavBar, Footer, FeatureTag } from "@/components/ui";

export default function LoginPage() {
  return (
    <>
      <NavBar />
      <main className="flex-1 bg-paper-white">
        <div className="page-container py-16 md:py-24">
          <div className="max-w-md mx-auto">
            <FeatureTag variant="iron" className="mb-6">
              Welcome back
            </FeatureTag>
            <h1 className="text-display-md font-bold text-obsidian">
              Sign in to Echo.
            </h1>
            <p className="mt-3 text-body text-obsidian/70">
              Your skills are waiting.
            </p>

            <div className="mt-10 space-y-3">
              <Button variant="outline-light" size="lg" className="w-full">
                <GoogleIcon /> Continue with Google
              </Button>
              <Button variant="outline-light" size="lg" className="w-full">
                <GitHubIcon /> Continue with GitHub
              </Button>
            </div>

            <div className="my-8 flex items-center gap-4">
              <div className="flex-1 h-px bg-iron" />
              <span className="text-caption text-obsidian/50">or</span>
              <div className="flex-1 h-px bg-iron" />
            </div>

            <form className="space-y-4">
              <div>
                <label className="text-caption font-medium text-obsidian block mb-2">
                  Email
                </label>
                <input
                  type="email"
                  placeholder="you@company.com"
                  className="w-full px-4 py-3 rounded-full border border-iron bg-paper-white text-body-sm focus:outline-none focus:border-obsidian transition-colors"
                />
              </div>
              <div>
                <label className="text-caption font-medium text-obsidian block mb-2">
                  Password
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  className="w-full px-4 py-3 rounded-full border border-iron bg-paper-white text-body-sm focus:outline-none focus:border-obsidian transition-colors"
                />
              </div>
              <Button variant="light" size="lg" className="w-full">
                Sign in →
              </Button>
            </form>

            <p className="mt-8 text-center text-body-sm text-obsidian/60">
              New to Echo?{" "}
              <Link
                href="/signup"
                className="text-obsidian font-medium underline-offset-4 hover:underline"
              >
                Create an account
              </Link>
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.47.11-3.06 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.77.11 3.06.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.41-5.27 5.69.41.36.78 1.06.78 2.14v3.18c0 .31.21.67.8.55C20.21 21.38 23.5 17.07 23.5 12 23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}
