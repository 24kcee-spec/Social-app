'use client';
import { useRef, useState } from 'react';
import type { SearchResults } from '@sp/profile-client';
import { PlatformShell } from '../platform-shell';
import { getPlatformClient } from '../../lib/platform';
import { errorMessage } from '../../lib/auth';
export default function SearchPage() {
  return (
    <PlatformShell
      title="Search Sidle"
      description="Find eligible people, communities and upcoming Plans."
    >
      <Search />
    </PlatformShell>
  );
}
function Search() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);
  return (
    <section>
      <form
        className="card-actions"
        onSubmit={async (event) => {
          event.preventDefault();
          const version = ++latest.current;
          setBusy(true);
          setError(null);
          try {
            const data = await getPlatformClient().search(query);
            if (version === latest.current) setResults(data);
          } catch (err) {
            if (version === latest.current) setError(errorMessage(err));
          } finally {
            if (version === latest.current) setBusy(false);
          }
        }}
      >
        <label className="sidle-sr-only" htmlFor="platform-search">
          Search people, groups and Plans
        </label>
        <input
          id="platform-search"
          type="search"
          value={query}
          minLength={2}
          maxLength={100}
          required
          placeholder="People, groups or Plans…"
          onChange={(event) => setQuery(event.target.value)}
        />
        <button disabled={busy || query.trim().length < 2}>{busy ? 'Searching…' : 'Search'}</button>
      </form>
      {error && (
        <p role="alert" className="notice err">
          {error}
        </p>
      )}
      {results && (
        <div className="search-results">
          <section className="settings-panel">
            <h2>People</h2>
            {results.people.length ? (
              results.people.map((person) => (
                <a className="search-result" key={person.userId} href={`/u/${person.userId}`}>
                  <strong>{person.name}</strong>
                  <p>{person.bio}</p>
                </a>
              ))
            ) : (
              <p>No eligible people match.</p>
            )}
          </section>
          <section className="settings-panel">
            <h2>Communities</h2>
            {results.groups.length ? (
              results.groups.map((group) => (
                <a className="search-result" key={group.id} href={`/share/group/${group.id}`}>
                  <strong>{group.name}</strong>
                  <p>{group.description}</p>
                </a>
              ))
            ) : (
              <p>No communities match.</p>
            )}
          </section>
          <section className="settings-panel">
            <h2>Plans</h2>
            {results.plans.length ? (
              results.plans.map((plan) => (
                <a className="search-result" key={plan.id} href={`/share/event/${plan.id}`}>
                  <strong>{plan.name}</strong>
                  <p>
                    {new Date(plan.startsAt).toLocaleString()} · {plan.generalArea}
                  </p>
                </a>
              ))
            ) : (
              <p>No upcoming Plans match.</p>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
