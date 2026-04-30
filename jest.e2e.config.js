module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.e2e.test.ts"],
  testTimeout: 30000,
  verbose: true,
};
