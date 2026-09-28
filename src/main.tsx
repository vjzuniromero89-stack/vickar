import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "@fontsource-variable/fraunces/opsz.css"
import "@fontsource-variable/fraunces/opsz-italic.css"
import "@fontsource-variable/instrument-sans"
import "@fontsource/ibm-plex-mono/400.css"
import "@fontsource/ibm-plex-mono/500.css"

import "./styles/tokens.css"
import "./styles/base.css"
import "./styles/layout.css"

import { App } from "./App"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
