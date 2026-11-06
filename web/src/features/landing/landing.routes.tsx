import { Route } from 'react-router-dom'
import { LandingPage } from './ui/landing-page'

/** Optional export if you prefer composing routes elsewhere. `/` is wired in AppRouter. */
export const landingRoutes = <Route path="/" element={<LandingPage />} />
