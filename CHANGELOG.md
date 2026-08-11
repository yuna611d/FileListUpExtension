# Change Log

## Unreleased

- Fix the file list being interleaved with the existing text when the target document is not empty
- Fix an endless walk when a symbolic link points back into the directory being searched
- Fix file names containing `,`, `"` or a line break corrupting the generated CSV
- Keep searching when a single directory cannot be read, instead of stopping silently
- Search asynchronously with a progress notification and a cancel button, so VS Code no longer freezes on large directory trees
- Report an unusable search path, an empty result and a failed write instead of doing nothing
- Match the line ending of the document being written into
- Remove the unused `jshint` runtime dependency

## 0.1.2 and 0.1.3

- Fix internal problem

## 0.1.1

- Fix internal problem

## 0.1.0

- Initial release