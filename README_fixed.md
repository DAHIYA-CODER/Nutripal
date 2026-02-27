# Nutripal (fixed-ready)

This repository has been prepared to run locally with minimal setup. Changes made:
- Added `server/.env` template with recommended values.
- Added `client/.env` with `REACT_APP_API_URL` pointing to the server port.
- Ensured `client/package.json` has a `proxy` set to `http://localhost:8089` for development.
- Included a README with run instructions.

## Quick start (local)

1. Start MongoDB locally (or update `server/.env` `MONGO_URI` to a remote cluster).
2. In one terminal, start the backend:
   ```bash
   cd server
   npm install
   npm run seed   # optional: seeds sample foods/users
   npm run dev    # or npm start
   ```
3. In another terminal, start the frontend:
   ```bash
   cd client
   npm install
   npm start
   ```

If you want a single command to start both, let me know and I can add a root `package.json` using `concurrently`.
