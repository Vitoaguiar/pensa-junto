import React from 'react'
import ReactDOM from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import { HashRouter } from 'react-router-dom'
import { App } from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {/* "user": o Framer Motion desliga transformações quando o sistema pede movimento reduzido. */}
    <MotionConfig reducedMotion="user" transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}>
      <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </HashRouter>
    </MotionConfig>
  </React.StrictMode>
)
