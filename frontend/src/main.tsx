import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import viVN from 'antd/locale/vi_VN'
import './index.css'
import App from './App.tsx'

const isMobile = window.matchMedia('(max-width: 768px)').matches;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider
      locale={viVN}
      theme={{
        token: {
          colorPrimary: '#1a6b4e',
          borderRadius: 8,
          fontSize: isMobile ? 14 : 17,
        },
      }}
    >
      <App />
    </ConfigProvider>
  </StrictMode>,
)
