# The post

This is the write-up to publish. Suggested home: a self-post on **r/algotrading**,
**r/solana**, or **r/SolanaMemeCoins**, plus a cross-post linking to the full
report at **report.cogdb.xyz**.

The live report page has a Reddit-link placeholder in `index.html`:
`REDDIT_URL = "https://www.reddit.com/REPLACE_WITH_YOUR_POST_LINK"`. After you
create the Reddit thread, paste its URL there so the site links back to the
discussion.

---

## Title options (pick one)

1. I built a pump.fun trading bot, ran it on live data, and killed it. Here is the data on why.
2. Why a stop-loss cannot work on pump.fun coins, with the on-chain fills to prove it.
3. 93 trades, 31% win rate, negative expectancy: a pump.fun bot post-mortem (no edge, and here is the structural reason).

---

## Body

I spent a couple of weeks building a complete automated trading bot for pump.fun
memecoins, ran it on live data in paper mode, and then shut it down on purpose.
No real money was ever traded. I am posting the full result because the negative
finding is more useful than another "I made 10x" thread, and because the reason
it fails is structural, not a tuning problem.

**Full report with charts and the raw data:** [report.cogdb.xyz](https://report.cogdb.xyz)

### The setup
A decoupled pipeline: live ingestion (PumpPortal) → a free local pre-filter → paid
on-chain enrichment (Helius) → an LLM BUY/SKIP decision → a hard risk gate →
mechanical exits → paper execution → a live dashboard. Around 330 tests. Live
trading was hard-gated off the entire time.

### The one thing that clearly worked
pump.fun launches about 28 tokens a minute. A free pre-filter built from a local
trade ring-buffer rejected over 99% of them before any paid API call. If you build
in this space, this part is non-negotiable. It is the difference between a viable
cost structure and burning money on enrichment calls.

### The trading result
Two configurations, 93 trades total.

- Config A (enter at 20 min, -35% stop): 38 trades, 26.3% win, -0.101 SOL, expectancy -0.0027/trade.
- Config B (enter at 4 min, -18% stop): 55 trades, 34.5% win, -0.209 SOL, expectancy -0.0038/trade.

Earlier entry raised the win rate and lost MORE money. Both configs were net
negative.

### The structural reason (the actual point)
I logged the exact on-chain price path for every trade. Here is the killer: the
hard stop was set at -18%, but the **median actual fill was -84%.**

These coins do not slide through a stop. When they rug, the price gaps from above
-18% straight to -80% or worse in a single tick. There is no liquidity at the stop
price to sell into, so your "stop" fills wherever the next trade prints, which is
the bottom. A tighter stop does not help, because there is nothing to fill against.
Out of 17 hard stops, most filled between -74% and -91%.

I also backtested the three most common "fixes":
- Tighten the entry filter: winners and losers were statistically indistinguishable on every feature I captured.
- Tighter stop: best case cut the loss ~37%, never positive, hinged on a single trade.
- Take-profit ladder / moonbag: marginally worse. Only 2 of 55 trades reached 3x, none reached 5x. There was no fat tail to ride.

All three missed the point. The loss driver is fill quality on dumps, which is a
property of the asset, not a setting.

### A $12 security lesson
I generated the trading wallet with the service's "generate wallet" button. That
means the service generated and held the private key. It was being drained from
the first hour, a small amount to one address every ~72 minutes, automated, for 9
days. Native SOL only moves with the private key, so a "click to generate" wallet
is never really yours. Generate your own keypair offline, on a clean device. Cost
of the lesson: $12. Cost if I had funded it for live trading: a lot more.

### Takeaways
1. Build the free pre-filter first.
2. Test fills, not triggers. On an illiquid asset a stop-loss is a label.
3. The edge is not in the exit. If one exists, it is upstream.
4. Pre-commit to a kill rule and honor the negative result.
5. Self-custody, always.

Happy to answer questions or share more of the data. The raw CSVs (positions,
decisions, on-chain price paths) are linked on the report page.

*Caveats: 93 trades over ~9 days, one market regime. The structural finding is
robust; the exact P&L numbers are directional. Paper fills used real tick prices
but did not model my own market impact, so live would likely be worse. Not
financial advice.*
