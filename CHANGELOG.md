# WhatsApp CRM Changelog

## [v2.8.1] - 2026-10-12
### 24-Hour Default Cadence & Per-Lead Follow-Up Controls
- **24-Hour Default Cadence**:
  - Changed system-wide default follow-up radar countdown from 36 hours (1.5 days) to **24 hours**.
  - Updated dashboard counter badge (`@24 Hours`), header texts, and initial candidate queue timers.
- **Per-Lead Follow-Up Toggle (Enable / Disable)**:
  - Added dedicated toggle button (`✓ Enabled` / `✕ Disabled`) per lead in both table and mobile card views.
  - Pausing follow-up visually dims the row, sets status to `⏸️ Paused`, and safely retains lead state without unwanted reminders.
- **Per-Lead Interval Cadence Selector**:
  - Added custom interval selector for each contact (`24h Default`, `36h 1.5-Day`, `48h 2-Day`, `72h 3-Day`).
  - Selecting a new interval immediately recalculates the next countdown due timestamp and saves to Supabase (`PATCH /api/leads/:phone/followup-settings`).
- **Database Schema**:
  - Added `followup_enabled` (boolean, default true) and `followup_interval_hours` (integer, default 24) columns to `crm_leads`.
  - Updated live trigger route (`POST /api/followup/trigger`) to dynamically respect the lead's configured interval.
