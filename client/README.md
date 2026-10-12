# Cryptiva React frontend (migration in progress)

This folder is the first migration phase. It adds Vite, React, React Router and GSAP without replacing or deleting the existing Express-rendered pages yet.

## Run

1. Start the existing Express backend in the project root: `npm start`
2. In another terminal, install the frontend dependencies once: `npm --prefix client install`
3. Start Vite: `npm run client:dev`
4. Open `http://127.0.0.1:5173/react`

The dev proxy forwards the existing Express route prefixes to `http://127.0.0.1:3000`. If your backend uses a different port, update `client/vite.config.js`.

## Current migration scope

- React/Vite/React Router foundation
- GSAP entrance/background animation with reduced-motion support
- Initial React landing, login and registration screens
- Native POST forms preserved for `/login` and `/register`
- CSRF token read from the existing meta tag at render time
- Existing legacy frontend and backend routes remain in place

This is an incremental migration. Do not delete legacy pages until the matching React page has been integrated and regression-tested.
