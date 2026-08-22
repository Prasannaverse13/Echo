import { Footer } from "@/components/ui";
import { AnimatedLanding } from "@/components/landing/AnimatedLanding";

export default function HomePage() {
  return (
    <>
      {/* EchoHero has its own floating pill navbar, so we don't include the regular NavBar here */}
      <AnimatedLanding />
      <Footer />
    </>
  );
}
