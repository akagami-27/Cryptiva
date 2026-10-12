CRYPTIVA REACT MIGRATION

This ZIP keeps the existing Express/MongoDB backend and migrates the main workspace navigation to React routes. The original source ZIP is not modified.

RUN ON WINDOWS
1. Extract this ZIP.
2. Open PowerShell in the inner Cryptiva folder (the folder containing server.js).
3. Run: npm start
4. Open a second PowerShell in the same folder.
5. Run: npm --prefix client run dev
6. Open: http://127.0.0.1:5173/react

Do not share your .env file. Keep your existing local environment values. The React workspace pages use existing backend JSON endpoints; test each operation against your own MongoDB data before deployment.
