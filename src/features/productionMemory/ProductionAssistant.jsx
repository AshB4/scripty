import { Sparkles } from 'lucide-react'
import Button from '../../components/Button.jsx'
import { useProductionMemoryAssistant } from './useProductionMemoryAssistant.js'

export default function ProductionAssistant({ productionId }) {
  const assistant = useProductionMemoryAssistant(productionId)
  const isLoading = assistant.status === 'loading'

  return (
    <section aria-labelledby="production-assistant-title" className="production-assistant">
      <div className="production-assistant__heading">
        <div>
          <p className="eyebrow">Production Assistant</p>
          <h2 id="production-assistant-title">What's Left?</h2>
        </div>
        <Button
          disabled={isLoading}
          icon={Sparkles}
          onClick={assistant.ask}
          variant="secondary"
        >
          {isLoading ? 'Checking current work...' : 'What do I still need to finish?'}
        </Button>
      </div>

      <div aria-live="polite" className="production-assistant__response">
        {isLoading ? <p>Checking current Production Memory...</p> : null}
        {assistant.status === 'success' ? <p>{assistant.answer}</p> : null}
        {assistant.status === 'error' ? <p role="alert">{assistant.error}</p> : null}
      </div>
    </section>
  )
}
