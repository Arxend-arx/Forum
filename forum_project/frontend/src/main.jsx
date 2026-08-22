import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './i18n'
import './styles/theme.css'
import './styles/tailwind.css' // Tailwind v4（layer 隔离，供新壳层/新页面使用，不覆盖旧样式）
import './styles/polarium.css' // Polarium 新壳层（Landing/Feed，作用域限定在 .polarium 内）
import { AppProvider } from './context/AppContext'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProvider>
        <App />
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>
)
