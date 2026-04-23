/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  mutate: [
    'src/db/copy.ts',
    'src/http/validation.ts',
    'src/importer/mappers.ts',
  ],
  testRunner: 'tap',
  checkers: ['typescript'],
  tsconfigFile: 'tsconfig.json',
  coverageAnalysis: 'perTest',
  reporters: ['clear-text', 'html', 'progress'],
  thresholds: {
    high: 90,
    low: 80,
    break: 75,
  },
  tap: {
    testFiles: [
      'test/api.test.ts',
      'test/db-copy.test.ts',
      'test/importer.test.ts',
      'test/mappers.test.ts',
      'test/validation.test.ts',
    ],
    nodeArgs: ['--test-reporter=tap', '--import', 'tsx'],
    forceBail: true,
  },
};

export default config;
