'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import {
    statSync,
    readdirSync,
} from 'fs';
import {
    isNullOrUndefined
} from 'util';
import os = require('os');

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    console.log("File List Search is activated");

    let disposable = vscode.commands.registerCommand('extension.listUpFileNameAndPath', () => {
        let service = new FileInfoService();
        service.doService();
    });

    context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}

export class FileInfoService {

    private line = 0;

    public doService() {
        vscode.window.showInputBox(this.searchPathInputBoxOptions).then(value => {

            console.log(`Search path is ${value}`);

            let editor = vscode.window.activeTextEditor;
            if (isNullOrUndefined(editor)) {
                return;
            }
            editor.edit((editBuilder) => {

                let targetPath = value;
                if (isNullOrUndefined(targetPath) || targetPath.length === 0) {
                    vscode.window.showInformationMessage("Sorry, I can't search this path...");
                    return;
                }

                let titleText = this.getFormatedText(["FileName", "FilePath"]);
                this.insertText(titleText, editBuilder);


                this.readAndWriteFileList(targetPath, "", editBuilder);
            });

        });
    }

    protected readAndWriteFileList(currentDir: string, nextDir: string, editBuilder: vscode.TextEditorEdit) {
        let targetDir = this.getTargetDir(currentDir, nextDir);

        if (this.isExistFileOrDirectory(targetDir)) {

            console.log(`...file search in ${targetDir} is started`);
            let files = readdirSync(targetDir);
            console.log(`...file search in ${targetDir} is finished`);
            if (isNullOrUndefined(files) || files.length === 0) {
                return;
            }

            this.writeFileList(files, targetDir, editBuilder);
    }

    }

    protected writeFileList(files: string[], targetDir: string, editBuilder: vscode.TextEditorEdit) {
        files.forEach(file => {
            let path = targetDir + file;
            if (this.isExistFileOrDirectory(path)) {
                let stat = statSync(path);

                if (stat.isDirectory()) {
                    this.readAndWriteFileList(targetDir, file, editBuilder);
                } else if (stat.isFile()) {
                    let textData = this.getFormatedText([file, targetDir]);
                    this.insertText(textData, editBuilder);
                }
            }
        });
    }

    private isExistFileOrDirectory(file: string): boolean {
        try {
            statSync(file);
        } catch (err) {
            return false;
        }

        return true;
    }

    private searchPathInputBoxOptions: vscode.InputBoxOptions = {
        prompt: "Input search path (absolute path)",
    };


    protected getTargetDir(currentDir: string, nextDir: string): string {
        let targetDir = currentDir;
        let separator = "";

        let osType = os.type();
        if (osType === 'Windows_NT') {
            separator = "\\";
        } else {
            separator = "/";
        }

        if (!targetDir.endsWith(separator)) {
            targetDir = targetDir + separator;
        }
        if (nextDir !== "") {
            targetDir = targetDir + nextDir + separator;
        }

        return targetDir;
    }


    protected getFormatedText(dataTexts: string[]): string {        
        let dataText = dataTexts.join(",");
        return dataText + "\n";
    }

    protected insertText(text: string, editBuilder: vscode.TextEditorEdit): void {
        editBuilder.insert(new vscode.Position(this.line++, 0), text);
        console.log(`Output is : ${text}`);
    }

}