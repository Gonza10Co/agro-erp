/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  transform: {
    '^.+\\.(t|j)s$': [
      // require.resolve: el resolver de jest en el runner de CI (Linux) no
      // encontraba el paquete hoisted en la raíz del monorepo; Node sí.
      require.resolve('ts-jest'),
      {
        tsconfig: {
          module: 'commonjs',
          moduleResolution: 'node',
          esModuleInterop: false,
          allowSyntheticDefaultImports: true,
          resolvePackageJsonExports: false,
        },
      },
    ],
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};
