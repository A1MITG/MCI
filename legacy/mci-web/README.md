# MCI — Market & Competitive Intelligence (scaffold)

This is a starter scaffold for the MCI web app (Vite + React + Tailwind) with a simple Express API stub.

Quick start (Windows PowerShell):

# From project root
cd mci-web

# Install dependencies
npm install

# Start the backend server (port 4000) and the Vite dev server (port 5173) in separate shells, or run both with concurrently:
npm run server
# in another shell
npm run dev

# OR to run both (requires concurrently):
npm run dev:all

Notes:
- The frontend calls `/api/insights?q=...` which is proxied to the Express stub when running servers separately. For production, set up proper proxy or server-side rendering.
- Replace the `/server/server.js` stub with real AI integration that calls Grok / ChatGPT securely using server-side API keys.

Next steps:
- Implement AI integration in `server/server.js` with secure API key handling.
- Build homepage content and complete the other pages.
- Add environment config and documentation for API keys.
