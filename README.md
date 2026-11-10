# Cloud Cost Guardian (CCG)
**Approval-Gated AWS Cost Optimization & FinOps Platform (PERN + DevOps)**


## How to Run the Project Folder
1. **Unzip `cloud-cost-guardian.zip`** and open a terminal inside the `cloud-cost-guardian/` directory.
2. **Option 1 — One-Click Script (Linux/macOS/Windows)**:
   - Linux/macOS: `chmod +x start-local.sh && ./start-local.sh`
   - Windows: Double-click `start-local.bat`
3. **Option 2 — Docker Compose**:
   ```bash
   docker compose up --build
   ```
4. **Option 3 — Manual Node.js (Backend + Frontend in two terminals)**:
   ```bash
   # Terminal 1 (Backend Express API on http://localhost:3000)
   cd apps/api
   npm install
   npm run dev

   # Terminal 2 (Frontend React UI on http://localhost:5173)
   cd apps/web
   npm install
   npm run dev
   ```

