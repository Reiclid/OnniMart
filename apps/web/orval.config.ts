import { defineConfig } from 'orval';

export default defineConfig({
  onnimart: {
    input: {
      // Без запущеного API: OPENAPI_SPEC=../api/openapi.json (див. apps/api/scripts/generate-openapi.ts)
      target: process.env.OPENAPI_SPEC ?? 'http://localhost:3001/api/docs-json',
    },
    output: {
      mode: 'tags-split',
      target: 'src/api/generated',
      schemas: 'src/api/generated/model',
      client: 'fetch',
      httpClient: 'fetch',
      // Адресу API додає customFetch з API_URL (див. src/api/custom-fetch.ts)
      baseUrl: '',
      clean: true,
      override: {
        mutator: {
          path: './src/api/custom-fetch.ts',
          name: 'customFetch',
        },
      },
    },
  },
});
