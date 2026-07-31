/**
 * Bootstrap Icons wrappers — same icon set as the classic Flask app.
 * Docs: https://icons.getbootstrap.com/
 */
import { cn } from '@/lib/utils'

type IconProps = {
  className?: string
  size?: number | string
  title?: string
  'aria-hidden'?: boolean | 'true' | 'false'
}

function Bi({
  name,
  className,
  size = '1.05em',
  title,
  ...rest
}: IconProps & { name: string }) {
  return (
    <i
      className={cn(`bi bi-${name}`, className)}
      style={{ fontSize: size, lineHeight: 1 }}
      title={title}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      {...rest}
    />
  )
}

export const Icons = {
  Grip: (p: IconProps) => <Bi name="grip-vertical" {...p} />,
  Check: (p: IconProps) => <Bi name="check-lg" {...p} />,
  Copy: (p: IconProps) => <Bi name="copy" {...p} />,
  Clipboard: (p: IconProps) => <Bi name="clipboard" {...p} />,
  Paste: (p: IconProps) => <Bi name="clipboard-plus" {...p} />,
  Edit: (p: IconProps) => <Bi name="pencil" {...p} />,
  Trash: (p: IconProps) => <Bi name="trash3" {...p} />,
  Share: (p: IconProps) => <Bi name="share" {...p} />,
  Settings: (p: IconProps) => <Bi name="gear" {...p} />,
  /** Official Bootstrap GitHub mark (not a git-branch icon) */
  Github: (p: IconProps) => <Bi name="github" {...p} />,
  Plus: (p: IconProps) => <Bi name="plus-lg" {...p} />,
  Save: (p: IconProps) => <Bi name="floppy" {...p} />,
  X: (p: IconProps) => <Bi name="x-lg" {...p} />,
  ChevronDown: (p: IconProps) => <Bi name="chevron-down" {...p} />,
  ChevronRight: (p: IconProps) => <Bi name="chevron-right" {...p} />,
  Refresh: (p: IconProps) => <Bi name="arrow-clockwise" {...p} />,
  Bell: (p: IconProps) => <Bi name="bell" {...p} />,
  User: (p: IconProps) => <Bi name="person" {...p} />,
  Sun: (p: IconProps) => <Bi name="sun" {...p} />,
  Moon: (p: IconProps) => <Bi name="moon-stars" {...p} />,
  /** System / follow OS preference */
  System: (p: IconProps) => <Bi name="circle-half" {...p} />,
  Logout: (p: IconProps) => <Bi name="box-arrow-right" {...p} />,
  Back: (p: IconProps) => <Bi name="arrow-left" {...p} />,
  Home: (p: IconProps) => <Bi name="house" {...p} />,
  Feedback: (p: IconProps) => <Bi name="chat-dots" {...p} />,
  Flag: (p: IconProps) => <Bi name="flag" {...p} />,
  Tag: (p: IconProps) => <Bi name="tags" {...p} />,
  Filter: (p: IconProps) => <Bi name="funnel" {...p} />,
  /** Create / sync issue affordance (circle + mark) */
  Issue: (p: IconProps) => <Bi name="record-circle" {...p} />,
  /** Link existing GitHub issue */
  Link: (p: IconProps) => <Bi name="link-45deg" {...p} />,
  /** Task dependencies / blockers */
  Dependencies: (p: IconProps) => <Bi name="diagram-3" {...p} />,
  List: (p: IconProps) => <Bi name="list-task" {...p} />,
  People: (p: IconProps) => <Bi name="people" {...p} />,
  Help: (p: IconProps) => <Bi name="question-circle" {...p} />,
  Markdown: (p: IconProps) => <Bi name="markdown" {...p} />,
}
