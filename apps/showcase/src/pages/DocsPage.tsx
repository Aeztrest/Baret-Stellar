/** Docs index — Baret light theme. */

import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowUpRight, BookOpen, Shield, FileText, Zap, Layers, Globe,
} from "lucide-react";
import { LandingHeader, LandingFooter } from "../components/LandingChrome";

const DOCS = [
  { title: "Vision",                 desc: "Why a transaction firewall belongs in the wallet, not the dApp.",      file: "vision.md",                 icon: BookOpen },
  { title: "Wallet Spec",            desc: "Smart wallet primitives, key handling, session model.",                file: "wallet-spec.md",            icon: Shield },
  { title: "Extension Architecture", desc: "MV3 background, popup, options, inpage and content-script split.",     file: "extension-architecture.md", icon: Layers },
  { title: "Policy DSL",             desc: "The TypeScript policy schema and templates enforced at sign-time.",    file: "policy-dsl.md",             icon: FileText },
  { title: "x402 Defense",           desc: "The attack matrix and Baret's response for the x402 era.",             file: "x402-defense.md",           icon: Zap },
  { title: "Brand",                  desc: "Tokens, typography, and the way Baret talks to users.",                file: "brand.md",                  icon: Globe },
  { title: "Showcase Briefs",        desc: "How each fake-but-real demo dApp is wired and what it teaches.",       file: "showcase-briefs.md",        icon: BookOpen },
  { title: "Demo Script",            desc: "The end-to-end walkthrough used for live demos.",                      file: "demo-script.md",            icon: FileText },
];

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-paper text-ink-900">
      <LandingHeader cta={{ label: "Try the demo", to: "/showcase" }} />

      <main className="max-w-5xl mx-auto px-6 pt-36 pb-24">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] font-bold text-brand-600">
            <span className="w-6 h-[3px] hazard rounded-full" />
            Documentation
          </p>
          <h1 className="mt-4 font-display text-5xl md:text-6xl font-bold tracking-tight leading-[1.04]">
            How Baret<br />works, in detail.
          </h1>
          <p className="mt-6 text-ink-500 leading-relaxed max-w-2xl">
            Specs, protocols, and design notes that back every claim on the home page.
            Each entry below maps to a file in the project's <code className="font-mono text-ink-700 bg-ink-900/5 px-1.5 py-0.5 rounded">docs/</code> tree.
          </p>
        </motion.div>

        <div className="mt-12 grid sm:grid-cols-2 gap-3">
          {DOCS.map((d, i) => (
            <motion.a
              key={d.file}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              href={`https://github.com/Aeztrest/DeltaProtokol/blob/main/docs/${d.file}`}
              target="_blank"
              rel="noreferrer"
              className="group card-hover block p-5"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 grid place-items-center rounded-xl bg-ink-900 text-brand-400">
                    <d.icon size={16} />
                  </span>
                  <div>
                    <p className="font-display font-bold">{d.title}</p>
                    <p className="text-[11px] font-mono text-ink-400 mt-0.5">docs/{d.file}</p>
                  </div>
                </div>
                <ArrowUpRight size={16} className="text-ink-300 group-hover:text-brand-500 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-all" />
              </div>
              <p className="mt-4 text-sm text-ink-500 leading-relaxed">{d.desc}</p>
            </motion.a>
          ))}
        </div>

        <div className="mt-16 card p-8 text-center bg-bone">
          <p className="font-display text-xl font-bold">Prefer to see it running?</p>
          <p className="mt-2 text-ink-500 max-w-md mx-auto">
            The showcase puts every layer of the wallet through its paces in your browser.
          </p>
          <Link to="/" className="btn-brand mt-6 !px-5 !py-2.5">
            Open the showcase <ArrowUpRight size={14} />
          </Link>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
