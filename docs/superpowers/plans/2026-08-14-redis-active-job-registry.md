# Redis Dual-Role Active Job Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent active job state loss on page reload by storing running job snapshots in Redis Hash alongside existing Pub/Sub usage. Zero additional MongoDB write I/O during execution.

**Architecture:** `RedisPubSubService` gains 4 new methods (`registerActiveJob`, `updateActiveJobStep`, `removeActiveJob`, `getActiveJobs`) using the existing `pubClient` (ioredis). `AgentsController` calls these at job lifecycle events. `DashboardService.getLogs()` merges Redis active jobs with MongoDB finished logs. `LogsPage.tsx` separates running vs finished on initial load.

**Tech Stack:** NestJS, ioredis (HSET/HGETALL/DEL/EXPIRE/KEYS), MongoDB, React.

---

### Task 1: Add Active Job Hash Methods to `RedisPubSubService`

**Files:**
- Modify: `src/core/services/redis-pubsub.service.ts:84-96`

- [ ] **Step 1: Add 4 new methods after `publishEvent()`**

Append to `src/core/services/redis-pubsub.service.ts` before the closing `}` of the class:
```typescript
  /**
   * Ghi nhận Job bắt đầu chạy vào Redis Hash (TTL 30 phút tự dọn sạch)
   */
  async registerActiveJob(jobId: string, data: {
    pluginId: string;
    pipeline: string;
    startedAt: number;
  }) {
    if (this.pubClient.status !== 'ready') return;
    const key = `active_job:${jobId}`;
    await this.pubClient.hset(key,
      'jobId', jobId,
      'pluginId', data.pluginId,
      'pipeline', data.pipeline,
      'status', 'running',
      'currentStep', 'Đang khởi tạo Agent...',
      'startedAt', String(data.startedAt),
    );
    await this.pubClient.expire(key, 1800);
  }

  /**
   * Cập nhật currentStep trong Redis Hash khi Node hoàn thành (0 DB Write, O(1))
   */
  async updateActiveJobStep(jobId: string, currentStep: string) {
    if (this.pubClient.status !== 'ready') return;
    await this.pubClient.hset(`active_job:${jobId}`, 'currentStep', currentStep);
  }

  /**
   * Xóa Active Job khỏi Redis khi Job kết thúc
   */
  async removeActiveJob(jobId: string) {
    if (this.pubClient.status !== 'ready') return;
    await this.pubClient.del(`active_job:${jobId}`);
  }

  /**
   * Lấy tất cả Active Jobs đang chạy từ Redis Hash để trả về cho Dashboard khi Client reload
   */
  async getActiveJobs(): Promise<any[]> {
    if (this.pubClient.status !== 'ready') return [];
    const keys = await this.pubClient.keys('active_job:*');
    if (!keys.length) return [];

    const jobs = await Promise.all(
      keys.map(key => this.pubClient.hgetall(key))
    );
    return jobs
      .filter(Boolean)
      .map(job => ({
        ...job,
        _id: job.jobId,
        startedAt: Number(job.startedAt),
        createdAt: new Date(Number(job.startedAt)).toISOString(),
        durationMs: Date.now() - Number(job.startedAt),
      }));
  }
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: Success with 0 errors.

---

### Task 2: Integrate Redis Hash into `AgentsController` Job Lifecycle

**Files:**
- Modify: `src/api/agents/agents.controller.ts:92-220`

- [ ] **Step 1: Register Job in Redis after flushHeaders**

After `res.flushHeaders();` and the `const jobId = randomUUID();` line, add:
```typescript
    const startTime = Date.now();
    // Ghi nhận Job vào Redis Hash ngay khi bắt đầu
    await this.redisPubSub.registerActiveJob(jobId, { pluginId, pipeline, startedAt: startTime });
```

> [!NOTE]
> Remove the duplicate `const startTime = Date.now();` that currently appears further down (line ~126).

- [ ] **Step 2: Update `currentStep` in Redis on each step event**

Inside `next(event)` callback, after the existing timeline push block:
```typescript
        // Cập nhật currentStep snapshot vào Redis Hash (không ghi DB)
        if (event.message) {
          this.redisPubSub.updateActiveJobStep(jobId, event.message).catch(() => {});
        }
```

- [ ] **Step 3: Remove from Redis on job end in `error()` callback**

Inside the `error()` callback, before `res.end()`:
```typescript
        await this.redisPubSub.removeActiveJob(jobId);
```

- [ ] **Step 4: Remove from Redis on job end in `complete()` callback**

Inside the `complete()` callback, before `saveAgentLog`:
```typescript
        await this.redisPubSub.removeActiveJob(jobId);
```

- [ ] **Step 5: Verify build**

Run: `pnpm build`
Expected: Success with 0 errors.

---

### Task 3: Update `DashboardService.getLogs()` to Merge Redis + MongoDB

**Files:**
- Modify: `src/api/dashboard/dashboard.service.ts:13-17,97-112`

- [ ] **Step 1: Inject `RedisPubSubService` in DashboardService constructor**

```typescript
import { RedisPubSubService } from '../../core/services/redis-pubsub.service';

constructor(
  @InjectModel(AgentExecLog.name, AHA_MIND_CONNECTION) private readonly execLogModel: Model<AgentExecLog>,
  @InjectModel(AgentConfig.name, AHA_MIND_CONNECTION) private readonly configModel: Model<AgentConfig>,
  private readonly pluginRegistry: PluginRegistryService,
  private readonly redisPubSub: RedisPubSubService,
) {}
```

- [ ] **Step 2: Update `getLogs()` to merge active + finished jobs**

```typescript
  async getLogs(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [dbLogs, total, activeJobs] = await Promise.all([
      this.execLogModel.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.execLogModel.countDocuments(),
      this.redisPubSub.getActiveJobs(),
    ]);

    return {
      items: [...activeJobs, ...dbLogs],
      meta: {
        total: total + activeJobs.length,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }
```

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: Success with 0 errors.

---

### Task 4: Update `LogsPage.tsx` to Separate Running vs Finished on Initial Load

**Files:**
- Modify: `admin-ui/src/pages/LogsPage.tsx:13-18`

- [ ] **Step 1: Update initial `useEffect` to split running vs finished**

```typescript
  useEffect(() => {
    axios.get('/api/v1/dashboard/logs?limit=50')
      .then(res => {
        const items: any[] = res.data.items || [];
        const running: Record<string, any> = {};
        const finished: any[] = [];

        items.forEach((item: any) => {
          if (item.status === 'running') {
            running[item._id || item.jobId] = item;
          } else {
            finished.push(item);
          }
        });

        setActiveJobs(running);
        setLogs(finished);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);
```

- [ ] **Step 2: Guard `JOB_STARTED` SSE handler to avoid duplicates**

When SSE `JOB_STARTED` arrives, only add the job to `activeJobs` if it doesn't already exist (it may already be there from the initial `/logs` fetch):
```typescript
    eventSource.addEventListener('JOB_STARTED', (e: any) => {
      const payload = JSON.parse(e.data);
      setActiveJobs(prev => {
        // Nếu đã có từ initial load (Redis), bỏ qua để tránh duplicate
        if (prev[payload.jobId]) return prev;
        return {
          ...prev,
          [payload.jobId]: {
            _id: payload.jobId,
            status: 'running',
            pluginId: payload.pluginId,
            pipeline: payload.pipeline,
            createdAt: new Date(payload.timestamp).toISOString(),
            durationMs: 0,
            currentStep: 'Đang khởi tạo Agent...',
            tokenUsage: null
          }
        };
      });
    });
```

---
*Made by Anh Tu - Share to be share*
