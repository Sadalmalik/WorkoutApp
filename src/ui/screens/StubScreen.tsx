import type { ReactNode } from 'react';

/**
 * Placeholder screen: a heading and a short note. Real content is filled in by later tickets.
 */
export function StubScreen({ title, note }: { title: string; note?: ReactNode }) {
  return (
    <section className="screen">
      <h1 className="screen__title">{title}</h1>
      {note ? <p className="screen__note">{note}</p> : null}
    </section>
  );
}
