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

import { FileInfo, FileInfoService, SearchOptions } from '../extension';

const noProgress: vscode.Progress<{ message?: string }> = { report: () => { /* nothing to do */ } };

function collect(rootDir: string, options?: Partial<SearchOptions>, token?: vscode.CancellationToken) {
    const searchOptions: SearchOptions = {
        excludeDirectories: options?.excludeDirectories ?? new Set<string>(),
    };
    const cancellationToken = token ?? new vscode.CancellationTokenSource().token;
    return new FileInfoService().collectFileList(rootDir, searchOptions, noProgress, cancellationToken);
}

function fileNames(files: FileInfo[]): string[] {
    return files.map(file => file.fileName).sort();
}

function makeTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "filelistup-test-"));
}

// Defines a Mocha test suite to group tests of similar kind together
suite("Extension Tests", function () {

    let root: string;
    let symlinksSupported = true;

    suiteSetup(function () {
        root = makeTempDir();

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

        test("finds every file in the tree", async function () {
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

        test("does not descend into an excluded directory name", async function () {
            const result = await collect(root, { excludeDirectories: new Set(["sub"]) });

            const expected = symlinksSupported ? ["link.txt", "plain.txt"] : ["plain.txt"];
            assert.deepStrictEqual(fileNames(result.files), expected);
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

            const result = await collect(root, undefined, source.token);

            assert.strictEqual(result.cancelled, true);
            assert.deepStrictEqual(result.files, []);
        });
    });

    suite("collectFileList with duplicated symlinks", function () {

        let linkRoot: string;
        let supported = true;

        suiteSetup(function () {
            linkRoot = makeTempDir();
            fs.mkdirSync(path.join(linkRoot, "shared"));
            fs.writeFileSync(path.join(linkRoot, "shared", "shared.txt"), "x");
            try {
                fs.symlinkSync(path.join(linkRoot, "shared"), path.join(linkRoot, "linkA"), "dir");
                fs.symlinkSync(path.join(linkRoot, "shared"), path.join(linkRoot, "linkB"), "dir");
            } catch {
                supported = false;
            }
        });

        suiteTeardown(function () {
            fs.rmSync(linkRoot, { recursive: true, force: true });
        });

        test("lists a directory reached through two different links once per path", async function () {
            if (!supported) {
                this.skip();
                return;
            }
            const result = await collect(linkRoot);

            // Only ancestors are skipped, so neither link hides the other.
            const directories = result.files.map(file => path.basename(file.directory)).sort();
            assert.deepStrictEqual(directories, ["linkA", "linkB", "shared"]);
        });
    });

    suite("writeFileList", function () {

        const directory = path.join(path.sep, "a", "b");
        const expectedPath = directory + path.sep;
        const files: FileInfo[] = [
            { fileName: "a.txt", directory },
            { fileName: "b.txt", directory },
        ];

        teardown(async function () {
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        });

        test("does not interleave the listing with the existing lines", async function () {
            const doc = await vscode.workspace.openTextDocument({ content: "first\nsecond\nthird\n" });
            const editor = await vscode.window.showTextDocument(doc);
            // Cursor at the start of the second line. The pre-0.2.0 implementation
            // inserted each row at Position(n, 0), which scattered the listing
            // between the lines already in the document.
            const cursor = new vscode.Position(1, 0);
            editor.selection = new vscode.Selection(cursor, cursor);

            await new FileInfoService().writeFileList(editor, files);

            assert.deepStrictEqual(editor.document.getText().split("\n"), [
                "first",
                "FileName,FilePath",
                `a.txt,${expectedPath}`,
                `b.txt,${expectedPath}`,
                "second",
                "third",
                "",
            ]);
        });

        test("uses the line ending of the document it writes into", async function () {
            const doc = await vscode.workspace.openTextDocument({ content: "" });
            const editor = await vscode.window.showTextDocument(doc);
            await editor.edit(editBuilder => editBuilder.setEndOfLine(vscode.EndOfLine.CRLF));

            await new FileInfoService().writeFileList(editor, [files[0]]);

            assert.strictEqual(
                editor.document.getText(),
                `FileName,FilePath\r\na.txt,${expectedPath}\r\n`);
        });
    });
});
