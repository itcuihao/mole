import React from 'react'
import {createRoot} from 'react-dom/client'
import './style.css'
import App from './App'
import { ThemeProvider } from './lib/theme'

const container = document.getElementById('root')

const root = createRoot(container!)

root.render(
    <React.StrictMode>
        <ThemeProvider defaultTheme="dark">
            <App/>
        </ThemeProvider>
    </React.StrictMode>
)
