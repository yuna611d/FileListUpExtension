'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require("vscode");
const fs_1 = require("fs");
const util_1 = require("util");
const os = require("os");
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function activate(context) {
    console.log("File List Search is activated");
    let disposable = vscode.commands.registerCommand('extension.listUpFileNameAndPath', () => {
        let service = new FileInfoService();
        service.doService();
    });
    context.subscriptions.push(disposable);
}
exports.activate = activate;
// this method is called when your extension is deactivated
function deactivate() { }
exports.deactivate = deactivate;
class FileInfoService {
    constructor() {
        this.line = 0;
        this.searchPathInputBoxOptions = {
            prompt: "Input search path (absolute path)",
        };
    }
    doService() {
        vscode.window.showInputBox(this.searchPathInputBoxOptions).then(value => {
            console.log(`Search path is ${value}`);
            let editor = vscode.window.activeTextEditor;
            if (util_1.isNullOrUndefined(editor)) {
                return;
            }
            editor.edit((editBuilder) => {
                let targetPath = value;
                if (util_1.isNullOrUndefined(targetPath) || targetPath.length === 0) {
                    vscode.window.showInformationMessage("Sorry, I can't search this path...");
                    return;
                }
                let titleText = this.getFormatedText(["FileName", "FilePath"]);
                this.insertText(titleText, editBuilder);
                this.readAndWriteFileList(targetPath, "", editBuilder);
            });
        });
    }
    readAndWriteFileList(currentDir, nextDir, editBuilder) {
        let targetDir = this.getTargetDir(currentDir, nextDir);
        if (this.isExistFileOrDirectory(targetDir)) {
            console.log(`...file search in ${targetDir} is started`);
            let files = fs_1.readdirSync(targetDir);
            console.log(`...file search in ${targetDir} is finished`);
            if (util_1.isNullOrUndefined(files) || files.length === 0) {
                return;
            }
            this.writeFileList(files, targetDir, editBuilder);
        }
    }
    writeFileList(files, targetDir, editBuilder) {
        files.forEach(file => {
            let path = targetDir + file;
            if (this.isExistFileOrDirectory(path)) {
                let stat = fs_1.statSync(path);
                if (stat.isDirectory()) {
                    this.readAndWriteFileList(targetDir, file, editBuilder);
                }
                else if (stat.isFile()) {
                    let textData = this.getFormatedText([file, targetDir]);
                    this.insertText(textData, editBuilder);
                }
            }
        });
    }
    isExistFileOrDirectory(file) {
        try {
            fs_1.statSync(file);
        }
        catch (err) {
            return false;
        }
        return true;
    }
    getTargetDir(currentDir, nextDir) {
        let targetDir = currentDir;
        let separator = "";
        let osType = os.type();
        if (osType === 'Windows_NT') {
            separator = "\\";
        }
        else {
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
    getFormatedText(dataTexts) {
        let dataText = dataTexts.join(",");
        return dataText + "\n";
    }
    insertText(text, editBuilder) {
        editBuilder.insert(new vscode.Position(this.line++, 0), text);
        console.log(`Output is : ${text}`);
    }
}
exports.FileInfoService = FileInfoService;
//# sourceMappingURL=extension.js.map