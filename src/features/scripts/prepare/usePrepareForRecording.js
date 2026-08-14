import { useEffect, useState } from 'react'
import { createPrepareWorkflow, getPrepareButtonState } from './prepareWorkflow.js'
import {
  canFinalizePrepare,
  getUnresolvedPrepareItems,
} from './prepareReview.js'

export function usePrepareForRecording({ parserMode, script }) {
  const [workflow] = useState(() => createPrepareWorkflow())
  const [state, setState] = useState(() => workflow.getState())

  useEffect(() => workflow.subscribe(setState), [workflow])

  useEffect(() => {
    workflow.setContext(script, parserMode)
  }, [parserMode, script, workflow])

  return {
    ...state,
    button: getPrepareButtonState({
      hasScript: Boolean(script.trim()),
      result: state.result,
      status: state.status,
    }),
    canFinalize: canFinalizePrepare(state.result),
    isFinalized:
      Boolean(state.finalizedResult) &&
      JSON.stringify(state.finalizedResult) === JSON.stringify(state.result),
    unresolvedCount: getUnresolvedPrepareItems(state.result).length,
    finalize: workflow.finalize,
    prepare: workflow.prepare,
    resolveClarification: workflow.resolveClarification,
    updateRequirement: workflow.updateRequirement,
    updateSegment: workflow.updateSegment,
  }
}
