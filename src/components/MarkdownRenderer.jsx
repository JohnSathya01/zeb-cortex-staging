import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import '../styles/markdown.css';

const components = {
  h1: ({ children }) => <h1 className="md-h1">{children}</h1>,
  h2: ({ children }) => <h2 className="md-h2">{children}</h2>,
  h3: ({ children }) => <h3 className="md-h3">{children}</h3>,
  h4: ({ children }) => <h4 className="md-h4">{children}</h4>,
  h5: ({ children }) => <h5 className="md-h5">{children}</h5>,
  h6: ({ children }) => <h6 className="md-h6">{children}</h6>,
  code: ({ className, children, ...props }) => {
    const match = /language-(\w+)/.exec(className || '');
    const inline = !match && !className;
    if (inline) {
      return <code className="md-inline-code" {...props}>{children}</code>;
    }
    return (
      <SyntaxHighlighter
        style={oneLight}
        language={match ? match[1] : 'text'}
        PreTag="div"
        customStyle={{ fontFamily: 'ui-monospace, Consolas, monospace', borderRadius: '6px' }}
      >
        {String(children).replace(/\n$/, '')}
      </SyntaxHighlighter>
    );
  },
  table: ({ children }) => (
    <div className="md-table-wrapper">
      <table className="md-table">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="md-thead">{children}</thead>,
  th: ({ children }) => <th className="md-th">{children}</th>,
  td: ({ children }) => <td className="md-td">{children}</td>,
  tr: ({ children, ...props }) => <tr className="md-tr" {...props}>{children}</tr>,
  strong: ({ children }) => <strong className="md-bold">{children}</strong>,
  em: ({ children }) => <em className="md-italic">{children}</em>,
  ul: ({ children }) => <ul className="md-ul">{children}</ul>,
  ol: ({ children }) => <ol className="md-ol">{children}</ol>,
  li: ({ children }) => <li className="md-li">{children}</li>,
};

export default function MarkdownRenderer({ content }) {
  if (!content) return null;
  return (
    <div className="md-content">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
