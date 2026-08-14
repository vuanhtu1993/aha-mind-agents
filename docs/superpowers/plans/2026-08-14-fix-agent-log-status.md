# Fix Agent Log Status & Admin UI Error Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the issue where failed agent pipeline executions are incorrectly recorded as `completed` status in MongoDB logs and incorrectly broadcast as successful jobs to the Admin UI.

**Architecture:** Update `AgentsController` SSE subscriber to catch `failed` events from step execution, set `finalStatus = 'failed'`, and publish `JOB_FAILED` Redis PubSub events while writing errors to `AgentExecLog`. Update `LogsPage.tsx` to handle `JOB_FAILED` events and render error details.

**Tech Stack:** NestJS, RxJS, MongoDB (Mongoose), Redis PubSub, React, Tailwind CSS.

---

### Task 1: Update `AgentsController` Stream Error Handling

**Files:**
- Modify: `src/api/agents/agents.controller.ts:134-197`

- [ ] **Step 1: Update `next()` and `complete()` in `AgentsController`**

Modify `executeAgentStream` in `src/api/agents/agents.controller.ts`:
```typescript
    const subscription = stream$.subscribe({
      next: (event) => {
        writeSseEvent(event);

        // Bắn sự kiện JOB_STEP cho Dashboard
        this.redisPubSub.publishEvent({
          type: 'JOB_STEP',
          jobId,
          pluginId,
          timestamp: Date.now(),
          data: event,
        });

        // Bắt sự kiện timeline của các Node
        if (event.status === 'completed' || event.status === 'failed') {
          const now = Date.now();
          timeline.push({
            nodeName: event.stepId || 'unknown_node',
            status: event.status,
            durationMs: now - lastEventTime,
            timestamp: new Date(),
          });
          lastEventTime = now;
        }

        // Bắt trạng thái lỗi nếu step phát ra status failed
        if (event.status === 'failed') {
          finalStatus = 'failed';
          finalError = event.message || event.error || 'Pipeline execution failed';
        }

        // Bắt Token Usage ở event cuối cùng
        if (event.status === 'done' && event.payload?.tokenUsage) {
          finalTokenUsage = event.payload.tokenUsage;
          if (finalStatus !== 'failed') {
            finalStatus = 'completed';
          }
        }
      },
      error: async (err) => {
        this.logger.error(`Job [${jobId}] Lỗi: ${err.message}`);
        finalStatus = 'failed';
        finalError = err.message;
        writeSseEvent({ status: 'failed', message: `Lỗi hệ thống: ${err.message}` });

        this.redisPubSub.publishEvent({
          type: 'JOB_FAILED',
          jobId,
          pluginId,
          timestamp: Date.now(),
          data: { error: finalError },
        });

        await this.saveAgentLog(jobId, pluginId, pipeline, startTime, finalStatus, timeline, finalTokenUsage, finalError);
        res.end();
      },
      complete: async () => {
        this.logger.log(`Job [${jobId}] Hoàn tất với trạng thái: ${finalStatus}`);

        if (finalStatus === 'failed') {
          this.redisPubSub.publishEvent({
            type: 'JOB_FAILED',
            jobId,
            pluginId,
            timestamp: Date.now(),
            data: { error: finalError },
          });
        } else {
          finalStatus = 'completed';
          this.redisPubSub.publishEvent({
            type: 'JOB_COMPLETED',
            jobId,
            pluginId,
            timestamp: Date.now(),
            data: { status: finalStatus, tokenUsage: finalTokenUsage },
          });
        }

        await this.saveAgentLog(jobId, pluginId, pipeline, startTime, finalStatus, timeline, finalTokenUsage, finalError);
        res.end();
      },
    });
```

- [ ] **Step 2: Verify TypeScript Compilation**

Run: `pnpm build` (or check IDE lints)
Expected: Clean build without errors.

---

### Task 2: Update `LogsPage.tsx` Real-time Error Display

**Files:**
- Modify: `admin-ui/src/pages/LogsPage.tsx:73-95`

- [ ] **Step 1: Update `handleJobEnd` in `LogsPage.tsx`**

Modify `handleJobEnd` in `admin-ui/src/pages/LogsPage.tsx`:
```typescript
    const handleJobEnd = (e: any) => {
      const payload = JSON.parse(e.data);
      setActiveJobs(prev => {
        const newActive = { ...prev };
        const job = newActive[payload.jobId];
        delete newActive[payload.jobId];

        if (job) {
          const isFailed = payload.type === 'JOB_FAILED' || payload.data?.status === 'failed';
          const completedJob = {
            ...job,
            status: isFailed ? 'failed' : (payload.data?.status || 'completed'),
            error: isFailed ? (payload.data?.error || 'Job failed execution') : undefined,
            tokenUsage: payload.data?.tokenUsage,
            durationMs: Date.now() - new Date(job.createdAt).getTime()
          };
          setLogs(currentLogs => [completedJob, ...currentLogs]);
        }
        return newActive;
      });
    };
```

- [ ] **Step 2: Verify Admin UI build / syntax**

Check `LogsPage.tsx` syntax and ensure zero errors.

---
*Made by Anh Tu - Share to be share*
