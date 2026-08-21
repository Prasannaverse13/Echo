import Link from "next/link";
import { Button, FeatureTag, FeatureCard, NavBar, Footer } from "@/components/ui";

export default function HomePage() {
  return (
    <>
      <NavBar />

      {/* Hero — full bleed editorial */}
      <section className="relative bg-deep-teal text-paper-white overflow-hidden">
        {/* Background cinematic gradient — desert hour feel without external imagery */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(ellipse at 30% 20%, #4c312b 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, #406e7a 0%, transparent 50%), linear-gradient(135deg, #0b252a 0%, #1a3539 100%)",
          }}
        />
        <div className="relative page-container section-gap">
          <div className="flex flex-col items-center text-center max-w-5xl mx-auto">
            <FeatureTag variant="slate-teal" className="mb-8">
              All Things Agentic Hackathon · 2026
            </FeatureTag>

            <h1 className="text-display-xl font-bold text-paper-white">
              Show it once.
              <br />
              <span className="italic font-normal">Run it forever.</span>
            </h1>

            <p className="mt-8 max-w-2xl text-body text-paper-white/80">
              Echo watches you do a workflow once, then re-runs it
              autonomously across thousands of inputs — in the background,
              while you do literally anything else. Built on Gemini and Google
              Cloud.
            </p>

            <div className="mt-12 flex flex-col sm:flex-row gap-4">
              <Button variant="dark" size="lg" href="/signup">
                Try Echo free →
              </Button>
              <Button variant="outline-dark" size="lg" href="/how-it-works">
                Watch demo
              </Button>
            </div>

            <div className="mt-20 grid grid-cols-3 gap-8 text-paper-white/70 max-w-2xl w-full">
              <div>
                <p className="text-display-md font-bold text-paper-white">2,847</p>
                <p className="text-caption mt-1">Skills learned today</p>
              </div>
              <div>
                <p className="text-display-md font-bold text-paper-white">41k</p>
                <p className="text-caption mt-1">Workflows running</p>
              </div>
              <div>
                <p className="text-display-md font-bold text-paper-white">98.4%</p>
                <p className="text-caption mt-1">Avg success rate</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section className="page-container section-gap">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <FeatureTag variant="iron" className="mb-6">
            The three pillars
          </FeatureTag>
          <h2 className="text-display font-bold text-obsidian">
            From screen to autonomous in three acts.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <FeatureCard surface="dusty-sky" padding="lg">
            <p className="text-caption opacity-60 mb-3">01 — Record</p>
            <h3 className="text-heading-sm font-bold mb-3">
              Watch me do it once.
            </h3>
            <p className="text-body-sm">
              Open the Echo recorder, perform your workflow on screen, and
              Gemini Vision reconstructs it as a structured, reusable skill —
              intent, steps, decisions, all of it.
            </p>
          </FeatureCard>

          <FeatureCard surface="wisteria" padding="lg">
            <p className="text-caption opacity-60 mb-3">02 — Compose</p>
            <h3 className="text-heading-sm font-bold mb-3">
              Skills that compose.
            </h3>
            <p className="text-body-sm">
              The Skill Manager watches your library grow, notices when 2+
              skills can combine into something bigger, and auto-spawns
              orchestrator sub-agents to run them in parallel.
            </p>
          </FeatureCard>

          <FeatureCard surface="desert-clay" padding="lg">
            <p className="text-caption opacity-60 mb-3">03 — Replay</p>
            <h3 className="text-heading-sm font-bold mb-3">
              Run forever, in the background.
            </h3>
            <p className="text-body-sm">
              Drop 10,000 inputs on Echo. It dispatches sub-agents across
              Cloud Run, streams progress via Pub/Sub, and pings you when done
              — or only when it needs you.
            </p>
          </FeatureCard>
        </div>
      </section>

      {/* Dark narrative band — capability tags */}
      <section className="bg-deep-teal text-paper-white">
        <div className="page-container py-24 md:py-32">
          <div className="text-center max-w-4xl mx-auto">
            <h2 className="text-display font-bold text-paper-white">
              One agent platform. Every workflow.
            </h2>
            <p className="mt-6 text-body text-paper-white/70 max-w-2xl mx-auto">
              Echo ships with the capabilities an autonomous agent needs to
              survive in the real world.
            </p>

            <div className="mt-12 flex flex-wrap justify-center gap-2">
              {[
                "Screen Vision",
                "Skill Library",
                "Sub-agent Orchestration",
                "Long-running Memory",
                "Background Workers",
                "Event Triggers",
                "Async Pipelines",
                "Self-healing",
                "Cost Aware",
                "Audit Trail",
                "Skill Marketplace",
                "API & Webhooks",
                "Schedule Triggers",
                "File Watching",
                "Slack Native",
                "Google Workspace",
                "Notion Sync",
                "GitHub Actions",
              ].map((tag) => (
                <FeatureTag key={tag} variant="slate-teal">
                  {tag}
                </FeatureTag>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How it works — editorial spread */}
      <section className="page-container section-gap">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <FeatureTag variant="iron" className="mb-6">
              The Taskmaster pattern
            </FeatureTag>
            <h2 className="text-display font-bold text-obsidian">
              Watch a move.
              <br />
              Replay the pattern.
            </h2>
            <p className="mt-6 text-body text-obsidian/70 max-w-md">
              Like Marvel's Taskmaster, Echo observes an action once, extracts
              the underlying style, and reproduces it perfectly — every time,
              at any scale. You bring the intent. Echo brings the execution.
            </p>
            <div className="mt-8 flex gap-4">
              <Button variant="light" size="md" href="/how-it-works">
                See the playbook
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FeatureCard surface="mist-mint" padding="md" className="aspect-square flex flex-col justify-between">
              <p className="text-caption opacity-60">Step 01</p>
              <h4 className="text-heading-sm font-bold">Record</h4>
            </FeatureCard>
            <FeatureCard surface="desert-clay" padding="md" className="aspect-square flex flex-col justify-between">
              <p className="text-caption opacity-60">Step 02</p>
              <h4 className="text-heading-sm font-bold">Learn</h4>
            </FeatureCard>
            <FeatureCard surface="wisteria" padding="md" className="aspect-square flex flex-col justify-between">
              <p className="text-caption opacity-60">Step 03</p>
              <h4 className="text-heading-sm font-bold">Compose</h4>
            </FeatureCard>
            <FeatureCard surface="dusty-sky" padding="md" className="aspect-square flex flex-col justify-between">
              <p className="text-caption opacity-60">Step 04</p>
              <h4 className="text-heading-sm font-bold">Replay</h4>
            </FeatureCard>
          </div>
        </div>
      </section>

      {/* Use cases — magazine grid */}
      <section className="bg-bone">
        <div className="page-container section-gap">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <FeatureTag variant="iron" className="mb-6">
              Built for real work
            </FeatureTag>
            <h2 className="text-display font-bold text-obsidian">
              Echo learns the workflows you hate.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FeatureCard surface="paper-white" padding="lg" className="hairline">
              <FeatureTag variant="iron" className="mb-4">Sales & RevOps</FeatureTag>
              <h3 className="text-heading-sm font-bold mb-3">
                Auto-respond to RFPs in minutes, not days.
              </h3>
              <p className="text-body-sm text-obsidian/70">
                Echo watches your team respond to one RFP, then drafts
                responses to new ones by pulling from your past wins,
                case studies, and pricing sheets.
              </p>
            </FeatureCard>

            <FeatureCard surface="paper-white" padding="lg" className="hairline">
              <FeatureTag variant="iron" className="mb-4">Operations</FeatureTag>
              <h3 className="text-heading-sm font-bold mb-3">
                Inbox triage that actually finishes the job.
              </h3>
              <p className="text-body-sm text-obsidian/70">
                Echo sorts, drafts replies, schedules meetings, and only
                surfaces what truly needs your eyes. Wake up to "Handled 47,
                need you on 3."
              </p>
            </FeatureCard>

            <FeatureCard surface="paper-white" padding="lg" className="hairline">
              <FeatureTag variant="iron" className="mb-4">Research</FeatureTag>
              <h3 className="text-heading-sm font-bold mb-3">
                Long-running research that builds on itself.
              </h3>
              <p className="text-body-sm text-obsidian/70">
                "Research X" starts a multi-day agent that gathers, organizes,
                and asks clarifying questions. You get the report when it's
                done — not a 47-tab browser session.
              </p>
            </FeatureCard>

            <FeatureCard surface="paper-white" padding="lg" className="hairline">
              <FeatureTag variant="iron" className="mb-4">Personal</FeatureTag>
              <h3 className="text-heading-sm font-bold mb-3">
                The chores you keep avoiding.
              </h3>
              <p className="text-body-sm text-obsidian/70">
                Receipt sorting, expense reports, file renaming, weekly
                digests. Show Echo once, and it handles the rest of the year
                while you're living your life.
              </p>
            </FeatureCard>
          </div>
        </div>
      </section>

      {/* CTA — final pitch */}
      <section className="bg-obsidian text-paper-white">
        <div className="page-container py-24 md:py-32 text-center">
          <h2 className="text-display font-bold text-paper-white max-w-3xl mx-auto">
            Stop repeating yourself.
            <br />
            <span className="italic font-normal">Start teaching.</span>
          </h2>
          <p className="mt-6 text-body text-paper-white/70 max-w-xl mx-auto">
            Free for the first 5 skills. No credit card. Spin up Echo in under
            a minute.
          </p>
          <div className="mt-12">
            <Button variant="dark" size="lg" href="/signup">
              Get started →
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
