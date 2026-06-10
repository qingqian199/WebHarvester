module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/*.test.ts"],
  collectCoverage: false,
  coverageDirectory: "coverage",
  moduleFileExtensions: ["ts", "js"],
  clearMocks: true,
  transform: {
    "^.+\\.ts$": ["ts-jest", {
      tsconfig: "tsconfig.jest.json",
    }],
  },
};
