/**
 * @file cert-crawler.constants.ts
 * @description Các hằng số định danh và điều phối tải cho Cert Crawler
 *
 * Made by Anh Tu - Share to be share
 */

export const CERT_CRAWLER_QUEUE = 'cert-crawler';
export const CRAWL_QUESTION_JOB = 'crawl-question';
export const HOCCUNGSUSHI_BASE_URL = 'https://hoccungsushi.com';

export const DEFAULT_CRAWLER_SOURCE = 'hoccungsushi.com';
export const CERT_COOLDOWN_PREFIX = 'cert_crawler:cooldown';
export const DEFAULT_COOLDOWN_DURATION_MS = 60 * 60 * 1000; // 60 phút

export const CERT_BATCH_SIZE = 20;
export const CERT_BATCH_DELAY_MS = 250;
export const CERT_JOB_ATTEMPTS = 5;
export const CERT_JOB_BACKOFF_DELAY_MS = 5000;
