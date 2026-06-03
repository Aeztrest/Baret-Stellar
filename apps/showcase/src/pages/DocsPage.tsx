import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, ArrowUpRight, BookOpen, Shield, FileText, Zap, Layers, Globe,
} from "lucide-react";

const DOCS = [
  { title: "Vision",             desc: "Why a transaction firewall belongs in the wallet, not the dApp.",        file: "vision.md",                icon: BookOpen },
  { title: "Wallet Spec",        desc: "Smart wallet primitives, key handling, session model.",                  file: "wallet-spec.md",           icon: Shield },
  { title: "Extension Architecture", desc: "MV3 background, popup, options, inpage and content-script split.",   file: "extension-architecture.md", icon: Layers },
  { title: "Policy DSL",         desc: "The TypeScript policy schema and templates enforced at sign-time.",      file: "policy-dsl.md",            icon: FileText },
  { title: "x402 Defense",       desc: "The attack matrix and BLACKTHORN's response for the x402 era.",          file: "x402-defense.md",          icon: Zap },
  { title: "Brand",              desc: "Tokens, typography, and the way BLACKTHORN talks to users.",             file: "brand.md",                 icon: Globe },
  { title: "Showcase Briefs",    desc: "How each fake-but-real demo dApp is wired and what it teaches.",         file: "showcase-briefs.md",       icon: BookOpen },
  { title: "Demo Script",        desc: "The end-to-end walkthrough used for live demos.",                        file: "demo-script.md",           icon: FileText },
];

export default function DocsPage() {
  return (
    <div className="min-h-screen text-white" style={{ background: "#000" }}>
      {/* Header */}
      <header className="fixed top-0 inset-x-0 z-50 border-b border-white/6 bg-black/70 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/home" className="flex items-center gap-2.5 group">
            <span className="w-8 h-8 grid place-items-center rounded-lg border border-white/15 bg-white/5">
              <Shield size={14} strokeWidth={2.4} />
            </span>
            <span className="font-black tracking-[0.18em] text-sm">BLACKTHORN</span>
            <span className="hidden sm:inline text-white/30 text-xs">/ Docs</span>
          </Link>
          <Link
            to="/home"
            className="inline-flex items-center gap-1.5 text-xs text-white/55 hover:text-white px-3 py-1.5 rounded-md hover:bg-white/[0.04]"
          >
            <ArrowLeft size={12} /> Home
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 pt-32 pb-24">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <p className="text-[11px] uppercase tracking-[0.22em] font-bold text-white/45">Documentation</p>
          <h1 className="mt-4 text-5xl md:text-6xl font-black tracking-tight leading-[1.02]">
            How BLACKTHORN<br />works, in detail.
          </h1>
          <p className="mt-6 text-white/55 leading-relaxed max-w-2xl">
            Specs, protocols, and design notes that back every claim on the home page.
            Each entry below maps to a file in the project's <code className="font-mono text-white/70">docs/</code> tree.
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
              className="group block rounded-2xl p-5 border border-white/8 hover:border-white/22 transition-all"
              style={{ background: "linear-gradient(180deg,#0a0a0a,#060606)" }}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 grid place-items-center rounded-xl border border-white/10 bg-white/5">
                    <d.icon size={16} />
                  </span>
                  <div>
                    <p className="font-bold">{d.title}</p>
                    <p className="text-[11px] font-mono text-white/35 mt-0.5">docs/{d.file}</p>
                  </div>
                </div>
                <ArrowUpRight size={16} className="text-white/30 group-hover:text-white group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-all" />
              </div>
              <p className="mt-4 text-sm text-white/55 leading-relaxed">{d.desc}</p>
            </motion.a>
          ))}
        </div>

        <div className="mt-16 rounded-2xl border border-white/8 p-8 text-center" style={{ background: "linear-gradient(180deg,#0a0a0a,#050505)" }}>
          <p className="text-xl font-bold">Prefer to see it running?</p>
          <p className="mt-2 text-white/50 max-w-md mx-auto">
            The showcase puts every layer of the wallet through its paces in your browser.
          </p>
          <Link
            to="/"
            className="mt-6 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-bold bg-white text-black hover:bg-white/90 transition"
          >
            Open the showcase <ArrowUpRight size={14} />
          </Link>
        </div>
      </main>
    </div>
  );
}
