/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  mutate: [
    'src/http/app.ts',
    'src/http/validation.ts',
    'src/importer/discogs-importer.ts',
    'src/importer/mappers.ts',
    'src/repositories/import-repository.ts',
    'src/repositories/records-repository.ts',
  ],
  testRunner: 'tap',
  incremental: true,
  concurrency: 4,
  ignoreStatic: true,
  checkers: ['typescript'],
  tsconfigFile: 'tsconfig.json',
  coverageAnalysis: 'perTest',
  reporters: ['clear-text', 'progress'],
  thresholds: {
    high: 100,
    low: 100,
    break: 100,
  },
  tap: {
    testFiles: [
      'test/validation.test.ts',
      'test/mappers.test.ts',
      'test/records-repository.test.ts',
      'test/importer.test.ts',
      'test/api.test.ts',
    ],
    nodeArgs: ['--test-reporter=tap', '--import', 'tsx'],
    forceBail: true,
  },
};

export default config;
