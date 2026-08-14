# Node Error Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure that failed pipeline steps explicitly pass their `stepId` in failure events so that timeline logs and MongoDB error records capture the exact failing node name.

**Architecture:** Maintain `activeStepId` state inside pipeline RxJS `Observable` execution loops (`text.pipeline.ts`, `youtube.pipeline.ts`). Include `stepId: activeStepId` in `subscriber.next({ stepId, status: 'failed', message })`. Format `finalError` in `AgentsController` as `{ failedNode, message }`.

**Tech Stack:** NestJS, RxJS, LangGraph, MongoDB.

---

### Task 1: Update Pipelines to Track Active Step and Emit `stepId` on Failure

**Files:**
- Modify: `src/plugins/story-shadowing/pipelines/text.pipeline.ts:43-97`
- Modify: `src/plugins/story-shadowing/pipelines/youtube.pipeline.ts:42-94`

- [ ] **Step 1: Update `text.pipeline.ts`**

Update `execute()` in `src/plugins/story-shadowing/pipelines/text.pipeline.ts`:
```typescript
      let activeStepId = 'sentenceSplitter';

      const runPipeline = async () => {
        try {
          const heartbeatInterval = setInterval(() => {
            subscriber.next({ status: 'running', message: 'Heartbeat ping' });
          }, 15000);

          const finalState: Partial<StoryShadowingStateType> = {
            rawText: input.text,
            voice: input.voice || 'FEMALE',
            config: context.config,
          };
          
          for await (const chunk of await app.stream(finalState)) {
            if (chunk.sentenceSplitter) {
              activeStepId = 'sentenceSplitter';
              Object.assign(finalState, chunk.sentenceSplitter);
              if (finalState.error) break;
              subscriber.next({ stepId: 'sentenceSplitter', status: 'completed', progress: 30, message: 'Đã phân tách câu và IPA' });
            }
            if (chunk.ttsGenerator) {
              activeStepId = 'ttsGenerator';
              Object.assign(finalState, chunk.ttsGenerator);
              if (finalState.error) break;
              subscriber.next({ stepId: 'ttsGenerator', status: 'completed', progress: 80, message: 'Hoàn thành tổng hợp âm thanh TTS' });
            }
            if (chunk.keywordIdentifier) {
              activeStepId = 'keywordIdentifier';
              Object.assign(finalState, chunk.keywordIdentifier);
              if (finalState.error) break;
              subscriber.next({ stepId: 'keywordIdentifier', status: 'completed', progress: 50, message: 'Đã trích xuất từ vựng khó' });
            }
            if (chunk.keywordEnricher) {
              activeStepId = 'keywordEnricher';
              Object.assign(finalState, chunk.keywordEnricher);
              if (finalState.error) break;
              subscriber.next({ stepId: 'keywordEnricher', status: 'completed', progress: 95, message: 'Hoàn thành giải nghĩa từ vựng' });
            }
          }

          clearInterval(heartbeatInterval);

          if (finalState.error) {
            throw new Error(finalState.error);
          }

          subscriber.next({ 
            status: 'done', 
            progress: 100, 
            message: 'Hoàn thành toàn bộ Text Pipeline', 
            payload: finalState 
          });
          subscriber.complete();
        } catch (error: any) {
          subscriber.next({ stepId: activeStepId, status: 'failed', message: `Lỗi tại node [${activeStepId}]: ${error.message}` });
          subscriber.complete();
        }
      };
```

- [ ] **Step 2: Update `youtube.pipeline.ts`**

Update `execute()` in `src/plugins/story-shadowing/pipelines/youtube.pipeline.ts`:
```typescript
      let activeStepId = 'youtubeFetcher';

      const runPipeline = async () => {
        try {
          const heartbeatInterval = setInterval(() => {
            subscriber.next({ status: 'running', message: 'Heartbeat ping' });
          }, 15000);

          const finalState: Partial<StoryShadowingStateType> = {
            youtubeUrl: input.youtubeUrl,
            config: context.config,
          };
          
          for await (const chunk of await app.stream(finalState)) {
            if (chunk.youtubeFetcher) {
              activeStepId = 'youtubeFetcher';
              Object.assign(finalState, chunk.youtubeFetcher);
              if (finalState.error) break;
              subscriber.next({ stepId: 'youtubeFetcher', status: 'completed', progress: 30, message: 'Đã tải phụ đề từ YouTube' });
            }
            if (chunk.youtubeConsolidator) {
              activeStepId = 'youtubeConsolidator';
              Object.assign(finalState, chunk.youtubeConsolidator);
              if (finalState.error) break;
              subscriber.next({ stepId: 'youtubeConsolidator', status: 'completed', progress: 50, message: 'Đã gộp câu và phiên âm IPA' });
            }
            if (chunk.keywordIdentifier) {
              activeStepId = 'keywordIdentifier';
              Object.assign(finalState, chunk.keywordIdentifier);
              if (finalState.error) break;
              subscriber.next({ stepId: 'keywordIdentifier', status: 'completed', progress: 75, message: 'Đã trích xuất từ vựng khó' });
            }
            if (chunk.keywordEnricher) {
              activeStepId = 'keywordEnricher';
              Object.assign(finalState, chunk.keywordEnricher);
              if (finalState.error) break;
              subscriber.next({ stepId: 'keywordEnricher', status: 'completed', progress: 95, message: 'Hoàn thành giải nghĩa từ vựng' });
            }
          }

          clearInterval(heartbeatInterval);

          if (finalState.error) {
            throw new Error(finalState.error);
          }

          subscriber.next({ 
            status: 'done', 
            progress: 100, 
            message: 'Hoàn thành toàn bộ YouTube Pipeline', 
            payload: finalState 
          });
          subscriber.complete();
        } catch (error: any) {
          subscriber.next({ stepId: activeStepId, status: 'failed', message: `Lỗi tại node [${activeStepId}]: ${error.message}` });
          subscriber.complete();
        }
      };
```

---

### Task 2: Update `AgentsController` to Format Error Object with Failed Node

**Files:**
- Modify: `src/api/agents/agents.controller.ts:167-172`

- [ ] **Step 1: Update `finalError` assignment in `AgentsController`**

```typescript
        // Bắt trạng thái lỗi nếu step phát ra status failed
        if (event.status === 'failed') {
          finalStatus = 'failed';
          finalError = {
            failedNode: event.stepId || 'unknown_node',
            message: event.message || 'Pipeline execution failed',
          };
        }
```

- [ ] **Step 2: Verify Build**

Run: `pnpm build`
Expected: Success with 0 errors.

---
*Made by Anh Tu - Share to be share*
