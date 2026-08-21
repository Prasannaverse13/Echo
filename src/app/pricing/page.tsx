import { Button, FeatureTag, FeatureCard, NavBar, Footer } from "@/components/ui";

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "For trying Echo and personal experiments.",
    features: [
      "5 skills",
      "100 runs / month",
      "1 active agent",
      "Community support",
    ],
    cta: "Get started",
    href: "/signup",
    surface: "bone" as const,
  },
  {
    name: "Pro",
    price: "$29",
    period: "/ month",
    description: "For power users running multiple workflows daily.",
    features: [
      "Unlimited skills",
      "10,000 runs / month",
      "Unlimited agents",
      "Scheduled & webhook triggers",
      "Priority Gemini access",
      "Email support",
    ],
    cta: "Start free trial",
    href: "/signup",
    surface: "wisteria" as const,
    highlighted: true,
  },
  {
    name: "Team",
    price: "$99",
    period: "/ user / month",
    description: "For teams sharing skills across the org.",
    features: [
      "Everything in Pro",
      "Shared skill library",
      "Role-based access control",
      "Audit logs",
      "Skill versioning",
      "Slack support",
    ],
    cta: "Contact sales",
    href: "/contact",
    surface: "dusty-sky" as const,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For large orgs with custom needs.",
    features: [
      "Everything in Team",
      "On-prem / VPC deploy",
      "SSO + SCIM",
      "Custom Gemini quotas",
      "Dedicated CSM",
      "99.9% SLA",
    ],
    cta: "Contact sales",
    href: "/contact",
    surface: "desert-clay" as const,
  },
];

export default function PricingPage() {
  return (
    <>
      <NavBar />
      <main className="flex-1">
        <section className="page-container py-20 md:py-32 text-center">
          <FeatureTag variant="iron" className="mb-6">Pricing</FeatureTag>
          <h1 className="text-display font-bold max-w-3xl mx-auto">
            Free to start.
            <br />
            <span className="italic font-normal">Scales with you.</span>
          </h1>
          <p className="mt-6 text-body text-obsidian/70 max-w-2xl mx-auto">
            No per-run surprises. No token anxiety. Predictable pricing
            whether you run 10 or 10,000 workflows.
          </p>
        </section>

        <section className="page-container pb-24">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {plans.map((plan) => (
              <FeatureCard
                key={plan.name}
                surface={plan.surface}
                padding="lg"
                className={`flex flex-col ${plan.highlighted ? "ring-2 ring-obsidian" : ""}`}
              >
                {plan.highlighted && (
                  <FeatureTag variant="obsidian" className="mb-3 self-start">
                    Most popular
                  </FeatureTag>
                )}
                <h3 className="text-heading-sm font-bold mb-1">{plan.name}</h3>
                <p className="text-body-sm opacity-70 mb-5">{plan.description}</p>
                <div className="mb-6">
                  <span className="text-display-md font-bold tabular-nums">
                    {plan.price}
                  </span>
                  <span className="text-body-sm opacity-70">{plan.period}</span>
                </div>
                <ul className="space-y-2 mb-8 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="text-body-sm flex items-start gap-2">
                      <span className="opacity-60">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  variant={plan.highlighted ? "light" : "outline-light"}
                  size="md"
                  href={plan.href}
                  className="w-full"
                >
                  {plan.cta}
                </Button>
              </FeatureCard>
            ))}
          </div>
        </section>

        <section className="bg-bone">
          <div className="page-container py-20 text-center">
            <h2 className="text-display-md font-bold mb-12">Questions?</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left max-w-4xl mx-auto">
              {[
                { q: "What counts as a 'run'?", a: "Each time a skill executes once, regardless of how many sub-tasks it spawns." },
                { q: "Do I need a Google Cloud account?", a: "No — Echo manages the cloud infra for you. Just sign in and start recording." },
                { q: "Can I bring my own Gemini key?", a: "Yes, on the Team plan and above. BYO key gets you custom quotas." },
              ].map((f) => (
                <FeatureCard key={f.q} surface="paper-white" padding="md" className="hairline">
                  <h4 className="text-body font-bold mb-2">{f.q}</h4>
                  <p className="text-body-sm text-obsidian/70">{f.a}</p>
                </FeatureCard>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
