import React, { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'zfs_dashboard_layout_v1';

type Span = 1 | 2;
type Saved = { id: string; span: Span };

function readSaved(): Saved[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter((item) => item && typeof item.id === 'string' && (item.span === 1 || item.span === 2));
  } catch {
    return [];
  }
}

function childId(child: React.ReactElement, index: number) {
  if (child.key == null) return `card-${index}`;
  return String(child.key).replace(/^\.\$/, '');
}

export const DashboardGrid: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const elements = React.Children.toArray(children).filter(React.isValidElement) as React.ReactElement[];
  const ids = elements.map((element, index) => childId(element, index));
  const idKey = ids.join('|');
  const [layout, setLayout] = useState<Saved[]>(() => readSaved());
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    setLayout((current) => {
      const known = new Set(ids);
      const next = current.filter((item) => known.has(item.id));
      for (const id of ids) {
        if (!next.some((item) => item.id === id)) next.push({ id, span: 2 });
      }
      return next;
    });
  }, [idKey]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  }, [layout]);

  const ordered = useMemo(() => {
    const byId = new Map(elements.map((element, index) => [childId(element, index), element]));
    const seen = new Set<string>();
    const rows: { id: string; span: Span; node: React.ReactElement }[] = [];
    for (const item of layout) {
      const node = byId.get(item.id);
      if (!node || seen.has(item.id)) continue;
      seen.add(item.id);
      rows.push({ id: item.id, span: item.span, node });
    }
    elements.forEach((element, index) => {
      const id = childId(element, index);
      if (!seen.has(id)) rows.push({ id, span: 2, node: element });
    });
    return rows;
  }, [elements, layout]);

  const move = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    setLayout((current) => {
      const next = [...current];
      const from = next.findIndex((item) => item.id === dragId);
      const to = next.findIndex((item) => item.id === targetId);
      if (from < 0 || to < 0) return current;
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    setDragId(null);
  };

  return (
    <div className="p-6 w-full min-w-0 flex flex-wrap items-stretch content-start gap-6">
      {ordered.map((card) => (
        <div
          key={card.id}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => move(card.id)}
          className={`min-w-0 transition-[flex-basis,max-width] duration-300 ease-out ${
            card.span === 2
              ? 'basis-full max-w-full'
              : 'basis-full max-w-full lg:basis-[calc(50%-0.75rem)] lg:max-w-[calc(50%-0.75rem)]'
          } ${dragId === card.id ? 'opacity-60' : ''}`}
        >
          <div className="flex items-center justify-end gap-2 mb-1">
            <span
              draggable
              onDragStart={() => setDragId(card.id)}
              onDragEnd={() => setDragId(null)}
              title="Drag to reorder"
              className="cursor-grab active:cursor-grabbing text-[10px] font-mono tracking-widest text-slate-500 hover:text-slate-200 select-none px-1"
            >
              ⋮⋮
            </span>
            <button
              type="button"
              title="Resize"
              onClick={() =>
                setLayout((current) =>
                  current.map((item) =>
                    item.id === card.id ? { ...item, span: item.span === 2 ? 1 : 2 } : item,
                  ),
                )
              }
              className="text-[10px] font-mono text-slate-500 hover:text-slate-200 cursor-pointer"
            >
              {card.span === 2 ? 'half' : 'full'}
            </button>
          </div>
          {card.node}
        </div>
      ))}
    </div>
  );
};
