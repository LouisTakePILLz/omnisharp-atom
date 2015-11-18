import {OmniSharp, OmniSharpAtom} from "../../omnisharp.ts";
import * as _ from "lodash";
import {CompositeDisposable, Disposable} from "../../Disposable";
import {Observable, Subject} from "@reactivex/rxjs";
import Omni from "../../omni-sharp-server/omni";
import {dock} from "../atom/dock";
import {CodeCheckOutputWindow} from "../views/codecheck-output-pane-view";
import {reloadWorkspace} from "./reload-workspace";

class CodeCheck implements OmniSharpAtom.IFeature {
    private disposable: CompositeDisposable;

    public displayDiagnostics: OmniSharp.Models.DiagnosticLocation[] = [];
    public selectedIndex: number = 0;
    private scrollTop: number = 0;
    private _editorSubjects = new WeakMap<Atom.TextEditor, () => Observable<OmniSharp.Models.DiagnosticLocation[]>>();
    private _fullCodeCheck: Subject<any>;

    public activate() {
        this.disposable = new CompositeDisposable();

        this._fullCodeCheck = new Subject<any>();
        this.disposable.add(this._fullCodeCheck);

        this.disposable.add(atom.commands.add("atom-workspace", "omnisharp-atom:next-diagnostic", () => {
            this.updateSelectedItem(this.selectedIndex + 1);
        }));

        this.disposable.add(atom.commands.add("atom-workspace", "omnisharp-atom:go-to-diagnostic", () => {
            if (this.displayDiagnostics[this.selectedIndex])
                Omni.navigateTo(this.displayDiagnostics[this.selectedIndex]);
        }));

        this.disposable.add(atom.commands.add("atom-workspace", "omnisharp-atom:previous-diagnostic", () => {
            this.updateSelectedItem(this.selectedIndex - 1);
        }));

        this.disposable.add(atom.commands.add("atom-workspace", "omnisharp-atom:go-to-next-diagnostic", () => {
            this.updateSelectedItem(this.selectedIndex + 1);
            Omni.navigateTo(this.displayDiagnostics[this.selectedIndex]);
        }));

        this.disposable.add(atom.commands.add("atom-workspace", "omnisharp-atom:go-to-previous-diagnostic", () => {
            this.updateSelectedItem(this.selectedIndex - 1);
            Omni.navigateTo(this.displayDiagnostics[this.selectedIndex]);
        }));

        this.disposable.add(Omni.eachEditor((editor, cd) => {
            const subject = new Subject<any>();

            const o = subject
                .debounceTime(500)
                .filter(() => !editor.isDestroyed())
                .mergeMap(() => this._doCodeCheck(editor))
                .map(response => response.QuickFixes || [])
                .share();

            this._editorSubjects.set(editor, () => {
                const result = o.take(1);
                subject.next(null);
                return result;
            });

            cd.add(o.subscribe());

            cd.add(editor.getBuffer().onDidSave(() => !subject.isUnsubscribed && subject.next(null)));
            cd.add(editor.getBuffer().onDidReload(() => !subject.isUnsubscribed && subject.next(null)));
            cd.add(editor.getBuffer().onDidStopChanging(() => !subject.isUnsubscribed && subject.next(null)));
            cd.add(Disposable.create(() => this._editorSubjects.delete(editor)));
        }));

        // Linter is doing this for us!
        /*this.disposable.add(Omni.switchActiveEditor((editor, cd) => {
            cd.add(Omni.whenEditorConnected(editor).subscribe(() => this.doCodeCheck(editor)));
        }));*/

        this.disposable.add(Omni.diagnostics
            .subscribe(diagnostics => {
                this.displayDiagnostics = this.filterOnlyWarningsAndErrors(diagnostics);
            }));

        this.disposable.add(Omni.diagnostics.subscribe(s => {
            this.scrollTop = 0;
            this.selectedIndex = 0;
        }));

        this.disposable.add(dock.addWindow("errors", "Errors & Warnings", CodeCheckOutputWindow, {
            scrollTop: () => this.scrollTop,
            setScrollTop: (scrollTop) => this.scrollTop = scrollTop,
            codeCheck: this
        }));

        const started = 0, finished = 0;
        this.disposable.add(Observable.combineLatest(
            Omni.listener.packageRestoreStarted.map(x => started++),
            Omni.listener.packageRestoreFinished.map(x => finished++),
            (s, f) => s === f)
            .filter(r => r)
            .debounceTime(2000)
            .subscribe(() => {
                started = 0;
                finished = 0;
                this.doFullCodeCheck();
            }));

        this.disposable.add(Omni.listener.packageRestoreFinished.debounceTime(3000).subscribe(() => this.doFullCodeCheck()));
        this.disposable.add(atom.commands.add("atom-workspace", "omnisharp-atom:code-check", () => this.doFullCodeCheck()));

        this.disposable.add(this._fullCodeCheck
            .concatMap(() => reloadWorkspace.reloadWorkspace()
                .toArray()
                .concatMap(x => Omni.solutions)
                .concatMap(solution => solution.whenConnected()
                    .do(() => solution.codecheck({ FileName: null })))
            )
            .subscribe());

        Omni.registerConfiguration(solution => solution
            .whenConnected()
            .delay(1000)
            .subscribe(() => this._fullCodeCheck.next(true)));
    }

    public doFullCodeCheck() {
        this._fullCodeCheck.next(true);
    }

    private filterOnlyWarningsAndErrors(quickFixes): OmniSharp.Models.DiagnosticLocation[] {
        return _.filter(quickFixes, (quickFix: OmniSharp.Models.DiagnosticLocation) => {
            return quickFix.LogLevel !== "Hidden";
        });
    }

    private updateSelectedItem(index: number) {
        if (index < 0)
            index = 0;
        if (index >= this.displayDiagnostics.length)
            index = this.displayDiagnostics.length - 1;
        if (this.selectedIndex !== index)
            this.selectedIndex = index;
    }

    public dispose() {
        this.disposable.dispose();
    }

    private _doCodeCheck(editor: Atom.TextEditor) {
        return Omni.request(editor, solution => solution.codecheck({}));
    };

    public doCodeCheck(editor: Atom.TextEditor) {
        this._doCodeCheck(editor);
    }

    public required = true;
    public title = "Diagnostics";
    public description = "Support for diagnostic errors.";
}

export const codeCheck = new CodeCheck;
