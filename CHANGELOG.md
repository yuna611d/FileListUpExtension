# Change Log

## 0.2.0

### Added

- Add the `fileListUp.excludeDirectories` setting, which skips `node_modules`, `.git`, `.svn` and `.hg` by default. Searching a real project no longer produces tens of thousands of rows
- Add a folder button to the search path prompt, and pre-fill it with the first workspace folder, so an absolute path no longer has to be typed by hand

### Changed

- Rename the command to `fileListUp.listUpFileNameAndPath`. The old `extension.listUpFileNameAndPath` id still works, so existing keybindings are unaffected
- Skip a symbolic link only when it points at one of its own ancestors. Previously any directory already seen anywhere in the walk was skipped, so two different links to the same directory listed only one of them

### Fixed

- Fix the file list being interleaved with the existing text when the target document is not empty
- Fix an endless walk when a symbolic link points back into the directory being searched
- Fix file names containing `,`, `"` or a line break corrupting the generated CSV
- Keep searching when a single directory cannot be read, instead of stopping silently
- Search asynchronously with a progress notification and a cancel button, so VS Code no longer freezes on large directory trees
- Report an unusable search path, an empty result and a failed write instead of doing nothing
- Match the line ending of the document being written into
- Remove the unused `jshint` runtime dependency

### Breaking

- Require VS Code 1.90.0 or later (was 1.25.0)

### Development

- Replace the deprecated `vscode` package with `@types/vscode` and `@vscode/test-cli` / `@vscode/test-electron`, and drop the `postinstall` step it needed
- Replace tslint (deprecated) with ESLint 9 and typescript-eslint, carrying the previous rules over
- Compile with TypeScript 5 targeting ES2022, and enable `noUnusedParameters`, `noImplicitReturns` and `noFallthroughCasesInSwitch`
- Read directory entries with `withFileTypes`, removing one `lstat` call per entry
- Drop the `onCommand:` activation event, which VS Code generates automatically since 1.74
- Pin `serialize-javascript` to `^7.1.0` via `overrides`. mocha 10, which `@vscode/test-cli` requires, depends on version 6, which has open advisories; it is only used by mocha's parallel mode, which this project does not enable. The override can be dropped once `@vscode/test-cli` moves to mocha 11, which no longer depends on it.

## 0.1.2 and 0.1.3

- Fix internal problem

## 0.1.1

- Fix internal problem

## 0.1.0

- Initial release