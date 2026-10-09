import Link from "next/link";
import type { Stock } from "@/lib/stocks";
import { scoreColor } from "@/lib/score";
import s from "./StockRow.module.css";

export function Logo({ stock, size = 34 }: { stock: Stock; size?: number }) {
  return (
    <span className={s.tile} style={{ width: size, height: size }}>
      {stock.logo ? (
        <>
          <span className={`${s.img} ${stock.logoLight ? s.darkOnly : ""}`} style={{ backgroundImage: `url(${stock.logo})`, backgroundSize: stock.fit === "cover" ? "cover" : "contain" }} />
          {stock.logoLight && <span className={`${s.img} ${s.lightOnly}`} style={{ backgroundImage: `url(${stock.logoLight})` }} />}
        </>
      ) : (
        <span className={s.mark} style={{ color: stock.color }}>{stock.mark || stock.t[0]}</span>
      )}
    </span>
  );
}

export function StockRow({ stock }: { stock: Stock }) {
  return (
    <Link href={`/stocks/${stock.t}`} className={s.row} data-nav>
      <Logo stock={stock} />
      <span className={s.names}>
        <span data-title className={s.ticker}>{stock.t}</span>
        <span className={s.name}>{stock.name}</span>
      </span>
      <span className={s.price}>${stock.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      <span className={s.score} style={{ color: scoreColor(stock.score) }}>{stock.score}</span>
    </Link>
  );
}
