import FeatureGrid from './FeatureGrid.jsx'
import Hero from './Hero.jsx'
import VoiceFollowPreview from './VoiceFollowPreview.jsx'

export default function LandingPage() {
  return (
    <main className="landing">
      <Hero />
      <FeatureGrid />
      <VoiceFollowPreview />
    </main>
  )
}
