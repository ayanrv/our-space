import {
  Flower2,
  ArrowUpRight,
  CalendarDays,
  Mail,
  Utensils,
  ShieldCheck,
} from "lucide-react";
export function Portfolio({ onExplore }: { onExplore: () => void }) {
  return (
    <main className="portfolio">
      <header className="portfolio-nav">
        <a className="brand" href="/">
          <span className="brand-mark">
            <Flower2 />
          </span>
          our space
        </a>
        <span className="eyebrow">Interactive project demo</span>
      </header>
      <section className="portfolio-hero">
        <div>
          <span className="eyebrow">A shared home for everyday plans</span>
          <h1>
            Less remembering.
            <br />
            More <em>together.</em>
          </h1>
          <p>
            A small planning app for two people living together. Shared
            routines, meals, getaways—and an invitation to make an ordinary
            evening a little special.
          </p>
          <button className="button primary" onClick={onExplore}>
            Step into the demo <ArrowUpRight size={18} />
          </button>
          <p className="small muted">
            Meet Alex & Sam, our fictional couple. No signup needed.
          </p>
        </div>
        <div
          className="portfolio-scene"
          aria-label="Illustrative sample date postcard"
        >
          <div className="scene-calendar">
            <CalendarDays />
            <span>Saturday</span>
            <strong>Room for us</strong>
            <span>19:00 · Dinner & a walk</span>
          </div>
          <div className="scene-letter">
            <span className="stamp">
              <Flower2 />
            </span>
            <span className="eyebrow">For Alex, from Sam</span>
            <h2>You pick the dessert.</h2>
            <p>
              I’ll find the table.
              <br />
              Let’s take our time getting home.
            </p>
            <span className="scene-heart">♡</span>
          </div>
        </div>
      </section>
      <section className="portfolio-story">
        <span className="eyebrow">The design problem</span>
        <h2>
          Most planning happens in conversation.
          <br />
          The app helps you remember what you decided.
        </h2>
        <p>
          Built around a shared household rather than two crowded personal
          calendars. Flexible chores leave room for changes; invitations and a
          mailbox keep the experience warm.
        </p>
      </section>
      <section className="portfolio-features">
        <article>
          <CalendarDays />
          <h3>Make room</h3>
          <p>
            A shared calendar, repeating routines, and plans you can move when
            life changes.
          </p>
        </article>
        <article>
          <Mail />
          <h3>Keep the spark</h3>
          <p>
            Recipient-only postcards, thoughtful surprises, and a little heart
            sent back.
          </p>
        </article>
        <article>
          <Utensils />
          <h3>Ease the everyday</h3>
          <p>
            Meals feed into groceries. Trips bring packing, costs, and ideas
            into one place.
          </p>
        </article>
      </section>
      <section className="portfolio-story">
        <ShieldCheck />
        <h2>Personal by design.</h2>
        <p>
          This demo uses fictional data stored only in your browser. It does not
          connect to the live household’s database or send email. You can switch
          between both people to explore how sharing works.
        </p>
        <p className="small muted">
          Built with React, TypeScript, Supabase and PostgreSQL. Responsive
          layouts, database access policies, and an opt-in reminder worker.
        </p>
        <button className="button" onClick={onExplore}>
          Try it yourself <ArrowUpRight size={18} />
        </button>
      </section>
      <footer className="app-footer">
        Our Space · A shared-life planning project
      </footer>
    </main>
  );
}
