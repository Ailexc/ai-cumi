import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  pages: string[];
}

export default function PDFPreview({ pages }: Props) {
  const [index, setIndex] = useState(0);
  if (!pages.length) return <div className="text-sm text-muted-foreground">PDF 无页面</div>;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-2 text-sm">
        <button
          disabled={index === 0}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          className="rounded border border-border p-1 hover:bg-muted disabled:opacity-40"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-muted-foreground">{index + 1} / {pages.length}</span>
        <button
          disabled={index === pages.length - 1}
          onClick={() => setIndex((i) => Math.min(pages.length - 1, i + 1))}
          className="rounded border border-border p-1 hover:bg-muted disabled:opacity-40"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <img
        src={pages[index]}
        alt={`PDF page ${index + 1}`}
        className="max-h-[70vh] rounded-lg border border-border shadow-sm"
      />
    </div>
  );
}
