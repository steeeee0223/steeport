import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/', 'playwright-report/', 'test-results/'] },
  {
    files: ['**/*.ts'],
    extends: [
      tseslint.configs.recommendedTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
)
