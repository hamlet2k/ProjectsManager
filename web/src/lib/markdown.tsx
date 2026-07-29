import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function MarkdownView({
  source,
  className,
}: {
  source: string | null | undefined
  className?: string
}) {
  if (!source?.trim()) return null

  return (
    <div className={className ?? 'prose prose-sm max-w-none'}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}
