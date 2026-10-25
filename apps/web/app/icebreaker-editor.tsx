'use client';

import type { PromptDefinition } from '@sp/types';
import { useState } from 'react';
import { UiIcon } from './ui-icon';

export function IcebreakerEditor({
  prompts,
  answers,
  disabled,
  onChange,
}: {
  prompts: PromptDefinition[];
  answers: Record<string, string>;
  disabled: boolean;
  onChange: (answers: Record<string, string>) => void;
}) {
  const [choosing, setChoosing] = useState<string | 'new' | null>(null);
  const [search, setSearch] = useState('');
  const ids = Object.keys(answers).filter((id) => prompts.some((prompt) => prompt.id === id));
  function choose(id: string) {
    const next = { ...answers };
    if (choosing && choosing !== 'new') delete next[choosing];
    if (next[id] === undefined) next[id] = '';
    onChange(next);
    setChoosing(null);
    setSearch('');
  }
  return (
    <div className="icebreaker-editor">
      <div className="editor-section-heading">
        <div>
          <span className="eyebrow">A LITTLE PERSONALITY</span>
          <h2>Icebreakers</h2>
          <p className="muted">
            Choose up to three questions people can start a conversation with.
          </p>
        </div>
        <span className="editor-count">{ids.length}/3</span>
      </div>
      <div className="icebreaker-cards">
        {ids.map((id, index) => {
          const prompt = prompts.find((item) => item.id === id)!;
          return (
            <article className="icebreaker-card" key={id}>
              <div className="icebreaker-card-top">
                <span className="eyebrow">
                  QUESTION {index + 1} · {prompt.category}
                </span>
                <button
                  type="button"
                  className="icon-control"
                  aria-label={`Remove icebreaker ${index + 1}`}
                  disabled={disabled}
                  onClick={() => {
                    const next = { ...answers };
                    delete next[id];
                    onChange(next);
                    if (choosing === id) setChoosing(null);
                  }}
                >
                  <UiIcon name="close" size={17} />
                </button>
              </div>
              <label htmlFor={`icebreaker-${id}`}>{prompt.prompt}</label>
              <textarea
                id={`icebreaker-${id}`}
                value={answers[id] ?? ''}
                disabled={disabled}
                maxLength={240}
                rows={3}
                placeholder="Your answer, in your own words…"
                onChange={(event) => onChange({ ...answers, [id]: event.target.value })}
              />
              <div className="icebreaker-card-bottom">
                <button
                  type="button"
                  className="link"
                  disabled={disabled}
                  onClick={() => {
                    setChoosing(choosing === id ? null : id);
                    setSearch('');
                  }}
                >
                  Change question
                </button>
                <span className="muted">{(answers[id] ?? '').length}/240</span>
              </div>
            </article>
          );
        })}
      </div>
      {ids.length < 3 && choosing === null && (
        <button
          type="button"
          className="icebreaker-add"
          disabled={disabled}
          onClick={() => setChoosing('new')}
        >
          <UiIcon name="plus" />
          <span>
            <strong>Add an icebreaker</strong>
            <small>Pick a question that sounds like you</small>
          </span>
        </button>
      )}
      {choosing !== null && (
        <section className="icebreaker-picker" aria-label="Choose an icebreaker">
          <div className="editor-section-heading">
            <h3>{choosing === 'new' ? 'Find your question' : 'Choose a different question'}</h3>
            <button
              type="button"
              className="icon-control"
              aria-label="Close question picker"
              onClick={() => setChoosing(null)}
            >
              <UiIcon name="close" />
            </button>
          </div>
          <label className="sidle-sr-only" htmlFor="icebreaker-search">
            Search questions
          </label>
          <input
            id="icebreaker-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search questions or topics…"
          />
          <div className="icebreaker-options">
            {prompts
              .filter(
                (prompt) =>
                  !ids.includes(prompt.id) &&
                  `${prompt.prompt} ${prompt.category}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
              )
              .map((prompt) => (
                <button
                  type="button"
                  key={prompt.id}
                  disabled={disabled}
                  onClick={() => choose(prompt.id)}
                >
                  <small>{prompt.category}</small>
                  <strong>{prompt.prompt}</strong>
                  <UiIcon name="plus" size={17} />
                </button>
              ))}
          </div>
          {!prompts.some(
            (prompt) =>
              !ids.includes(prompt.id) &&
              `${prompt.prompt} ${prompt.category}`.toLowerCase().includes(search.toLowerCase()),
          ) && <p className="muted">No matching questions. Try another topic.</p>}
        </section>
      )}
      <p className="muted editor-footnote">
        Answer at least one question to save your profile. Two to 240 characters per answer.
      </p>
    </div>
  );
}
