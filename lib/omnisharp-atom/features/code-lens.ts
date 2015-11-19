import {OmniSharp, OmniSharpAtom} from "../../omnisharp.ts";
import * as _ from "lodash";
import {CompositeDisposable, Disposable, IDisposable} from "../../Disposable";
import {Observable, Subject, Scheduler} from "@reactivex/rxjs";
import {OmniManager} from "../../omni-sharp-server/omni";
import {read, write} from "fastdom";

interface IDecoration {
    destroy(): void;
    getMarker(): Atom.Marker;
    getProperties(): any;
    setProperties(props: any): void;
}

class CodeLens implements OmniSharpAtom.IFeature {
    private disposable: CompositeDisposable;
    private omni: OmniManager;
    private decorations = new WeakMap<Atom.TextEditor, Set<Lens>>();

    public activate(omni: OmniManager) {
        this.disposable = new CompositeDisposable();
        this.omni = omni;

        this.disposable.add(omni.eachEditor((editor, cd) => {
            cd.add(Disposable.create(() => {
                const markers = this.decorations.get(editor);

                if (markers) {
                    markers.forEach(marker => marker.dispose());
                }

                this.decorations.delete(editor);
            }));

            cd.add(atom.config.observe("editor.fontSize", (size: number) => {
                const decorations = this.decorations.get(editor);
                const lineHeight = editor.getLineHeightInPixels();
                if (decorations && lineHeight) {
                    decorations.forEach(decoration => decoration.updateTop(lineHeight));
                }
            }));
        }));

        this.disposable.add(omni.switchActiveEditor((editor, cd) => {
            const items = this.decorations.get(editor);
            if (!items) this.decorations.set(editor, new Set<Lens>());

            const subject = new Subject<boolean>();

            cd.add(subject
                .filter(x => !!x && !editor.isDestroyed())
                .distinctUntilChanged(x => !!x)
                .debounceTime(500)
                .switchMap(() => this.updateCodeLens(editor))
                .subscribe()
            );

            const bindDidChange = function() {
                const didChange = editor.getBuffer().onDidChange(() => {
                    didChange.dispose();
                    cd.remove(didChange);

                    subject.next(false);
                });

                cd.add(didChange);
            };

            cd.add(editor.getBuffer().onDidStopChanging(_.debounce(() => {
                if (!subject.isUnsubscribed) {
                    subject.next(true);
                }
                bindDidChange();
            }, 5000)));

            cd.add(editor.getBuffer().onDidSave(() => !subject.isUnsubscribed && subject.next(true)));
            cd.add(editor.getBuffer().onDidReload(() => !subject.isUnsubscribed && subject.next(true)));
            cd.add(omni.whenEditorConnected(editor).subscribe(() => subject.next(true)));

            cd.add(editor.onDidChangeScrollTop(() => this.updateDecoratorVisiblility(editor)));

            cd.add(atom.commands.onWillDispatch((event: Event) => {
                if (_.contains(["omnisharp-atom:toggle-dock", "omnisharp-atom:show-dock", "omnisharp-atom:hide-dock"], event.type)) {
                    this.updateDecoratorVisiblility(editor);
                }
            }));

            cd.add(subject);
            this.updateDecoratorVisiblility(editor);
        }));
    }

    public updateDecoratorVisiblility(editor: Atom.TextEditor) {
        if (!this.decorations.has(editor)) this.decorations.set(editor, new Set<Lens>());
        const decorations = this.decorations.get(editor);
        decorations.forEach(decoration => decoration.updateVisible());
    }

    public dispose() {
        this.disposable.dispose();
    }

    public updateCodeLens(editor: Atom.TextEditor) {
        if (!this.decorations.has(editor)) this.decorations.set(editor, new Set<Lens>());
        const decorations = this.decorations.get(editor);
        const updated = new WeakSet<Lens>();

        if (editor.isDestroyed()) {
            return Observable.empty<number>();
        }

        return this.omni.request(editor, solution => solution.currentfilemembersasflat({ Buffer: null, Changes: null }))
            .observeOn(Scheduler.nextTick)
            .filter(fileMembers => !!fileMembers)
            .mergeMap(fileMembers => Observable.from(fileMembers))
            .concatMap(fileMember => {
                const range: TextBuffer.Range = <any>editor.getBuffer().rangeForRow(fileMember.Line, false);
                const marker: Atom.Marker = (<any>editor).markBufferRange(range, { invalidate: "inside" });

                const iteratee = decorations.values();
                let decoration = iteratee.next();
                let lens: Lens;
                while (!decoration.done) {
                    if (decoration.value.isEqual(marker)) {
                        lens = decoration.value;
                        break;
                    }
                    decoration = iteratee.next();
                }

                if (lens) {
                    updated.add(lens);
                    lens.invalidate();
                } else {
                    lens = new Lens(this.omni, editor, fileMember, marker, range, Disposable.create(() => {
                        decorations.delete(lens);
                    }));
                    updated.add(lens);
                    decorations.add(lens);
                }

                return lens.updateVisible();
            })
            .do({
                complete: () => {
                    // Remove all old/missing decorations
                    decorations.forEach(lens => {
                        if (lens && !updated.has(lens)) {
                            lens.dispose();
                        }
                    });
                }
            });
    }

    public required = false;
    public title = "Code Lens";
    public description = "Adds support for displaying references in the editor.";
}

function isLineVisible(editor: Atom.TextEditor, line: number) {
    const element: any = atom.views.getView(editor);
    const top = element.getFirstVisibleScreenRow();
    const bottom = element.getLastVisibleScreenRow();

    if (line <= top || line >= bottom)
        return false;
    return true;
}

export class Lens implements IDisposable {
    private _update: Subject<boolean>;
    private _row: number;
    private _decoration: IDecoration;
    private _disposable = new CompositeDisposable();
    private _element: HTMLDivElement;
    private _updateObservable: Observable<number>;
    private _path: string;

    public loaded: boolean = false;

    constructor(private omni: OmniManager, private _editor: Atom.TextEditor, private _member: OmniSharp.Models.QuickFix, private _marker: Atom.Marker, private _range: TextBuffer.Range, disposer: IDisposable) {
        this._row = _range.getRows()[0];
        this._update = new Subject<any>();
        this._disposable.add(this._update);
        this._path = _editor.getPath();

        this._updateObservable = this._update
            .observeOn(Scheduler.nextTick)
            .filter(x => !!x)
            .mergeMap(() => omni.request(this._editor, solution =>
                solution.findusages({ FileName: this._path, Column: this._member.Column + 1, Line: this._member.Line, Buffer: null, Changes: null }, { silent: true })))
            .filter(x => x && x.QuickFixes && !!x.QuickFixes.length)
            .map(x => x && x.QuickFixes && x.QuickFixes.length - 1)
            .share();

        this._disposable.add(this._updateObservable
            .take(1)
            .filter(x => x > 0)
            .do(() => this.loaded = true)
            .subscribe((x) => this._decorate(x)));

        this._disposable.add(disposer);
        this._disposable.add(this._marker.onDidDestroy(() => {
            this.dispose();
        }));
    }

    public updateVisible() {
        const isVisible = this._isVisible();
        this._updateDecoration(isVisible);

        let result: Observable<number>;
        if (isVisible) {
            result = this._updateObservable.take(1);
        } else {
            result = Observable.empty<number>();
        }

        this._issueUpdate(isVisible);
        return result;
    }

    private _issueUpdate = _.debounce((isVisible: boolean) => {
        if (!this._update.isUnsubscribed) {
            this._update.next(isVisible);
        }
    }, 250);

    public updateTop(lineHeight: number) {
        if (this._element)
            this._element.style.top = `-${lineHeight}px`;
    }

    public invalidate() {
        this._updateObservable
            .take(1)
            .subscribe(x => {
                if (x <= 0) {
                    this.dispose();
                } else {
                    if (this._element) {
                        this._element.textContent = x.toString();
                    }
                }
            });
    }

    public isEqual(marker: Atom.Marker) {
        return this._marker.isEqual(<any>marker);
    }

    private _isVisible() {
        return isLineVisible(this._editor, this._row);
    }

    private _updateDecoration(isVisible: boolean) {
        if (this._decoration && this._element) {
            const element = this._element;
            if (isVisible) {
                read(() => element.style.display === "none" && write(() => element.style.display = ""));
            } else {
                read(() => element.style.display !== "none" && write(() => element.style.display = "none"));
            }
        }
    }

    private _decorate(count: number) {
        const lineHeight = this._editor.getLineHeightInPixels();

        const element = this._element = document.createElement("div");
        element.style.position = "relative";
        element.style.top = `-${lineHeight}px`;
        element.style.left = "16px";
        element.classList.add("highlight-info", "badge", "badge-small");
        element.textContent = count.toString();
        element.onclick = () => this.omni.request(this._editor, s => s.findusages({ FileName: this._path, Column: this._member.Column + 1, Line: this._member.Line, Buffer: null, Changes: null }));

        this._decoration = <any>this._editor.decorateMarker(this._marker, { type: "overlay", class: `codelens`, item: this._element, position: "head" });
        this._disposable.add(Disposable.create(() => {
            this._element.remove();
            this._decoration.destroy();
            this._element = null;
        }));

        const isVisible = isLineVisible(this._editor, this._row);
        if (!isVisible) {
            element.style.display = "none";
        }

        return this._decoration;
    }

    public dispose() { return this._disposable.dispose(); }
}

export const codeLens = new CodeLens();
