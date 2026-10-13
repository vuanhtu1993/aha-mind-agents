/**
 * @file fsrs.service.ts
 * @description Dịch vụ tính toán thuật toán FSRS v4 (Free Spaced Repetition Scheduler)
 *
 * Made by Anh Tu - Share to be share
 */

import { Injectable } from '@nestjs/common';
import {
  fsrs,
  generatorParameters,
  Rating,
  Grade,
  State,
  createEmptyCard,
  Card as FSRSCard,
  ReviewLog,
} from 'ts-fsrs';
import { FSRSCardState } from '../../../infra/database/schemas/vocab-card.schema';

@Injectable()
export class FSRSService {
  private readonly srsScheduler = fsrs(
    generatorParameters({
      request_retention: 0.9,
      maximum_interval: 365,
      enable_fuzz: true,
      enable_short_term: false,
    }),
  );

  /**
   * Khởi tạo trạng thái FSRS mặc định cho từ vựng mới lưu
   */
  public createInitialFSRSState(now: Date = new Date()): FSRSCardState {
    const empty = createEmptyCard(now);
    return {
      due: empty.due,
      stability: empty.stability,
      difficulty: empty.difficulty,
      elapsed_days: empty.elapsed_days,
      scheduled_days: empty.scheduled_days,
      reps: empty.reps,
      lapses: empty.lapses,
      state: empty.state,
      last_review: empty.last_review,
    };
  }

  /**
   * Chuyển đổi kết quả trắc nghiệm và độ trễ phản hồi thành điểm FSRS Rating (1: Again, 2: Hard, 3: Good, 4: Easy)
   */
  public calculateFSRSRating(isCorrect: boolean, responseTimeMs: number): Grade {
    if (!isCorrect) {
      return Rating.Again;
    }
    if (responseTimeMs < 3000) {
      return Rating.Easy;
    } else if (responseTimeMs <= 10000) {
      return Rating.Good;
    } else {
      return Rating.Hard;
    }
  }

  /**
   * Tính toán lần ôn tập tiếp theo dựa trên FSRS algorithm
   */
  public scheduleNextReview(
    currentState: FSRSCardState,
    rating: Grade,
    reviewDate: Date = new Date(),
  ): {
    updatedState: FSRSCardState;
    log: ReviewLog;
    rating: Grade;
  } {
    const empty = createEmptyCard(new Date(currentState.due));
    const card: FSRSCard = {
      ...empty,
      due: new Date(currentState.due),
      stability: currentState.stability,
      difficulty: currentState.difficulty,
      elapsed_days: currentState.elapsed_days,
      scheduled_days: currentState.scheduled_days,
      reps: currentState.reps,
      lapses: currentState.lapses,
      state: currentState.state as State,
      last_review: currentState.last_review ? new Date(currentState.last_review) : undefined,
    };

    const result = this.srsScheduler.next(card, reviewDate, rating);

    const updatedState: FSRSCardState = {
      due: result.card.due,
      stability: result.card.stability,
      difficulty: result.card.difficulty,
      elapsed_days: result.card.elapsed_days,
      scheduled_days: result.card.scheduled_days,
      reps: result.card.reps,
      lapses: result.card.lapses,
      state: result.card.state,
      last_review: result.card.last_review,
    };

    return {
      updatedState,
      log: result.log,
      rating,
    };
  }
}
