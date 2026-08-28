import { Sparkles } from 'lucide-react'
import Button from '../../components/Button.jsx'
import {
  PRODUCTION_MEMORY_QUESTIONS,
  WHATS_LEFT_QUESTION,
} from '../../../productionMemoryQuestions.js'
import { useProductionMemoryAssistant } from './useProductionMemoryAssistant.js'

function countLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

export default function ProductionAssistant({ productionId }) {
  const assistant = useProductionMemoryAssistant(productionId)
  const isLoading = assistant.status === 'loading'

  return (
    <section aria-labelledby="production-assistant-title" className="production-assistant">
      <div className="production-assistant__heading">
        <div>
          <p className="eyebrow">Production Assistant</p>
          <h2 id="production-assistant-title">Production Assistant</h2>
        </div>
      </div>

      <div aria-label="Production Assistant questions" className="production-assistant__actions">
        {PRODUCTION_MEMORY_QUESTIONS.map((item) => (
          <Button
            aria-pressed={assistant.question === item.label}
            disabled={isLoading}
            icon={item.label === WHATS_LEFT_QUESTION ? Sparkles : undefined}
            key={item.id}
            onClick={() => assistant.ask(item.label)}
            variant="secondary"
          >
            {item.label}
          </Button>
        ))}
      </div>

      <div aria-live="polite" className="production-assistant__response">
        {isLoading ? <p>Checking current Production Memory...</p> : null}
        {assistant.question && !isLoading ? (
          <p className="production-assistant__question">{assistant.question}</p>
        ) : null}
        {assistant.status === 'success' ? <p>{assistant.answer}</p> : null}
        {assistant.completion ? (
          <section className="production-assistant__completion" aria-label="Production completion summary">
            <strong>Production complete</strong>
            <span>{countLabel(assistant.completion.recordingCount, 'recording section')} completed</span>
            <span>{countLabel(assistant.completion.totalTakes, 'total take')} logged</span>
            <span>{countLabel(assistant.completion.assetCount, 'production asset')} completed</span>
            <span>No pickups remaining</span>
          </section>
        ) : null}
        {assistant.status === 'error' ? <p role="alert">{assistant.error}</p> : null}
      </div>
    </section>
  )
}
