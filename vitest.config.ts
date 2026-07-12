import 'dotenv/config'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['node_modules', '.next'],
    // Integration tests share a single Postgres database and truncate tables
    // between tests — file-level parallelism would race those truncations.
    fileParallelism: false,
  },
})
