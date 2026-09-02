import { defineConfig } from 'orval';

export default defineConfig({
  onnimart: {
    input: {
      target: 'http://localhost:3001/api/docs-json',
    },
    output: {
      mode: 'tags-split',
      target: 'src/api/generated',
      schemas: 'src/api/generated/model',
      client: 'fetch',
      httpClient: 'fetch',
      baseUrl: 'http://localhost:3001',
      override: {
        mutator: {
          path: './src/api/custom-fetch.ts',
          name: 'customFetch',
        },
      },
    },
  },
});