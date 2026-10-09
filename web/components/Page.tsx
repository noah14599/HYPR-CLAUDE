import s from "./Page.module.css";

export function Page({ title, sub, children }: { title: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className={s.page}>
      <header className={s.head}>
        <span data-title className={s.title}>{title}</span>
        {sub && <span className={s.sub}>{sub}</span>}
      </header>
      {children}
    </div>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <section className={s.card} style={style}>{children}</section>;
}

/** Placeholder for a screen that a later quest rebuilds. */
export function ComingSoon({ what, quest }: { what: string; quest: string }) {
  return (
    <Card>
      <div className={s.eyebrow}>Coming in {quest}</div>
      <h2 data-title className={s.soonTitle}>{what}</h2>
      <p className={s.soonText}>
        This screen is being rebuilt from the design. Until then, the original prototype is still live at hyprai.netlify.app.
      </p>
    </Card>
  );
}
