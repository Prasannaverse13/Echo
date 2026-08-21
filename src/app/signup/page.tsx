import Link from "next/link";
import { Button, NavBar, Footer, FeatureTag } from "@/components/ui";

export default function SignupPage() {
  return (
    <>
      <NavBar />
      <main className="flex-1 bg-paper-white">
        <div className="page-container py-16 md:py-24">
          <div className="max-w-md mx-auto">
            <FeatureTag variant="desert-clay" className="mb-6">
              Free forever for the first 5 skills
            </FeatureTag>
            <h1 className="text-display-md font-bold text-obsidian">
              Teach Echo your first workflow.
            </h1>
            <p className="mt-3 text-body text-obsidian/70">
              60 seconds to set up. No credit card required.
            </p>

            <form className="mt-10 space-y-4">
              <div>
                <label className="text-caption font-medium text-obsidian block mb-2">
                  Full name
                </label>
                <input
                  type="text"
                  placeholder="Ada Lovelace"
                  className="w-full px-4 py-3 rounded-full border border-iron bg-paper-white text-body-sm focus:outline-none focus:border-obsidian transition-colors"
                />
              </div>
              <div>
                <label className="text-caption font-medium text-obsidian block mb-2">
                  Work email
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
                <p className="mt-2 text-caption text-obsidian/50">
                  At least 8 characters with one number.
                </p>
              </div>
              <Button variant="light" size="lg" className="w-full">
                Create my Echo →
              </Button>
            </form>

            <p className="mt-8 text-center text-body-sm text-obsidian/60">
              Already have an account?{" "}
              <Link
                href="/login"
                className="text-obsidian font-medium underline-offset-4 hover:underline"
              >
                Sign in
              </Link>
            </p>
            <p className="mt-3 text-center text-caption text-obsidian/40">
              By signing up, you agree to Echo's Terms and Privacy Policy.
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
