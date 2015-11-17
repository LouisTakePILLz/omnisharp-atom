import {OmniSharp, OmniSharpAtom} from "../../omnisharp.ts";
import Omni from "../../omni-sharp-server/omni";
import {CompositeDisposable, Disposable} from "../../Disposable";
import {each, extend, has, contains, any, range, remove, pull, find, chain, unique, set, findIndex, all, isEqual, min, debounce, sortBy} from "lodash";
import {Observable, Subject, ReplaySubject} from "@reactivex/rxjs";
/* tslint:disable:variable-name */
const AtomGrammar = require((<any>atom).config.resourcePath + "/node_modules/first-mate/lib/grammar.js");
/* tslint:enable:variable-name */


/* tslint:disable:no-string-literal */
const DEBOUNCE_TIME = 240/*240*/;

class Highlight implements OmniSharpAtom.IFeature {
    private disposable: CompositeDisposable;
    private editors: Array<Atom.TextEditor>;

    public activate() {
        this.disposable = new CompositeDisposable();
        this.editors = [];

        this.disposable.add(Omni.eachEditor((editor, cd) => this.setupEditor(editor, cd)));

        this.disposable.add(
            isObserveRetokenizing(
                Omni.activeEditor.take(1)
                    .filter(x => !!x)
                    .mergeMap(editor => Omni.listener.highlight
                        .filter(z => z.request.FileName === editor.getPath())
                        .map(({request, response}) => ({ editor, request, response }))
                        .take(1))
            )
                .subscribe(({editor, request, response}) => {
                    if (editor.getGrammar) {
                        (<any>editor.getGrammar()).setResponses(response.Highlights, request.ProjectNames.length > 0);
                    }
                    editor.displayBuffer.tokenizedBuffer.retokenizeLines();
                }));

        this.disposable.add(
            isObserveRetokenizing(
                Omni.listener.highlight
                    .map(({request, response}) => ({ editor: find(this.editors, editor => editor.getPath() === request.FileName), request, response }))
                    .mergeMap(z => Omni.activeEditor.take(1).filter(x => x !== z.editor)
                        .map(x => z))
            )
                .subscribe(({editor, request, response}) => {
                    if (editor.getGrammar) {
                        (<any>editor.getGrammar()).setResponses(response.Highlights, request.ProjectNames.length > 0);
                    }
                }));

        this.disposable.add(isEditorObserveRetokenizing(
            Observable.merge(Omni.activeEditor,
                Omni.activeFramework
                    .mergeMap(z => Omni.listener.highlight
                        .filter(x => contains(x.request.ProjectNames, `${z.project.name}+${z.framework.ShortName}`))
                        .map(({request, response}) => ({ editor: find(this.editors, editor => editor.getPath() === request.FileName), request, response }))
                        .take(1))
                    .mergeMap(z => Omni.activeEditor))
                .debounceTime(DEBOUNCE_TIME)
                .filter(z => !!z)
        )
            .subscribe(editor => {
                editor.displayBuffer.tokenizedBuffer["silentRetokenizeLines"]();
            }));
    }

    public dispose() {
        if (this.disposable) {
            this.disposable.dispose();
        }
    }

    private setupEditor(editor: Atom.TextEditor, disposable: CompositeDisposable) {
        if (editor["_oldGrammar"] || !editor.getGrammar) return;

        this.editors.push(editor);
        this.disposable.add(disposable);

        if (!editor["_oldGrammar"])
            editor["_oldGrammar"] = editor.getGrammar();
        if (!editor["_setGrammar"])
            editor["_setGrammar"] = editor.setGrammar;
        if (!editor.displayBuffer.tokenizedBuffer["_buildTokenizedLineForRowWithText"])
            editor.displayBuffer.tokenizedBuffer["_buildTokenizedLineForRowWithText"] = editor.displayBuffer.tokenizedBuffer.buildTokenizedLineForRowWithText;
        if (!editor.displayBuffer.tokenizedBuffer["_markTokenizationComplete"])
            editor.displayBuffer.tokenizedBuffer["_markTokenizationComplete"] = editor.displayBuffer.tokenizedBuffer.markTokenizationComplete;
        if (!editor.displayBuffer.tokenizedBuffer["_retokenizeLines"])
            editor.displayBuffer.tokenizedBuffer["_retokenizeLines"] = editor.displayBuffer.tokenizedBuffer.retokenizeLines;
        if (!editor.displayBuffer.tokenizedBuffer["_tokenizeInBackground"])
            editor.displayBuffer.tokenizedBuffer["_tokenizeInBackground"] = editor.displayBuffer.tokenizedBuffer.tokenizeInBackground;
        if (!editor.displayBuffer.tokenizedBuffer["_chunkSize"])
            editor.displayBuffer.tokenizedBuffer["chunkSize"] = 20;

        editor.setGrammar = setGrammar;
        editor.setGrammar(editor.getGrammar());

        const grammar: IHighlightingGrammar = <any>editor.getGrammar();

        (<any>editor.displayBuffer.tokenizedBuffer).buildTokenizedLineForRowWithText = function(row: number) {
            grammar["__row__"] = row;
            return editor.displayBuffer.tokenizedBuffer["_buildTokenizedLineForRowWithText"].apply(this, arguments);
        };

        if (!(<any>editor.displayBuffer.tokenizedBuffer).silentRetokenizeLines) {
            (<any>editor.displayBuffer.tokenizedBuffer).silentRetokenizeLines = debounce(function() {
                if (grammar.isObserveRetokenizing)
                    grammar.isObserveRetokenizing.next(false);
                let lastRow = this.buffer.getLastRow();
                this.tokenizedLines = this.buildPlaceholderTokenizedLinesForRows(0, lastRow);
                this.invalidRows = [];
                if (this.linesToTokenize && this.linesToTokenize.length) {
                    this.invalidateRow(min(this.linesToTokenize));
                } else {
                    this.invalidateRow(0);
                }
                this.fullyTokenized = false;
            }, DEBOUNCE_TIME);
        }

        (<any>editor.displayBuffer.tokenizedBuffer).markTokenizationComplete = function() {
            if (grammar.isObserveRetokenizing)
                grammar.isObserveRetokenizing.next(true);
            return editor.displayBuffer.tokenizedBuffer["_markTokenizationComplete"].apply(this, arguments);
        };

        (<any>editor.displayBuffer.tokenizedBuffer).retokenizeLines = function() {
            if (grammar.isObserveRetokenizing)
                grammar.isObserveRetokenizing.next(false);
            return editor.displayBuffer.tokenizedBuffer["_retokenizeLines"].apply(this, arguments);
        };

        (<any>editor.displayBuffer.tokenizedBuffer).tokenizeInBackground = function() {
            if (!this.visible || this.pendingChunk || !this.isAlive())
                return;

            this.pendingChunk = true;
            window.requestAnimationFrame(() => {
                this.pendingChunk = false;
                if (this.isAlive() && this.buffer.isAlive()) {
                    this.tokenizeNextChunk();
                }
            });
        };

        disposable.add(Disposable.create(() => {
            grammar.linesToFetch = [];
            grammar.responses.clear();
            editor.displayBuffer.tokenizedBuffer.retokenizeLines();
            delete editor["_oldGrammar"];
        }));

        this.disposable.add(editor.onDidDestroy(() => {
            pull(this.editors, editor);
        }));

        const issueRequest = new Subject<boolean>();

        disposable.add(issueRequest
            .debounceTime(DEBOUNCE_TIME)
            .mergeMap(z => Omni.getProject(editor).map(({name, activeFramework}) => activeFramework.Name === "all" ? "" : name + "+" + activeFramework.ShortName)).timeout(200, Observable.of(""))
            .switchMap((framework) => {
                let projects: string[] = [];
                if (framework)
                    projects = [framework];

                let linesToFetch = unique<number>(grammar.linesToFetch) || [];
                if (!linesToFetch || !linesToFetch.length)
                    linesToFetch = [];

                return Omni.request(editor, solution => solution.highlight({
                    ProjectNames: projects,
                    Lines: <any>linesToFetch,
                    ExcludeClassifications: [
                        OmniSharp.Models.HighlightClassification.Comment,
                        OmniSharp.Models.HighlightClassification.String,
                        OmniSharp.Models.HighlightClassification.Punctuation,
                        OmniSharp.Models.HighlightClassification.Operator,
                        OmniSharp.Models.HighlightClassification.Keyword
                    ]
                })).map(z => ({ projects, response: z }));
            })
            .subscribe(({response, projects}) => {
                if (editor.getGrammar) {
                    (<any>editor.getGrammar()).setResponses(response.Highlights, projects.length > 0);
                }
                editor.displayBuffer.tokenizedBuffer["silentRetokenizeLines"]();
            })
        );

        disposable.add(Omni.getProject(editor)
            .mergeMap(z => z.observe.activeFramework).subscribe(() => {
                grammar.linesToFetch = [];
                grammar.responses.clear();
                issueRequest.next(true);
            }));

        disposable.add(editor.onDidStopChanging(() => issueRequest.next(true)));

        disposable.add(editor.onDidSave(() => {
            grammar.linesToFetch = [];
            issueRequest.next(true);
        }));

        disposable.add(Omni.whenEditorConnected(editor).delay(1000).subscribe(null, null, () => {
            issueRequest.next(true);
        }));
    }

    public required = false;
    public title = "Enhanced Highlighting";
    public description = "Enables server based highlighting, which includes support for string interpolation, class names and more.";
    public default = false;
}

function isObserveRetokenizing(observable: Observable<{ editor: Atom.TextEditor; request: OmniSharp.Models.HighlightRequest; response: OmniSharp.Models.HighlightResponse }>) {
    return observable
        .filter(z => !!z && !!z.editor && !!z.editor.getGrammar)
        .filter(z => !!(<Observable<boolean>>(<any>z.editor.getGrammar()).isObserveRetokenizing))
        .mergeMap(z => (<Observable<boolean>>(<any>z.editor.getGrammar()).isObserveRetokenizing)
            .filter(x => !!x)
            .take(1)
            .map(x => z));
}

function isEditorObserveRetokenizing(observable: Observable<Atom.TextEditor>) {
    return observable.filter(z => !!z && !!z.getGrammar)
        .filter(z => !!(<Observable<boolean>>(<any>z.getGrammar()).isObserveRetokenizing))
        .mergeMap(z => (<Observable<boolean>>(<any>z.getGrammar()).isObserveRetokenizing)
            .filter(x => !!x)
            .take(1)
            .map(x => z));
}

interface IHighlightingGrammar extends FirstMate.Grammar {
    isObserveRetokenizing: Subject<boolean>;
    linesToFetch: number[];
    linesToTokenize: number[];
    responses: Map<number, OmniSharp.Models.HighlightSpan[]>;
    fullyTokenized: boolean;
}

enum HighlightClassification {
    Name = 1,
    Comment = 2,
    String = 3,
    Operator = 4,
    Punctuation = 5,
    Keyword = 6,
    Number = 7,
    Identifier = 8,
    PreprocessorKeyword = 9,
    ExcludedCode = 10
}

set(global, "OmniSharp.Models.HighlightClassification", HighlightClassification);

function Grammar(editor: Atom.TextEditor, base: FirstMate.Grammar) {
    this.isObserveRetokenizing = new ReplaySubject<boolean>(1);

    this.editor = editor;
    const responses = new Map<number, OmniSharp.Models.HighlightSpan[]>();
    this.linesToFetch = [];
    this.linesToTokenize = [];
    this.activeFramework = {};

    Object.defineProperty(this, "responses", {
        writable: false,
        value: responses
    });

    editor.getBuffer().preemptDidChange(({oldRange, newRange}) => {
        let start: number = oldRange.start.row,
            delta: number = newRange.end.row - oldRange.end.row;

        start = start - 5;
        if (start < 0) start = 0;

        const end = editor.buffer.getLineCount() - 1;

        const lines = range(start, end + 1);
        if (!responses.keys().next().done) {
            this.linesToFetch.push(...lines);
        }

        if (lines.length === 1) {
            const responseLine = responses.get(lines[0]);
            if (responseLine) {
                const oldFrom = oldRange.start.column,
                    newFrom = newRange.start.column;

                //responses.delete(lines[0]);
                remove(responseLine, (span: OmniSharp.Models.HighlightSpan) => {
                    if (span.StartLine < lines[0]) {
                        return true;
                    }
                    if (span.StartColumn >= oldFrom || span.EndColumn >= oldFrom) {
                        return true;
                    }
                    if (span.StartColumn >= newFrom || span.EndColumn >= newFrom) {
                        return true;
                    }
                    return false;
                });
            }
        } else {
            each(lines, line => { responses.delete(line); });
        }

        if (delta > 0) {
            // New line
            const count = editor.getLineCount();
            for (let i = count - 1; i > end; i--) {
                if (responses.has(i)) {
                    responses.set(i + delta, responses.get(i));
                    responses.delete(i);
                }
            }
        } else if (delta < 0) {
            // Removed line
            const count = editor.getLineCount();
            const absDelta = Math.abs(delta);
            for (let i = end; i < count; i++) {
                if (responses.has(i + absDelta)) {
                    responses.set(i, responses.get(i + absDelta));
                    responses.delete(i + absDelta);
                }
            }
        }
    });

    this.setResponses = (value: OmniSharp.Models.HighlightSpan[], enableExcludeCode: boolean) => {
        const results = chain(value).chain();

        const groupedItems = <any>results.map(highlight => range(highlight.StartLine, highlight.EndLine + 1)
            .map(line => ({ line, highlight })))
            .flatten<{ line: number; highlight: OmniSharp.Models.HighlightSpan }>()
            .groupBy(z => z.line)
            .value();

        each(groupedItems, (item: { highlight: OmniSharp.Models.HighlightSpan }[], key: number) => {
            let k = +key, mappedItem = item.map(x => x.highlight);

            if (!enableExcludeCode || any(mappedItem, i => i.Kind === "preprocessor keyword") && all(mappedItem, i => i.Kind === "excluded code" || i.Kind === "preprocessor keyword")) {
                mappedItem = mappedItem.filter(z => z.Kind !== "excluded code");
            }

            if (!responses.has(k)) {
                responses.set(k, mappedItem);
                this.linesToTokenize.push(k);
            } else {
                const responseLine = responses.get(k);
                if (responseLine.length !== mappedItem.length || any(responseLine, (l, i) => !isEqual(l, mappedItem[i]))) {
                    responses.set(k, mappedItem);
                    this.linesToTokenize.push(k);
                }
            }
        });
    };
}

extend(Grammar.prototype, AtomGrammar.prototype);

Grammar.prototype.omnisharp = true;
Grammar.prototype.tokenizeLine = function(line: string, ruleStack: any[], firstLine = false): { tags: number[]; ruleStack: any } {
    const baseResult = AtomGrammar.prototype.tokenizeLine.call(this, line, ruleStack, firstLine);
    let tags: any[];

    if (this.responses) {
        const row = this["__row__"];

        if (!this.responses.has(row)) return baseResult;

        const highlights = this.responses.get(row);
        // Excluded code blows away any other formatting, otherwise we get into a very weird state.
        if (highlights[0] && highlights[0].Kind === "excluded code") {
            tags = [line.length];
            getAtomStyleForToken(this.name, tags, highlights[0], 0, tags.length - 1, line);
            baseResult.ruleStack = [baseResult.ruleStack[0]];
        } else {
            tags = this.getCsTokensForLine(highlights, line, row, ruleStack, firstLine, baseResult.tags);
        }
        baseResult.tags = tags;
    }
    return baseResult;
};

Grammar.prototype.getCsTokensForLine = function(highlights: OmniSharp.Models.HighlightSpan[], line: string, row: number, ruleStack: any[], firstLine: boolean, tags: number[]) {
    ruleStack = [{ rule: this.getInitialRule() }];

    each(highlights, (highlight) => {
        const start = highlight.StartColumn - 1;
        const end = highlight.EndColumn - 1;

        if (highlight.EndLine > highlight.StartLine && highlight.StartColumn === 0 && highlight.EndColumn === 0) {
            getAtomStyleForToken(this.name, tags, highlight, 0, tags.length - 1, line);
            return;
        }

        let distance = -1;
        let index = -1;
        let i = -1;
        for (i = 0; i < tags.length; i++) {
            if (tags[i] > 0) {
                if (distance + tags[i] > start) {
                    index = i;
                    break;
                }
                distance += tags[i];
            }
        }

        const str = line.substring(start, end);
        const size = end - start;
        if (tags[index] >= size) {
            let values: number[];
            let prev: number;
            if (distance === start) {
                values = [size, tags[index] - size];
            } else {
                prev = start - distance;
                const next = tags[index] - size - prev;
                if (next > 0) {
                    values = [prev, size, tags[index] - size - prev];
                } else {
                    values = [prev, size];
                }
            }
            tags.splice(index, 1, ...values);
            if (prev) index = index + 1;
            getAtomStyleForToken(this.name, tags, highlight, index, index, str);
        } else if (tags[index] < size) {
            let backtrackIndex = index;
            let backtrackDistance = 0;
            for (i = backtrackIndex; i >= 0; i--) {
                if (tags[i] > 0) {
                    if (backtrackDistance >= size) {
                        backtrackIndex = i;
                        break;
                    }
                    backtrackDistance += tags[i];
                } else if (tags[i] % 2 === 0) {
                    if (backtrackDistance >= size) {
                        backtrackIndex = i + 1;
                        break;
                    }
                }
            }

            if (i === -1) {
                backtrackIndex = 0;
            }

            let forwardtrackIndex = index;
            for (i = index + 1; i < tags.length; i++) {
                if (tags[i] > 0 || tags[i] % 2 === -1) {
                    forwardtrackIndex = i - 1;
                    break;
                }
                // Handles case where there is a closing tag
                // but no opening tag here.
                if (tags[i] % 2 === 0) {
                    let openFound = false;
                    for (let h = i; h >= 0; h--) {
                        if (tags[h] === tags[i] + 1) {
                            openFound = true;
                            break;
                        }
                    }
                    if (!openFound) {
                        forwardtrackIndex = i - 1;
                        break;
                    }
                }
            }

            if (i === tags.length) {
                forwardtrackIndex = tags.length - 1;
            }

            getAtomStyleForToken(this.name, tags, highlight, backtrackIndex, forwardtrackIndex, str);
        }
    });

    return tags;
};

const getIdForScope = (function() {
    const ids: { [key: string]: { [key: string]: number }; } = {};
    const grammars: any = {};

    function buildScopesForGrammar(grammarName: string) {
        const grammar = find(atom.grammars.getGrammars(), atomGrammar => atomGrammar.name === grammarName);
        if (!grammar) return;

        ids[grammar.name] = {};
        grammars[grammar.name] = grammar;

        each(grammar.registry.scopesById, (value: string, key: any) => { ids[grammar.name][value] = +key; });
    }

    const method = (grammar: string, scope: string) => {
        if (!ids[grammar]) {
            buildScopesForGrammar(grammar);
        }

        if (!ids[grammar][scope])
            ids[grammar][scope] = grammars[grammar].registry.startIdForScope(scope);

        return +ids[grammar][scope];
    };

    (<any>method).end = (scope: number) => +scope - 1;

    return <{ (grammar: string, scope: string): number; end: (scope: number) => number; }>method;
})();


/// NOTE: best way I have found for these is to just look at theme "less" files
// Alternatively just inspect the token for a .js file
function getAtomStyleForToken(grammar: string, tags: number[], token: OmniSharp.Models.HighlightSpan, index: number, indexEnd: number, str: string) {
    const previousScopes: any[] = [];
    for (let i = index - 1; i >= 0; i--) {
        if (tags[i] > 0)
            break;
        previousScopes.push(tags[i]);
    }

    const replacements: { start: number; end: number; replacement: number[] }[] = [];
    const opens: { tag: number; index: number }[] = [];
    const closes: typeof opens = [];

    // Scan for any unclosed or unopened tags
    for (let i = index; i < indexEnd; i++) {
        if (tags[i] > 0) continue;
        if (tags[i] % 2 === 0) {
            const openIndex = findIndex(opens, x => x.tag === (tags[i] + 1));
            if (openIndex > -1) {
                opens.splice(openIndex, 1);
            } else {
                closes.push({ tag: tags[i], index: i });
            }
        } else {
            opens.unshift({ tag: tags[i], index: i });
        }
    }

    const unfullfilled = sortBy(opens.concat(closes), x => x.index);

    let internalIndex = index;
    for (let i = 0; i < unfullfilled.length; i++) {
        const v = unfullfilled[i];
        replacements.unshift({
            start: internalIndex,
            end: v.index - 1,
            replacement: tags.slice(internalIndex, v.index)
        });
        internalIndex = v.index + 1;
    }

    if (replacements.length === 0) {
        replacements.unshift({
            start: index,
            end: indexEnd,
            replacement: tags.slice(index, indexEnd + 1)
        });
    } else {
        replacements.unshift({
            start: internalIndex,
            end: indexEnd,
            replacement: tags.slice(internalIndex, indexEnd + 1)
        });
    }

    function add(scope: any) {
        const id = getIdForScope(grammar, scope);
        if (id === -1) return;

        if (!any(previousScopes, z => z === id)) {
            previousScopes.push(id);
        }
        each(replacements, ctx => {
            const replacement = ctx.replacement;
            replacement.unshift(id);
            replacement.push(getIdForScope.end(id));
        });
    }
    switch (token.Kind) {
        case "number":
            add(`constant.numeric`);
            break;
        case "struct name":
            add(`support.constant.numeric.identifier.struct`);
            break;
        case "enum name":
            add(`support.constant.numeric.identifier.enum`);
            break;
        case "identifier":
            add(`identifier`);
            break;
        case "class name":
            add(`support.class.type.identifier`);
            break;
        case "delegate name":
            add(`support.class.type.identifier.delegate`);
            break;
        case "interface name":
            add(`support.class.type.identifier.interface`);
            break;
        case "preprocessor keyword":
            add(`constant.other.symbo`);
            break;
        case "excluded code":
            add(`comment.block`);
            break;
        default:
            console.log("unhandled Kind " + token.Kind);
            break;
    }

    each(replacements, ({replacement, end, start}) => {
        tags.splice(start, end - start + 1, ...replacement);
    });
}

function setGrammar(grammar: FirstMate.Grammar): FirstMate.Grammar {
    if (!grammar["omnisharp"] && Omni.isValidGrammar(grammar)) {
        const newGrammar = new (<any>Grammar)(this, grammar);
        each(grammar, (x, i) => has(grammar, i) && (newGrammar[i] = x));
        grammar = newGrammar;
    }
    return this._setGrammar(grammar);
}

export const enhancedHighlighting = new Highlight;
