import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
    files: 'out/test/**/*.test.js',
    mocha: {
        // extension.test.ts uses suite()/test() rather than describe()/it().
        ui: 'tdd',
        timeout: 20000,
    },
});
