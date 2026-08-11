'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { Dirent } from 'fs';
import { readdir, realpath, stat } from 'fs/promises';
import * as path from 'path';

/** A single file discovered during the search. */
export interface FileInfo {
    fileName: string;
    /** Directory the file lives in, without a trailing separator. */
    directory: string;
}

/** Outcome of a directory walk. */
export interface SearchResult {
    files: FileInfo[];
    /** Directories skipped because they could not be read (permission denied, removed mid-walk, ...). */
    unreadableDirectoryCount: number;
    cancelled: boolean;
}

/** A directory queued for walking, paired with its resolved real path. */
interface PendingDirectory {
    dir: string;
    realPath: string;
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    console.log("File List Search is activated");

    const disposable = vscode.commands.registerCommand('extension.listUpFileNameAndPath', () => {
        const service = new FileInfoService();
        return service.doService();
    });

    context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}

export class FileInfoService {

    private static readonly HEADER: string[] = ["FileName", "FilePath"];

    private searchPathInputBoxOptions: vscode.InputBoxOptions = {
        prompt: "Input search path (absolute path)",
        ignoreFocusOut: true,
        validateInput: (value: string) => {
            const trimmed = value.trim();
            if (trimmed.length === 0) {
                return "Please input a search path.";
            }
            if (!path.isAbsolute(trimmed)) {
                return "Please input an absolute path.";
            }
            return undefined;
        },
    };

    public async doService(): Promise<void> {
        // Capture the editor before the input box opens so the listing always lands
        // in the document the user was looking at when they invoked the command.
        const editor = vscode.window.activeTextEditor;
        if (editor === undefined) {
            vscode.window.showInformationMessage("Please open a file to write the file list into.");
            return;
        }

        const value = await vscode.window.showInputBox(this.searchPathInputBoxOptions);
        if (value === undefined) {
            // The user dismissed the input box.
            return;
        }

        const targetDir = path.normalize(value.trim());
        console.log(`Search path is ${targetDir}`);

        if (!await this.isDirectory(targetDir)) {
            vscode.window.showInformationMessage(`Sorry, I can't search this path... : ${targetDir}`);
            return;
        }

        const result = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Listing up files in ${targetDir}`,
            cancellable: true,
        }, (progress, token) => this.collectFileList(targetDir, progress, token));

        if (result.cancelled) {
            vscode.window.showInformationMessage("Listing up files was cancelled.");
            return;
        }
        if (result.files.length === 0) {
            vscode.window.showInformationMessage(`No file was found in ${targetDir}`);
            return;
        }

        await this.writeFileList(editor, result.files);

        if (result.unreadableDirectoryCount > 0) {
            vscode.window.showWarningMessage(
                `${result.unreadableDirectoryCount} directories were skipped because they could not be read.`);
        }
    }

    /**
     * Walks `rootDir` depth first and collects every file underneath it.
     *
     * The walk is asynchronous and iterative on purpose: the previous synchronous
     * recursion froze the extension host for the whole search and overflowed the
     * call stack on deeply nested (or symlinked) trees.
     */
    public async collectFileList(
        rootDir: string,
        progress: vscode.Progress<{ message?: string }>,
        token: vscode.CancellationToken,
    ): Promise<SearchResult> {

        const files: FileInfo[] = [];
        let unreadableDirectoryCount = 0;

        const rootRealPath = await this.resolveRealPath(rootDir);
        if (rootRealPath === undefined) {
            return { files, unreadableDirectoryCount: 1, cancelled: false };
        }

        // Real paths of every directory already entered. Following a symlink that
        // points back at an ancestor would otherwise loop forever.
        const visitedRealPaths = new Set<string>([rootRealPath]);
        const stack: PendingDirectory[] = [{ dir: rootDir, realPath: rootRealPath }];

        while (stack.length > 0) {
            if (token.isCancellationRequested) {
                return { files, unreadableDirectoryCount, cancelled: true };
            }

            const current = stack.pop()!;

            let entries: Dirent[];
            try {
                // withFileTypes carries the entry kind, so no extra stat per entry.
                entries = await readdir(current.dir, { withFileTypes: true });
            } catch (err) {
                // One unreadable directory must not abort the whole search.
                console.log(`...cannot read ${current.dir} : ${err}`);
                unreadableDirectoryCount++;
                continue;
            }
            entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

            progress.report({ message: `${files.length} files found... (${current.dir})` });

            const subDirectories: PendingDirectory[] = [];

            for (const entry of entries) {
                if (entry.isFile()) {
                    files.push({ fileName: entry.name, directory: current.dir });
                } else if (entry.isDirectory()) {
                    // A real directory cannot introduce a cycle, so its real path is
                    // simply the parent's real path plus the entry name.
                    subDirectories.push({
                        dir: path.join(current.dir, entry.name),
                        realPath: path.join(current.realPath, entry.name),
                    });
                } else if (entry.isSymbolicLink()) {
                    const target = await this.resolveSymbolicLink(entry.name, current.dir, files);
                    if (target !== undefined) {
                        subDirectories.push(target);
                    }
                }
            }

            // Pushed in reverse so that popping yields the sorted order.
            for (let i = subDirectories.length - 1; i >= 0; i--) {
                const subDirectory = subDirectories[i];
                if (visitedRealPaths.has(subDirectory.realPath)) {
                    continue;
                }
                visitedRealPaths.add(subDirectory.realPath);
                stack.push(subDirectory);
            }
        }

        return { files, unreadableDirectoryCount, cancelled: false };
    }

    /**
     * Resolves a symlink. Links to files are appended to `files`; links to directories
     * are returned so the caller can queue them. Broken links are ignored.
     */
    private async resolveSymbolicLink(
        entryName: string,
        parentDir: string,
        files: FileInfo[],
    ): Promise<PendingDirectory | undefined> {

        const entryPath = path.join(parentDir, entryName);

        const resolved = await this.tryStat(entryPath);
        if (resolved === undefined) {
            // A broken link has no target to report.
            return undefined;
        }
        if (resolved.isFile()) {
            files.push({ fileName: entryName, directory: parentDir });
            return undefined;
        }
        if (!resolved.isDirectory()) {
            return undefined;
        }

        const realPath = await this.resolveRealPath(entryPath);
        if (realPath === undefined) {
            return undefined;
        }
        return { dir: entryPath, realPath };
    }

    /** Inserts the collected file list into the editor as CSV. */
    private async writeFileList(editor: vscode.TextEditor, files: FileInfo[]): Promise<void> {
        const eol = editor.document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";

        const lines = [this.getFormatedText(FileInfoService.HEADER)];
        for (const file of files) {
            lines.push(this.getFormatedText([file.fileName, this.getTargetDir(file.directory)]));
        }
        const text = lines.join(eol) + eol;

        // Positions handed to a TextEditorEdit are resolved against the document as it
        // was *before* the edit, so inserting line by line interleaved the listing with
        // the text already in the document. One insert keeps the listing contiguous.
        const position = editor.selection.active;
        let succeeded = false;
        try {
            succeeded = await editor.edit(editBuilder => editBuilder.insert(position, text));
        } catch (err) {
            console.log(`...cannot write into the editor : ${err}`);
        }

        if (!succeeded) {
            vscode.window.showErrorMessage("Failed to write the file list into the editor.");
        }
    }

    /** Returns `dir` with a trailing path separator. */
    public getTargetDir(dir: string): string {
        return dir.endsWith(path.sep) ? dir : dir + path.sep;
    }

    /** Joins the values into one CSV record (without a line break). */
    public getFormatedText(dataTexts: string[]): string {
        return dataTexts.map(dataText => this.escapeCsvField(dataText)).join(",");
    }

    /**
     * RFC 4180: a field containing a comma, a double quote or a line break must be
     * quoted, and embedded double quotes doubled. File names may legally contain all
     * three, which used to corrupt the generated CSV.
     */
    private escapeCsvField(value: string): string {
        if (/[",\r\n]/.test(value)) {
            return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
    }

    private async isDirectory(target: string): Promise<boolean> {
        const stats = await this.tryStat(target);
        return stats !== undefined && stats.isDirectory();
    }

    /** stat() follows symlinks; undefined when the target cannot be reached. */
    private async tryStat(target: string) {
        try {
            return await stat(target);
        } catch {
            return undefined;
        }
    }

    private async resolveRealPath(target: string): Promise<string | undefined> {
        try {
            return await realpath(target);
        } catch {
            return undefined;
        }
    }

}
