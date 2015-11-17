import {OmniSharp, OmniSharpAtom} from "../../omnisharp.ts";
import {CompositeDisposable, Disposable} from "../../Disposable";
import {Observable, Subject} from "@reactivex/rxjs";
import Omni from "../../omni-sharp-server/omni";
import {dock} from "../atom/dock";
import {FindWindow} from "../views/find-pane-view";

class FindUsages implements OmniSharpAtom.IFeature {
    private disposable: CompositeDisposable;
    private window: CompositeDisposable;
    public selectedIndex: number = 0;
    private scrollTop: number = 0;
    public usages: OmniSharp.Models.DiagnosticLocation[] = [];

    private _usagesSubject: Subject<boolean>;
    private _selectedSubject: Subject<boolean>;

    public observe: {
        find: Observable<OmniSharp.Models.DiagnosticLocation[]>;
        open: Observable<boolean>;
        reset: Observable<boolean>;
        usages: Observable<boolean>;
        selected: Observable<boolean>;
    };

    public activate() {
        this.disposable = new CompositeDisposable();

        const observable = Observable.merge(
            // Listen to find usages
            Omni.listener.findusages,
            // We also want find implementations, where we found more than one
            Omni.listener.findimplementations
                .filter(z => z.response.QuickFixes && z.response.QuickFixes.length > 1)
        )
            // For the UI we only need the qucik fixes.
            .map(z => <OmniSharp.Models.DiagnosticLocation[]>z.response.QuickFixes || [])
            .share();

        const usages = this._usagesSubject = new Subject<boolean>();
        const selected = this._selectedSubject = new Subject<boolean>();

        this.observe = {
            find: observable,
            // NOTE: We cannot do the same for find implementations because find implementation
            //      just goes to the item if only one comes back.
            open: Omni.listener.requests.filter(z => !z.silent && z.command === "findusages").map(() => true),
            reset: Omni.listener.requests.filter(z => !z.silent && (z.command === "findimplementations" || z.command === "findusages")).map(() => true),
            usages: Observable.from(usages),
            selected: Observable.from(selected),
        };

        this.disposable.add(Omni.addTextEditorCommand("omnisharp-atom:find-usages", () => {
            Omni.request(solution => solution.findusages({}));
        }));

        this.disposable.add(Omni.addTextEditorCommand("omnisharp-atom:go-to-implementation", () => {
            Omni.request(solution => solution.findimplementations({}));
        }));

        this.disposable.add(atom.commands.add("atom-workspace", "omnisharp-atom:next-usage", () => {
            this.updateSelectedItem(this.selectedIndex + 1);
        }));

        this.disposable.add(atom.commands.add("atom-workspace", "omnisharp-atom:go-to-usage", () => {
            if (this.usages[this.selectedIndex])
                Omni.navigateTo(this.usages[this.selectedIndex]);
        }));

        this.disposable.add(atom.commands.add("atom-workspace", "omnisharp-atom:previous-usage", () => {
            this.updateSelectedItem(this.selectedIndex - 1);
        }));

        this.disposable.add(atom.commands.add("atom-workspace", "omnisharp-atom:go-to-next-usage", () => {
            this.updateSelectedItem(this.selectedIndex + 1);
            if (this.usages[this.selectedIndex])
                Omni.navigateTo(this.usages[this.selectedIndex]);
        }));

        this.disposable.add(atom.commands.add("atom-workspace", "omnisharp-atom:go-to-previous-usage", () => {
            this.updateSelectedItem(this.selectedIndex - 1);
            if (this.usages[this.selectedIndex])
                Omni.navigateTo(this.usages[this.selectedIndex]);
        }));

        this.disposable.add(this.observe.find.subscribe(s => {
            this.usages = s;
            this._usagesSubject.next(true);
        }));

        this.disposable.add(Observable.merge(this.observe.find.map(z => true), this.observe.open.map(z => true)).subscribe(() => {
            this.ensureWindowIsCreated();
            dock.selectWindow("find");
        }));

        this.disposable.add(this.observe.reset.subscribe(() => {
            this.usages = [];
            this.scrollTop = 0;
            this.selectedIndex = 0;
            this._usagesSubject.next(true);
            this._selectedSubject.next(true);
        }));


        this.disposable.add(Omni.listener.findimplementations.subscribe((data) => {
            if (data.response.QuickFixes.length === 1) {
                Omni.navigateTo(data.response.QuickFixes[0]);
            }
        }));
    }

    private updateSelectedItem(index: number) {
        if (index < 0)
            index = 0;
        if (index >= this.usages.length)
            index = this.usages.length - 1;
        if (this.selectedIndex !== index) {
            this.selectedIndex = index;
            this._selectedSubject.next(true);
        }
    }

    private ensureWindowIsCreated() {
        if (!this.window) {
            this.window = new CompositeDisposable();
            const windowDisposable = dock.addWindow("find", "Find", FindWindow, {
                scrollTop: () => this.scrollTop,
                setScrollTop: (scrollTop: number) => this.scrollTop = scrollTop,
                findUsages: this
            }, {
                    priority: 2000,
                    closeable: true
                }, this.window);
            this.window.add(windowDisposable);
            this.window.add(Disposable.create(() => {
                this.disposable.remove(this.window);
                this.window = null;
            }));
            this.disposable.add(this.window);
        }
    }

    public dispose() {
        this.disposable.dispose();
    }

    public navigateToSelectedItem() {
        Omni.navigateTo(this.usages[this.selectedIndex]);
    }

    public required = true;
    public title = "Find Usages / Go To Implementations";
    public description = "Adds support to find usages, and go to implementations";
}
export const findUsages = new FindUsages;
