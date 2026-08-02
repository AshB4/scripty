import { createBrowserRouter } from 'react-router-dom'
import LandingPage from '../features/landing/LandingPage.jsx'
import ScriptWorkspace from '../features/scripts/ScriptWorkspace.jsx'
import TeleprompterView from '../features/teleprompter/TeleprompterView.jsx'

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
    path: '/teleprompter',
    element: <TeleprompterView />,
  },
])
