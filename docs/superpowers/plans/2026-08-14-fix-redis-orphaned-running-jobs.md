# Fix Redis Orphaned Running Jobs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure Redis active job keys (`active_job:{jobId}`) are always cleaned up when client disconnects or pipeline execution errors out, preventing jobs from staying stuck in `running` status.

**Architecture:** Update `AgentsController.ts` `executeAgentStream` with a central `cleanupAndFinalize` helper, handle Express `req.on('close')` event to mark disconnected jobs as failed and delete Redis Hash key, and wrap stream execution in `try-catch`.

**Tech Stack:** NestJS, Express, ioredis, RxJS.

---

### Task 1: Update `AgentsController.ts` for Guaranteed Redis Cleanup on Disconnect and Errors

**Files:**
- Modify: `src/api/agents/agents.controller.ts:110-240`

- [ ] **Step 1: Implement `cleanupAndFinalize` helper in `executeAgentStream`**

- [ ] **Step 2: Add disconnect handling in `req.on('close')`**

- [ ] **Step 3: Wrap `plugin.execute()` in `try-catch`**

- [ ] **Step 4: Verify build with `pnpm build`**

---
*Made by Anh Tu - Share to be share*
