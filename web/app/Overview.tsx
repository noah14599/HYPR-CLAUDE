"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Greeting } from "@/components/Greeting";
import { STOCKS, type Stock } from "@/lib/stocks";
import { RANGES, RANGE_TAG, statsFor, indexStrip, sectorStrip, type Range, type StripItem } from "@/lib/demo";
import { useWatchLists } from "@/lib/watchlists";
import s from "./overview.module.css";

const CUT = 6;

type Row = Stock & { sc: number; delta: number; chg: number; jump: number };

/** Score-move colour: green for big jumps, through yellow and orange, to red for big drops. */
function moveColor(d: number, forDelta = false) {
  if (d >= 10) return "var(--c-up2)";
  if (d >= 5) return "var(--c-up)";
  if (d >= 1) return "var(--c-lime)";
  if (d === 0) return forDelta ? "var(--c-tx4)" : "var(--c-tx3)";
  if (d >= -4) return "var(--c-yel2)";
  if (d >= -9) return "#fb923c";
  return "var(--c-dn2)";
}

const pct = (v: number) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2) + "%";
const signed = (v: number) => (v >= 0 ? "+" : "−") + Math.abs(v);

function useRange() {
  const [range, setRange] = useState<Range>("1M");
  const [pending, setPending] = useState<Range | null>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => {
    try { const v = localStorage.getItem("hypr:range") as Range; if (RANGES.includes(v)) setRange(v); } catch {}
    return () => timers.current.forEach(clearTimeout);
  }, []);
  // Cross-fade: dim the lists, swap the numbers at 170ms, then fade back in.
  const choose = (k: Range) => {
    if (k === range) return;
    try { localStorage.setItem("hypr:range", k); } catch {}
    timers.current.forEach(clearTimeout);
    setPending(k);
    timers.current = [window.setTimeout(() => {
      setRange(k);
      timers.current.push(window.setTimeout(() => setPending(null), 40));
    }, 170)];
  };
  return { range, selected: pending ?? range, swapping: pending !== null, choose };
}

export function Overview() {
  const { range, selected, swapping, choose } = useRange();
  const [lists] = useWatchLists();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setOpen(o => ({ ...o, [k]: !o[k] }));

  const data = useMemo(() => {
    const rows: Row[] = STOCKS.map(x => {
      const st = statsFor(x, range);
      return { ...x, sc: st.score, delta: st.score - st.prev, chg: st.chg, jump: st.jump };
    }).sort((a, b) => b.sc - a.sc);
    const watchTickers = [...new Set(lists.flatMap(l => l.tickers))];
    const watch = rows.filter(r => watchTickers.includes(r.t));
    const scoreOf = (t: string) => rows.find(r => r.t === t)?.sc ?? 0;
    const groups = lists.map(l => {
      const members = l.tickers.filter(t => rows.some(r => r.t === t));
      const avg = members.length ? Math.round(members.reduce((a, t) => a + scoreOf(t), 0) / members.length) : 0;
      return { ...l, score: members.length ? String(avg) : "—", count: members.length + (members.length === 1 ? " stock" : " stocks") };
    });
    return {
      top: rows.slice(0, 6),
      high: rows,
      low: [...rows].sort((a, b) => a.sc - b.sc),
      movers: [...rows].sort((a, b) => b.jump - a.jump || b.sc - a.sc).slice(0, 12),
      watch,
      groups,
      strong: watch.filter(r => r.sc >= 80).length,
      indices: indexStrip(range),
      sectors: sectorStrip(range),
    };
  }, [range, lists]);

  const swap = swapping ? s.swapping : "";

  return (
    <div className={s.col}>
      <div className={s.greet}>
        <Greeting className={s.greetName} dateClassName={s.greetDate} />
      </div>

      <div className={`${s.strips} ${s.fade} ${swapping ? s.swappingNoShift : ""}`}>
        <Strip title="MARKETS" href="/markets" items={data.indices} />
        <Strip title="SECTORS" href="/sectors" items={data.sectors} />
      </div>

      <div className={s.hyprRow}>
        <div className={s.hyprLeft}>
          <span role="img" aria-label="HYPR" className={s.hyprMark} />
          <span className={s.expl}>
            Scores, picks and rankings for <b>{RANGE_TAG[range]}</b> — everything below re-ranks with the timeframe.
          </span>
        </div>
        <div className={s.pills} role="tablist" aria-label="Timeframe">
          {RANGES.map(k => (
            <button key={k} type="button" role="tab" aria-selected={k === selected}
              className={`${s.pill} ${k === selected ? s.pillOn : ""}`} onClick={() => choose(k)}>{k}</button>
          ))}
        </div>
      </div>

      <div className={`${s.picks} ${s.fade} ${swap}`}>
        {data.top.map(r => (
          <Link key={r.t} href={`/stocks/${r.t}`} className={s.pick}>
            <span className={s.pickPill}>
              <RowLogo r={r} className={s.pickLogo} />
              <span className={s.pickT}>{r.t}</span>
            </span>
            <span className={s.pickCard}>
              <span data-title className={s.pickScore}>{r.sc}</span>
              <span className={s.pickLab}>HYPR SCORE</span>
            </span>
          </Link>
        ))}
      </div>

      <div className={`${s.g2} ${s.fade} ${swap}`}>
        <ListCard dot="var(--c-up)" title="Biggest movers" note="score jump" rows={data.movers} order={2}
          more={open.movers} onMore={() => toggle("movers")} moreLabel="See more biggest movers" />
        <ListCard dot="var(--c-acc)" title="Your watchlist" note={`${data.watch.length} tracked · ${data.strong} strong`} rows={data.watch} order={1}
          more={open.watch} onMore={() => toggle("watch")} moreLabel="See more from your watchlist" />
      </div>

      <div className={`${s.g2} ${s.g2b} ${s.fade} ${swap}`}>
        <ListCard dot="var(--c-dn)" title="Lowest rated" note="weakest scores" rows={data.low}
          more={open.low} onMore={() => toggle("low")} moreLabel="See more lowest rated" />
        <ListCard dot="var(--c-lime)" title="Highest rated" note="top scores" rows={data.high}
          more={open.high} onMore={() => toggle("high")} moreLabel="See more highest rated" />
      </div>

      <div>
        <div className={s.groupsHead}>
          <span data-title className={s.groupsTitle}>Watchlist groups</span>
          <span className={s.groupsSub}>{data.strong} of your stocks are moving on real news</span>
        </div>
        <div className={`${s.g3} ${s.fade} ${swap}`}>
          {data.groups.map(g => (
            <Link key={g.k} href="/watchlist" className={s.group} data-nav>
              <span style={{ minWidth: 0 }}>
                <span className={s.groupName}>
                  <span className={s.groupIcon}>{g.icon}</span>
                  <span data-title className={s.groupNameText}>{g.name}</span>
                </span>
                <span className={s.groupCount}>{g.count} · avg HYPR score</span>
              </span>
              <span className={s.groupChip}><span data-title className={s.groupScore}>{g.score}</span></span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function Strip({ title, href, items }: { title: string; href: string; items: StripItem[] }) {
  return (
    <div className={s.strip}>
      <Link href={href} className={s.stripLab} data-nav>{title}</Link>
      <div className={s.stripItems}>
        {items.map(it => {
          const col = it.chg >= 0 ? "var(--c-up)" : "var(--c-dn)";
          return (
            <Link key={it.key} href={it.href} className={s.stripItem} data-nav>
              <span className={s.stripText}>
                <span className={s.stripItemLab}>{it.label}</span>
                <span className={s.stripVals}>
                  <span className={s.stripVal}>{it.val}</span>
                  <span className={s.stripChg} style={{ color: col }}>{pct(it.chg)}</span>
                </span>
              </span>
              <svg viewBox="0 0 120 38" preserveAspectRatio="none" className={s.spark}>
                <path d={it.line} fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" stroke={col} />
              </svg>
            </Link>
          );
        })}
      </div>
      <Link href={href} className={s.stripAll} data-nav>All →</Link>
    </div>
  );
}

function RowLogo({ r, className }: { r: Stock; className: string }) {
  if (!r.logo) return <span className={className} style={{ background: "var(--c-tile)", color: r.color }}>{r.mark || r.t[0]}</span>;
  const size = r.fit === "cover" ? "cover" : "contain";
  return (
    <span className={className}>
      <span className={`${s.logoImg} ${r.logoLight ? s.darkOnly : ""}`} style={{ backgroundImage: `url(${r.logo})`, backgroundSize: size }} />
      {r.logoLight && <span className={`${s.logoImg} ${s.lightOnly}`} style={{ backgroundImage: `url(${r.logoLight})`, backgroundSize: "contain" }} />}
    </span>
  );
}

function ListCard({ dot, title, note, rows, order, more, onMore, moreLabel }: {
  dot: string; title: string; note: string; rows: Row[]; order?: number;
  more?: boolean; onMore: () => void; moreLabel: string;
}) {
  const shown = more ? rows : rows.slice(0, CUT);
  return (
    <section className={s.card} style={{ order }}>
      <div className={s.cardHead}>
        <span className={s.dot} style={{ background: dot }} />
        <span data-title className={s.cardTitle}>{title}</span>
        <span className={s.cardNote}>{note}</span>
        <span style={{ flex: 1 }} />
        <span className={s.colPrice}>PRICE</span>
        <span className={s.colScore}>HYPR</span>
      </div>
      {shown.map(r => (
        <Link key={r.t} href={`/stocks/${r.t}`} className={s.row} data-nav>
          <RowLogo r={r} className={s.rowLogo} />
          <span className={s.rowNames}>
            <span className={s.rowT}>{r.t}</span>
            <span className={s.rowName}>{r.name}</span>
          </span>
          <span className={s.rowPrice}>
            <span className={s.price}>${r.price.toFixed(2)}</span>
            <span className={s.small} style={{ color: r.chg >= 0 ? "var(--c-up)" : "var(--c-dn)" }}>{pct(r.chg)}</span>
          </span>
          <span className={s.rowScore}>
            <span data-title className={s.score} style={{ color: moveColor(r.delta) }}>{r.sc}</span>
            <span className={s.small} style={{ color: moveColor(r.delta, true) }}>{signed(r.delta)}</span>
          </span>
        </Link>
      ))}
      {rows.length > CUT && (
        <button type="button" className={s.more} data-pill onClick={onMore}>
          <span>{more ? "Show less" : moreLabel}</span><span>{more ? "↑" : "→"}</span>
        </button>
      )}
    </section>
  );
}
