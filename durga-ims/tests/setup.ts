import { afterEach, vi } from "vitest";

// Restore any mocked system time after each test
afterEach(() => {
  vi.useRealTimers();
});
