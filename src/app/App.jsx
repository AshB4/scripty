import { RouterProvider } from 'react-router-dom'
import AppFooter from '../components/AppFooter.jsx'
import { router } from './router.jsx'

export default function App() {
  return (
    <div className="app-shell">
      <RouterProvider router={router} />
      <AppFooter />
    </div>
  )
}
