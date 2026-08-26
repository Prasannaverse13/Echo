import { Footer } from "@/components/ui";
import { AnimatedLanding } from "@/components/landing/AnimatedLanding";
import { GoogleSignInHandler } from "@/components/auth/GoogleSignInHandler";

export default function HomePage() {
  return (
    <>
      {/* If the user just bounced back from Google's full sign-in page
          (ux_mode: "redirect"), the id_token sits in window.location.hash
          and GoogleSignInHandler will sign them in + redirect to
          /dashboard. For everyone else it renders nothing. */}
      <GoogleSignInHandler />
      {/* EchoHero has its own floating pill navbar, so we don't include the regular NavBar here */}
      <AnimatedLanding />
      <Footer />
    </>
  );
}
