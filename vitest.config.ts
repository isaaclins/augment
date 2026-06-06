import { defineConfig } from "vitest/config";

// Vitest runs the pure-logic layers (Gmail parsing, the sanitizer, the rules
// engine) in a jsdom environment so DOMPurify has a real DOM to work against.
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    globals: false,
  },
});
