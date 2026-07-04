# Baret. Positioning and Vision

This is the source of truth for how Baret talks about itself. Every headline,
button, tooltip, error string, and doc should sound like it came from this
document. If a sentence could have been written by any wallet, rewrite it.

---

## What Baret is, in one line

Baret is the Stellar wallet that reads a transaction before you sign it, tells
you what it actually does, and refuses the dangerous ones.

## What we sell (the product, said plainly)

A browser wallet for Stellar. It does the normal wallet things: hold keys, send,
receive, connect to apps. The difference is what happens the moment you hit
sign. Baret decodes the transaction, runs it through a simulation, checks it
against your rules, and shows you a verdict in one sentence. Safe, caution, or
blocked. You decide with your eyes open.

It also does one thing no other Stellar wallet does yet. When an AI agent pays
for something over x402, Baret puts a cap on it. Per site, per hour, per day.
Those caps are real. They live in the wallet, and they live on the ledger in a
Soroban contract, so a leaked key drains a budget instead of an account.

## The problem we exist for

Today every wallet signs whatever the app puts in front of it. You get a
contract address and a Confirm button, and the chain decides the rest. There is
no step where anyone reads the transaction on your behalf. Drainers, unlimited
approvals, and look-alike tokens all pass through the same one-click flow.

Agent payments make it worse. An agent can re-sign micro-payments all day. No
spend cap, no audit, no way to say "not more than a dollar." That surface is
live on Stellar right now, and nothing guards it.

Baret is the missing step. It is a firewall for your signature.

## Positioning statement

For Stellar users and the developers building agents that pay, Baret is a smart
wallet with a transaction firewall. It reads and explains every transaction
before you sign, keeps a running ledger of what each site is allowed to spend,
and enforces those limits on-chain. Other wallets ask you to trust the app.
Baret checks the app.

## Who it is for

- People who have signed something they regretted, or expect they might.
- Developers wiring up agents that spend real money and want a hard ceiling.
- Teams that need spend controls they can point to, not a promise.
- Anyone who wants to know what a transaction does before it happens.

## Vision

Signing should be an informed act. Networks have firewalls. Browsers warn you
before a bad download. Wallets are the last place where you still click Confirm
blind. We want the pre-sign check to be the default, not a feature. Start with
the surface everyone forgot, agent payments, and work outward until reading the
transaction first is just how wallets work.

## The three things Baret does (say them in this order)

1. It reads the transaction. Server-side simulation plus a set of detectors, run
   on the unsigned transaction. The result is a plain sentence, not a hex dump.
2. It keeps a ledger. Every approval is a row with a cap and a clock. One tap to
   pause or revoke. No more "unlimited approval" you forgot about.
3. It holds the line for agents. x402 payments get per-site limits, enforced at
   sign time and again on-chain by the PaymentGuard contract.

---

## Voice and tone

Write like an engineer who has been burned and wants to save you the trouble.
Plain, direct, a little opinionated. Confident without selling.

Rules, in order of how often they get broken:

1. No em dashes. Not one. If you reach for a dash, use a period, a comma, or two
   sentences. Keep hyphens only inside real compound words like on-chain or
   pre-sign, and even then, prefer a plainer phrasing when one exists.
2. One idea per sentence. Short beats clever.
3. Name the thing. "A cap of one dollar a day" beats "granular spend controls."
4. Second person. Talk to the user. "Before your keys sign," not "before keys
   are used."
5. Active voice. "Baret blocks it," not "it is blocked."
6. No hype words. Ban seamless, revolutionary, unlock, empower, leverage,
   robust, cutting-edge, next-generation, effortless, game-changing.
7. No filler openers. Never start with "In a world where" or "Today, more than
   ever." Get to the point.
8. Skip the triads and the "not just X, it's Y" shape. They read as generated.
9. Contractions are welcome. It's, you're, we've.
10. Say the honest thing. If it is testnet, say testnet. If it can be bypassed,
    say how.

Words we like: sign, verdict, cap, block, read, ledger, firewall, testnet,
on-chain, before, refuse, allow.

Words we avoid: solution, ecosystem (as filler), synergy, empower, seamless,
unlock, journey, revolutionary.

---

## Messaging by surface

### Home hero
Lead with the promise, not the category. Something like "See the transaction
before you sign it." The subhead names the mechanism in one breath: decode,
simulate, block. Keep it to two short lines.

### Hub and demos
These prove the claim. The frame is simple. Six apps that look real, each hiding
a different attack. Connect, click, watch Baret catch it. No adjectives, just
the scenario and what it catches.

### The x402 section
This is the wedge. Say it straight. x402 is a stateless payment protocol. It has
no spend cap by design. Baret adds the cap. Do not overclaim. We are a layer on
top, not the protocol.

### Install
Practical and calm. Which browser, which button, what you will see. No
celebration copy.

### Extension (popup and options)
This is where trust is won or lost, so it is the most human. Short labels.
Honest states. When Baret blocks something, the copy explains why in one line a
normal person understands. Empty states say what will show up here and why it
matters. Errors say what happened and what to do next. Never blame the user.

### Demo dApp sites
These are pretend third-party apps, so they should sound like real products in
their own category, not like Baret. Confident startup copy for a DEX, an NFT
mint, a staking app, an airdrop, a launchpad, an oracle. The point is that they
look trustworthy right up until Baret reads the transaction.

---

## The one-paragraph pitch (memorize this)

Every wallet signs whatever the app shows you. Baret reads it first. It decodes
the transaction, simulates what it will do, and gives you a verdict before your
keys ever move. It keeps a running cap on what each site can spend, and for the
AI agents paying over x402 it enforces that cap on-chain. Safe, caution, or
blocked. You sign knowing exactly what happens next.
