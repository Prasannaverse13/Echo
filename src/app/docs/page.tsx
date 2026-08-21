import { NavBar, Footer, FeatureTag, FeatureCard, Button } from "@/components/ui";

const sections = [
  { title: "Getting Started", items: ["Quickstart", "Record your first skill", "Run a skill", "Connect an integration"] },
  { title: "Skills", items: ["Skill anatomy", "Versioning", "Sharing", "Marketplace"] },
  { title: "Agents", items: ["Sub-agents", "Composition", "Schedules", "Triggers"] },
  { title: "API", items: ["Authentication", "REST reference", "Webhooks", "SDKs"] },
];

export default function DocsPage() {
  return (
    <>
      <NavBar />
      <main className="flex-1">
        <section className="page-container py-20 text-center">
          <FeatureTag variant="iron" className="mb-6">Docs</FeatureTag>
          <h1 className="text-display font-bold max-w-3xl mx-auto">
            Everything you need to ship.
          </h1>
          <p className="mt-4 text-body text-obsidian/70 max-w-2xl mx-auto">
            Guides, references, and recipes for building with Echo.
          </p>
        </section>

        <section className="page-container pb-24">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {sections.map((s) => (
              <FeatureCard key={s.title} surface="paper-white" padding="lg" className="hairline">
                <h3 className="text-heading-sm font-bold mb-4">{s.title}</h3>
                <ul className="space-y-2">
                  {s.items.map((i) => (
                    <li key={i}>
                      <a href="#" className="text-body-sm text-obsidian hover:underline underline-offset-4">
                        {i}
                      </a>
                    </li>
                  ))}
                </ul>
              </FeatureCard>
            ))}
          </div>
        </section>

        <section className="bg-deep-teal text-paper-white">
          <div className="page-container py-20 text-center">
            <h2 className="text-display font-bold max-w-3xl mx-auto">
              Need help?
            </h2>
            <p className="mt-4 text-body text-paper-white/70">
              Ping us on Slack or open an issue on GitHub.
            </p>
            <div className="mt-8 flex gap-3 justify-center">
              <Button variant="dark" size="md">Join community</Button>
              <Button variant="outline-dark" size="md">GitHub</Button>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
