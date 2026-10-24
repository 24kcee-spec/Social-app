import type { Metadata } from "next";
import { Community } from "../community";

export const metadata: Metadata = {
  title: "Plans & communities",
  description: "Turn Sidle connections into small, intentional plans, groups and campus activities.",
};

export default function PlansPage() {
  return (
    <main id="main" tabIndex={-1} className="sidle-public-page sidle-plans-route">
      <header className="sidle-plans-hero">
        <div>
          <span className="eyebrow">SIDLE · DO SOMETHING TOGETHER</span>
          <h1>Plans & communities</h1>
          <p className="muted">
            Turn a connection into something real: a study session, game, sport, coffee or small campus meetup. Plans use general areas rather than publishing private addresses.
          </p>
        </div>
        <a className="secondary compact" href="/discover">Find people</a>
      </header>
      <Community />
    </main>
  );
}
