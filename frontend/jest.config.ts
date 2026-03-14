export default {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  testEnvironmentOptions: {
    customExportConditions: ["node", "require", "default"],
  },
  setupFiles: ["<rootDir>/jest.polyfills.js"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "\\.(css|less|scss|sass)$": "<rootDir>/src/mocks/styleMock.js",
    "^until-async$": "<rootDir>/src/mocks/until-async.cjs",
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testMatch: ["<rootDir>/src/__tests__/**/*.test.{ts,tsx}"],
  collectCoverageFrom: [
    "src/hooks/useCart.ts",
    "src/hooks/useFaceSearch.ts",
    "src/hooks/useCheckout.ts",
    "src/hooks/useDownloadInfo.ts",
    "src/hooks/useAsync.ts",
    "src/lib/api-client.ts",
    "src/pages/frontend/Results.tsx",
    "src/pages/frontend/Checkout.tsx",
  ],
  coverageThreshold: {
    global: { branches: 40, functions: 45, lines: 50 },
  },
  transform: {
    "^.+\\.tsx?$": "<rootDir>/jest-meta-transform.cjs",
  },
};
