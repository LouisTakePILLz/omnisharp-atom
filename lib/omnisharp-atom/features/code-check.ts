import {OmniSharp, OmniSharpAtom} from "../../omnisharp.ts";
import * as _ from "lodash";
import {CompositeDisposable, Disposable} from "../../Disposable";
import {Observable, Subject} from "@reactivex/rxjs";
import {OmniManager} from "../../omni-sharp-server/omni";
import {dock} from "../atom/dock";
import {CodeCheckOutputWindow} from "../views/codecheck-output-pane-view";
import {reloadWorkspace} from "./reload-workspace";

class CodeCheck implements OmniSharpAtom.IFeature {
    private disposable: CompositeDisposable;
    private omni: OmniManager;

    public displayDiagnostics: OmniSharp.Models.DiagnosticLocation[] = [];
    public selectedIndex: number = 0;
    private scrollTop: number = 0;
    private _editorSubjects = new WeakMap<Atom.TextEditor, () => Observable<OmniSharp.Models.DiagnosticLocation[]>>();
    private _fullCodeCheck: Subject<any>;

    public activate(omni: OmniManager) {
        this.disposable = new CompositeDisposable();
        this.omni = omni;

        this._fullCodeCheck = new Subject<any>();
        this.disposable.add(this._fullCodeCheck);

        this.disposable.add(atom.commands.add("atom-workspace", "omnisharp-atom:next-diagnostic", () => {
            this.updateSelectedItem(this.selectedIndex + 1);
        }));

        this.disposable.add(atom.commands.add("atom-workspace", "omnisharp-atom:go-to-diagnostic", () => {
            if (this.displayDiagnostics[this.selectedIndex])
                omni.navigateTo(this.displayDiagnostics[this.selectedIndex]);
        }));

        this.disposable.add(atom.commands.add("atom-workspace", "omnisharp-atom:previous-diagnostic", () => {
            this.updateSelectedItem(this.selectedIndex - 1);
        }));

        this.disposable.add(atom.commands.add("atom-workspace", "omnisharp-atom:go-to-next-diagnostic", () => {
            this.updateSelectedItem(this.selectedIndex + 1);
            omni.navigateTo(this.displayDiagnostics[this.selectedIndex]);
        }));

        this.disposable.add(atom.commands.add("atom-workspace", "omnisharp-atom:go-to-previous-diagnostic", () => {
            this.updateSelectedItem(this.selectedIndex - 1);
            omni.navigateTo(this.displayDiagnostics[this.selectedIndex]);
        }));

        this.disposable.add(omni.eachEditor((editor, cd) => {
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
        /*this.disposable.add(omni.switchActiveEditor((editor, cd) => {
            cd.add(omni.whenEditorConnected(editor).subscribe(() => this.doCodeCheck(editor)));
        }));*/

        this.disposable.add(omni.diagnostics
            .subscribe(diagnostics => {
                this.displayDiagnostics = this.filterOnlyWarningsAndErrors(diagnostics);
            }));

        this.disposable.add(omni.diagnostics.subscribe(s => {
            this.scrollTop = 0;
            this.selectedIndex = 0;
        }));

        this.disposable.add(dock.addWindow("errors", "Errors & Warnings", CodeCheckOutputWindow, {
            scrollTop: () => this.scrollTop,
            setScrollTop: (scrollTop) => this.scrollTop = scrollTop,
            codeCheck: this
        }));

        let started = 0, finished = 0;
        this.disposable.add(Observable.combineLatest(
            omni.listener.packageRestoreStarted.map(x => started++),
            omni.listener.packageRestoreFinished.map(x => finished++),
            (s, f) => s === f)
            .filter(r => r)
            .debounceTime(2000)
            .subscribe(() => {
                started = 0;
                finished = 0;
                this.doFullCodeCheck();
            }));

        this.disposable.add(omni.listener.packageRestoreFinished.debounceTime(3000).subscribe(() => this.doFullCodeCheck()));
        this.disposable.add(atom.commands.add("atom-workspace", "omnisharp-atom:code-check", () => this.doFullCodeCheck()));

        this.disposable.add(this._fullCodeCheck
            .concatMap(() => reloadWorkspace.reloadWorkspace()
                .toArray()
                .concatMap(x => omni.solutions)
                .concatMap(solution => solution.whenConnected()
                    .do(() => solution.codecheck({ FileName: null })))
            )
            .subscribe());

        omni.registerConfiguration(solution => solution
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
        return this.omni.request(editor, solution => solution.codecheck({}));
    };

    public doCodeCheck(editor: Atom.TextEditor) {
        this._doCodeCheck(editor);
    }

    public required = true;
    public title = "Diagnostics";
    public description = "Support for diagnostic errors.";
}

export const codeCheck = new CodeCheck;
