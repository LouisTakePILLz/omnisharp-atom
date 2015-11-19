import {OmniSharp} from "../../omnisharp.ts";
import {OmniManager} from "../../omni-sharp-server/omni";
/*  tslint:disable:variable-name */
const Range = require("atom").Range;
/*  tslint:enable:variable-name */
import * as _ from "lodash";
import {CompositeDisposable} from "../../Disposable";
import {Observable} from "@reactivex/rxjs";
import {codeCheck} from "../features/code-check";

let _omni: OmniManager;

interface LinterError {
    type: string; // "error" | "warning"
    text?: string;
    html?: string;
    filePath?: string;
    range?: Range;
    [key: string]: any;
}

function getWordAt(str: string, pos: number) {
    const wordLocation = {
        start: pos,
        end: pos
    };

    if (str === undefined) {
        return wordLocation;
    }

    while (pos < str.length && /\W/.test(str[pos])) {
        ++pos;
    }

    const left = str.slice(0, pos + 1).search(/\W(?!.*\W)/);
    const right = str.slice(pos).search(/(\W|$)/);

    wordLocation.start = left + 1;
    wordLocation.end = wordLocation.start + right;

    return wordLocation;
}

function mapValues(editor: Atom.TextEditor, error: OmniSharp.Models.DiagnosticLocation): LinterError {
    const line = error.Line;
    const column = error.Column;
    const text = editor.lineTextForBufferRow(line);
    const wordLocation = getWordAt(text, column);
    const level = error.LogLevel.toLowerCase();

    return {
        type: level,
        text: `${error.Text} [${_omni.getFrameworks(error.Projects) }] `,
        filePath: editor.getPath(),
        line: line + 1,
        col: column + 1,
        range: new Range([line, wordLocation.start], [line, wordLocation.end])
    };
}

function showLinter() {
    _.each(document.querySelectorAll("linter-bottom-tab"), (element: HTMLElement) => element.style.display = "");
    _.each(document.querySelectorAll("linter-bottom-status"), (element: HTMLElement) => element.style.display = "");
    const panel = <HTMLElement>document.querySelector("linter-panel");
    if (panel)
        panel.style.display = "";
}

function hideLinter() {
    _.each(document.querySelectorAll("linter-bottom-tab"), (element: HTMLElement) => element.style.display = "none");
    _.each(document.querySelectorAll("linter-bottom-status"), (element: HTMLElement) => element.style.display = "none");
    const panel = <HTMLElement>document.querySelector("linter-panel");
    if (panel)
        panel.style.display = "none";
}

export function init() {
    const disposable = new CompositeDisposable();
    let cd: CompositeDisposable;
    disposable.add(atom.config.observe("omnisharp-atom.hideLinterInterface", hidden => {
        if (hidden) {
            cd = new CompositeDisposable();
            disposable.add(cd);

            // show linter buttons
            cd.add(_omni.activeEditor
                .filter(z => !z)
                .subscribe(showLinter));

            // hide linter buttons
            cd.add(_omni.activeEditor
                .filter(z => !!z)
                .subscribe(hideLinter));
        } else {
            if (cd) {
                disposable.remove(cd);
                cd.dispose();
            }
            showLinter();
        }
    }));

    return disposable;
}

export function setup(omni: OmniManager) {
    _omni = omni;
}

export const provider = [
    {
        get grammarScopes() { return _omni.grammars.map((x: any) => x.scopeName); },
        scope: "file",
        lintOnFly: true,
        lint: (editor: Atom.TextEditor) => {
            if (!_omni.isValidGrammar(editor.getGrammar())) return Promise.resolve([]);

            codeCheck.doCodeCheck(editor);
            const path = editor.getPath();
            return _omni.diagnostics
                .take(1)
                .mergeMap(x => x)
                .filter(z => z.FileName === path)
                .filter(z => z.LogLevel !== "Hidden")
                .map(error => mapValues(editor, error))
                .toArray()
                .toPromise();
        }
    }, {
        get grammarScopes() { return _omni.grammars.map((x: any) => x.scopeName); },
        scope: "project",
        lintOnFly: false,
        lint: (editor: Atom.TextEditor) => {
            if (!_omni.isValidGrammar(editor.getGrammar())) return Promise.resolve([]);

            return _omni.activeModel
                .mergeMap(x => Observable.from(x.diagnostics))
                .filter(z => z.LogLevel !== "Hidden")
                .map(error => mapValues(editor, error))
                .toArray()
                .toPromise();
        }
    }
];
