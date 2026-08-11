//
// Note: This example test is leveraging the Mocha test framework.
// Please refer to their documentation on https://mochajs.org/ for help.
//

// The module 'assert' provides assertion methods from node
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { FileInfo, FileInfoService } from '../extension';

const noProgress: vscode.Progress<{ message?: string }> = { report: () => { /* nothing to do */ } };

function collect(rootDir: string, token?: vscode.CancellationToken) {
    let cancellationToken = token;
    if (cancellationToken === undefined) {
        cancellationToken = new vscode.CancellationTokenSource().token;
    }
    return new FileInfoService().collectFileList(rootDir, noProgress, cancellationToken);
}

function fileNames(files: FileInfo[]): string[] {
    return files.map(file => file.fileName).sort();
}

// Defines a Mocha test suite to group tests of similar kind together
suite("Extension Tests", function () {

    let root: string;
    let symlinksSupported = true;

    suiteSetup(function () {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "filelistup-test-"));

        fs.mkdirSync(path.join(root, "sub"));
        fs.mkdirSync(path.join(root, "sub", "deep"));
        fs.mkdirSync(path.join(root, "empty"));

        fs.writeFileSync(path.join(root, "plain.txt"), "x");
        fs.writeFileSync(path.join(root, "sub", "nested.txt"), "x");
        fs.writeFileSync(path.join(root, "sub", "deep", "deepest.txt"), "x");

        try {
            // A link pointing back at the root: walking it naively never terminates.
            fs.symlinkSync(root, path.join(root, "sub", "loop"), "dir");
            fs.symlinkSync(path.join(root, "plain.txt"), path.join(root, "link.txt"), "file");
            fs.symlinkSync(path.join(root, "missing"), path.join(root, "broken"), "file");
        } catch {
            // Creating symlinks needs elevated privileges on Windows.
            symlinksSupported = false;
        }
    });

    suiteTeardown(function () {
        // rm() removes the symlinks themselves, not what they point at.
        fs.rmSync(root, { recursive: true, force: true });
    });

    suite("getFormatedText", function () {

        const service = new FileInfoService();

        test("joins plain values with a comma", function () {
            assert.strictEqual(service.getFormatedText(["FileName", "FilePath"]), "FileName,FilePath");
        });

        test("quotes a value containing a comma", function () {
            assert.strictEqual(service.getFormatedText(["a,b", "/tmp/"]), '"a,b",/tmp/');
        });

        test("quotes a value containing a line break", function () {
            assert.strictEqual(service.getFormatedText(["a\nb"]), '"a\nb"');
        });

        test("quotes and doubles an embedded double quote", function () {
            assert.strictEqual(service.getFormatedText(['a"b']), '"a""b"');
        });

        test("leaves a value without special characters unquoted", function () {
            assert.strictEqual(service.getFormatedText(["readme.md"]), "readme.md");
        });
    });

    suite("getTargetDir", function () {

        const service = new FileInfoService();

        test("appends the platform separator", function () {
            assert.strictEqual(service.getTargetDir(path.join(path.sep, "a", "b")), path.join(path.sep, "a", "b") + path.sep);
        });

        test("does not append a second separator", function () {
            const withSeparator = path.join(path.sep, "a", "b") + path.sep;
            assert.strictEqual(service.getTargetDir(withSeparator), withSeparator);
        });
    });

    suite("collectFileList", function () {

        test("finds every file in the tree exactly once", async function () {
            const result = await collect(root);

            assert.strictEqual(result.cancelled, false);
            const expected = symlinksSupported
                ? ["deepest.txt", "link.txt", "nested.txt", "plain.txt"]
                : ["deepest.txt", "nested.txt", "plain.txt"];
            assert.deepStrictEqual(fileNames(result.files), expected);
        });

        test("terminates on a symlink loop", async function () {
            if (!symlinksSupported) {
                this.skip();
                return;
            }
            const result = await collect(root);

            const looped = result.files.filter(file => file.directory.indexOf("loop") !== -1);
            assert.deepStrictEqual(looped, [], "files below the symlink loop must not be reported");
        });

        test("reports a directory that cannot be read instead of throwing", async function () {
            const result = await collect(path.join(root, "does-not-exist"));

            assert.strictEqual(result.cancelled, false);
            assert.deepStrictEqual(result.files, []);
            assert.strictEqual(result.unreadableDirectoryCount, 1);
        });

        test("returns an empty result for an empty directory", async function () {
            const result = await collect(path.join(root, "empty"));

            assert.deepStrictEqual(result.files, []);
            assert.strictEqual(result.unreadableDirectoryCount, 0);
        });

        test("stops when cancellation is requested", async function () {
            const source = new vscode.CancellationTokenSource();
            source.cancel();

            const result = await collect(root, source.token);

            assert.strictEqual(result.cancelled, true);
            assert.deepStrictEqual(result.files, []);
        });
    });
});
