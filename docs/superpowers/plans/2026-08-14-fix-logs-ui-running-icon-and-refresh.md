# Fix Logs UI Running Icon & Refresh Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the status icon bug in `LogsPage.tsx` where `running` jobs in the main logs table render a red `XCircle` icon instead of a spinning `Loader2` icon, and add a Refresh button in the top right header.

**Architecture:** Update `LogsPage.tsx` status renderer logic and refactor log fetching into a re-usable `fetchLogs()` callback with `RotateCw` icon button.

**Tech Stack:** React, Tailwind CSS, Lucide Icons (`RotateCw`, `Loader2`, `CheckCircle2`, `XCircle`).

---

### Task 1: Update `LogsPage.tsx` to Fix Status Icon & Add Refresh Button

**Files:**
- Modify: `admin-ui/src/pages/LogsPage.tsx`

- [ ] **Step 1: Update imports and state in `LogsPage.tsx`**

Import `RotateCw` from `lucide-react` and add state `const [refreshing, setRefreshing] = useState(false);`.

- [ ] **Step 2: Refactor log fetch logic into `fetchLogs`**

Create `fetchLogs` callback and call it inside `useEffect`.

- [ ] **Step 3: Add Refresh button to header**

Render `<button onClick={fetchLogs} ...>` in top right header.

- [ ] **Step 4: Fix status icon rendering in `logs.map()`**

Update `log.status` check to render `Loader2` with `animate-spin` when `log.status === 'running'`.

- [ ] **Step 5: Verify build**

Run build or inspect UI.

---
*Made by Anh Tu - Share to be share*
