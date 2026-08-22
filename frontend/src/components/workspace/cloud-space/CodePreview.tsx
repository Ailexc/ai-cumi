import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface Props {
  content: string;
  language?: string;
}

export default function CodePreview({ content, language = 'text' }: Props) {
  return (
    <div className="rounded-lg border border-border bg-[#1e1e1e] p-4">
      <SyntaxHighlighter
        language={language === 'text' ? 'plaintext' : language}
        style={vscDarkPlus}
        showLineNumbers
        wrapLongLines
        customStyle={{ margin: 0, borderRadius: 0, fontSize: '13px' }}
      >
        {content}
      </SyntaxHighlighter>
    </div>
  );
}
