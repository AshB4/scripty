import {
  Bookmark,
  Expand,
  FlipHorizontal2,
  Keyboard,
  Laptop,
  PackageOpen,
  WifiOff,
} from 'lucide-react'

const features = [
  {
    icon: WifiOff,
    title: 'Works offline',
    description: 'Your script stays available after the first browser load.',
  },
  {
    icon: PackageOpen,
    title: 'No installation',
    description: 'Open Scripty and start prompting without a desktop setup.',
  },
  {
    icon: Laptop,
    title: 'Browser based',
    description: 'Runs where you work, across modern desktop and mobile browsers.',
  },
  {
    icon: Keyboard,
    title: 'Keyboard and trackpad controls',
    description: 'Control playback, position, and speed without breaking focus.',
  },
  {
    icon: Expand,
    title: 'Fullscreen mode',
    description: 'Turn any display into a distraction-free teleprompter.',
  },
  {
    icon: FlipHorizontal2,
    title: 'Mirror mode',
    description: 'Flip the read for compatible camera and beam-splitter rigs.',
  },
  {
    icon: Bookmark,
    title: 'Saved scripts',
    description: 'Pick up where you left off with private browser storage.',
  },
]

export default function FeatureGrid() {
  return (
    <section className="feature-band" id="features">
      <div className="section-intro shell">
        <p className="eyebrow">Built for the next take</p>
        <h2>Everything you need to stay on script.</h2>
      </div>
      <div className="feature-grid shell">
        {features.map(({ description, icon: Icon, title }) => (
          <article className="feature-card" key={title}>
            <Icon aria-hidden="true" size={22} />
            <h2>{title}</h2>
            <p>{description}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
