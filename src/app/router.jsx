import { createBrowserRouter } from 'react-router-dom'
import LandingPage from '../features/landing/LandingPage.jsx'
import ScriptWorkspace from '../features/scripts/ScriptWorkspace.jsx'
import ScriptGuidePage from '../features/scripts/guide/ScriptGuidePage.jsx'
import PrepareReviewPage from '../features/scripts/prepare/PrepareReviewPage.jsx'
import TeleprompterView from '../features/teleprompter/view/TeleprompterView.jsx'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <LandingPage />,
  },
  {
    path: '/scripts',
    element: <ScriptWorkspace />,
  },
  {
    path: '/scripts/guide',
    element: <ScriptGuidePage />,
  },
  {
    path: '/scripts/review',
    element: <PrepareReviewPage />,
  },
  {
    path: '/teleprompter',
    element: <TeleprompterView />,
  },
])
