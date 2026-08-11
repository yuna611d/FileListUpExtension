import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: ['out/**', '.vscode-test/**'],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['src/**/*.ts'],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            // Carried over from the tslint configuration this replaces.
            'curly': 'error',
            'eqeqeq': 'error',
            'semi': 'error',
            'no-throw-literal': 'error',
            '@typescript-eslint/no-unused-expressions': 'error',
            '@typescript-eslint/naming-convention': [
                'error',
                { selector: 'class', format: ['PascalCase'] },
                { selector: 'interface', format: ['PascalCase'] },
            ],
        },
    },
);
