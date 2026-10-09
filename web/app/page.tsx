import { Card } from "@/components/Page";
import { Greeting } from "@/components/Greeting";
import { StockRow } from "@/components/StockRow";
import { STOCKS } from "@/lib/stocks";
import p from "@/components/Page.module.css";
import s from "./overview.module.css";

export default function OverviewPage() {
  const byScore = [...STOCKS].sort((a, b) => b.score - a.score);
  const highest = byScore.slice(0, 6);
  const lowest = byScore.slice(-6).reverse();

  return (
    <div className={p.page}>
      <header className={p.head}>
        <Greeting name="Noah" />
      </header>
      <div className={s.grid}>
        <Card>
          <div className={s.cardHead}><span className={s.dotUp} /><span data-title className={s.cardTitle}>Highest rated</span><span className={s.cardSub}>top scores</span></div>
          {highest.map(st => <StockRow key={st.t} stock={st} />)}
        </Card>
        <Card>
          <div className={s.cardHead}><span className={s.dotDn} /><span data-title className={s.cardTitle}>Lowest rated</span><span className={s.cardSub}>weakest scores</span></div>
          {lowest.map(st => <StockRow key={st.t} stock={st} />)}
        </Card>
      </div>
    </div>
  );
}
