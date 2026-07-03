import { useState } from "react";
import { useLocation } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE}/api`;

const FEATURES = [
  {
    icon: "💊",
    title: "Medication Organization",
    desc: "Track dosing windows, cycles, and schedules — never miss a critical medication event.",
  },
  {
    icon: "🔁",
    title: "Care Routines",
    desc: "Build repeating care tasks by time of day. Morning, midday, evening — all in one place.",
  },
  {
    icon: "🍽️",
    title: "Meal Planning",
    desc: "Plan meals, manage grocery lists, and track nutrition with AI-powered meal remixes.",
  },
  {
    icon: "📅",
    title: "Appointment Tracking",
    desc: "Keep upcoming appointments, specialist visits, and medical events organized.",
  },
  {
    icon: "🤝",
    title: "Family Handoffs",
    desc: "Coordinate shift changes across caregivers with shared notes and status updates.",
  },
  {
    icon: "🧠",
    title: "AI Care Summaries",
    desc: "Get weekly clinical-quality care summaries generated from your logs and routines.",
  },
  {
    icon: "📝",
    title: "Notes & Daily Logs",
    desc: "Capture behavioral observations, symptoms, and care notes in a searchable log.",
  },
  {
    icon: "📁",
    title: "Documents & Emergency Info",
    desc: "Store medication lists, insurance cards, and emergency contacts — always accessible.",
  },
];

const PLANS = [
  {
    id: "family",
    name: "Family Plan",
    price: 19,
    period: "mo",
    tagline: "One loved one, one caregiver team.",
    features: [
      "1 care workspace",
      "Up to 5 family members",
      "Full AI care summaries",
      "Medication & routine tracking",
      "Meal planning + grocery lists",
      "14-day free trial",
    ],
    cta: "Start Free Trial",
    highlight: false,
  },
  {
    id: "multi_care",
    name: "Multi-Care Plan",
    price: 39,
    period: "mo",
    tagline: "Managing care for multiple people.",
    features: [
      "Up to 3 care workspaces",
      "Unlimited family members",
      "Priority AI processing",
      "Advanced care analytics",
      "Dedicated support",
      "14-day free trial",
    ],
    cta: "Start Free Trial",
    highlight: true,
  },
];

function PricingCard({
  plan,
  onSelect,
  loading,
}: {
  plan: (typeof PLANS)[0];
  onSelect: (planId: string) => void;
  loading: string | null;
}) {
  return (
    <div
      className={`relative rounded-xl border p-8 flex flex-col gap-5 transition-all ${
        plan.highlight
          ? "border-emerald-500 bg-emerald-950/40 shadow-[0_0_40px_rgba(16,185,129,0.15)]"
          : "border-zinc-700 bg-zinc-900/60"
      }`}
    >
      {plan.highlight && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-black text-xs font-bold px-4 py-1 rounded-full tracking-wider uppercase">
          Most Popular
        </div>
      )}
      <div>
        <h3 className="text-xl font-bold text-white">{plan.name}</h3>
        <p className="text-sm text-zinc-400 mt-1">{plan.tagline}</p>
      </div>
      <div className="flex items-end gap-1">
        <span className="text-5xl font-black text-white">${plan.price}</span>
        <span className="text-zinc-400 mb-2">/{plan.period}</span>
      </div>
      <ul className="flex flex-col gap-2 flex-1">
        {plan.features.map((f) => (
          <li key={f} className="flex items-center gap-2 text-sm text-zinc-300">
            <span className="text-emerald-400">✓</span>
            {f}
          </li>
        ))}
      </ul>
      <button
        onClick={() => onSelect(plan.id)}
        disabled={loading !== null}
        className={`w-full py-3 rounded-lg font-bold text-sm uppercase tracking-wider transition-all disabled:opacity-50 ${
          plan.highlight
            ? "bg-emerald-500 hover:bg-emerald-400 text-black"
            : "bg-zinc-700 hover:bg-zinc-600 text-white"
        }`}
      >
        {loading === plan.id ? "Redirecting…" : plan.cta}
      </button>
    </div>
  );
}

export function GuardianPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [showEmailForm, setShowEmailForm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, navigate] = useLocation();

  const startCheckout = async (planId: string) => {
    if (!email.trim() || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    setLoading(planId);
    setError(null);
    try {
      const res = await fetch(`${API}/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId, email }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Checkout failed. Please try again.");
      }
      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-black tracking-tight text-emerald-400">
            br(AI)n
          </span>
          <span className="text-zinc-500 text-sm font-medium">Guardian</span>
        </div>
        <button
          onClick={() => navigate("/")}
          className="text-sm text-zinc-400 hover:text-white transition-colors"
        >
          Sign In →
        </button>
      </header>

      <section className="max-w-4xl mx-auto px-6 py-24 text-center space-y-6">
        <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-4 py-2 text-emerald-400 text-sm font-medium">
          🛡️ Brain Guardian by br(AI)n
        </div>
        <h1 className="text-5xl md:text-6xl font-black leading-tight">
          A private AI care workspace
          <br />
          <span className="text-emerald-400">for families managing real-life care.</span>
        </h1>
        <p className="text-xl text-zinc-400 max-w-2xl mx-auto">
          Medication routines. Meal planning. Appointments. Caregiver handoffs.
          AI summaries. Everything a care family needs — private, organized, and
          always accessible.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
          <button
            onClick={() => {
              document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
            }}
            className="px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-lg text-lg transition-all"
          >
            Start Free Trial — 14 Days Free
          </button>
          <button
            onClick={() => {
              document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
            }}
            className="px-8 py-4 bg-zinc-800 hover:bg-zinc-700 text-white font-medium rounded-lg text-lg transition-all"
          >
            See What's Included
          </button>
        </div>
        <p className="text-sm text-zinc-500">
          No credit card required to start. Cancel anytime.
        </p>
      </section>

      <section id="features" className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold text-center mb-4">
          Everything your care team needs
        </h2>
        <p className="text-center text-zinc-400 mb-12 max-w-xl mx-auto">
          Built for the complexity of real-life care — not just simple reminders.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-3 hover:border-zinc-700 transition-colors"
            >
              <div className="text-3xl">{f.icon}</div>
              <h3 className="font-bold text-white">{f.title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="max-w-5xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold text-center mb-4">
          Simple, transparent pricing
        </h2>
        <p className="text-center text-zinc-400 mb-12 max-w-xl mx-auto">
          14-day free trial. No credit card required to start. Cancel anytime
          with one click.
        </p>

        {showEmailForm ? (
          <div className="max-w-md mx-auto bg-zinc-900 border border-zinc-700 rounded-xl p-8 space-y-4">
            <h3 className="font-bold text-lg text-white">Enter your email to continue</h3>
            <p className="text-sm text-zinc-400">
              We'll use this to set up your care workspace after checkout.
            </p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              onKeyDown={(e) => e.key === "Enter" && startCheckout(showEmailForm)}
              autoFocus
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex gap-3">
              <button
                onClick={() => { setShowEmailForm(null); setError(null); }}
                className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg font-medium transition-all"
              >
                Back
              </button>
              <button
                onClick={() => startCheckout(showEmailForm)}
                disabled={loading !== null}
                className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-lg transition-all disabled:opacity-50"
              >
                {loading ? "Redirecting…" : "Continue to Checkout"}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {PLANS.map((plan) => (
              <PricingCard
                key={plan.id}
                plan={plan}
                loading={loading}
                onSelect={(id) => setShowEmailForm(id)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="max-w-3xl mx-auto px-6 py-16 text-center">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 space-y-4">
          <h2 className="text-2xl font-bold">Ready to bring order to care?</h2>
          <p className="text-zinc-400">
            Join families using Brain Guardian to coordinate care with less
            stress, more clarity, and AI-powered support.
          </p>
          <button
            onClick={() => {
              document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
            }}
            className="px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-lg text-lg transition-all"
          >
            Start Your Free Trial
          </button>
        </div>
      </section>

      <footer className="border-t border-zinc-800 py-10 px-6 text-center text-zinc-500 text-sm space-y-2">
        <p className="font-bold text-zinc-400">Brain Guardian by br(AI)n</p>
        <p>
          Built for family care coordination. Not a medical device. Not medical
          advice.
        </p>
        <p>
          Your care workspace is private and encrypted. We never sell your
          family's data.
        </p>
        <p className="mt-4 text-zinc-600">
          © {new Date().getFullYear()} br(AI)n · Unconditional Software
        </p>
      </footer>
    </div>
  );
}
