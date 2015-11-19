import {OmniSharp, OmniSharpAtom} from "../../omnisharp.ts";
import {CompositeDisposable} from "../../Disposable";
import {OmniManager} from "../../omni-sharp-server/omni";
import {applyChanges} from "../services/apply-changes";

class CodeFormat implements OmniSharpAtom.IFeature {
    private disposable: CompositeDisposable;
    private omni: OmniManager;

    public activate(omni: OmniManager) {
        this.disposable = new CompositeDisposable();
        this.omni = omni;
        this.disposable.add(omni.addTextEditorCommand("omnisharp-atom:code-format",
            () => this.format()));
        this.disposable.add(omni.addTextEditorCommand("omnisharp-atom:code-format-on-semicolon",
            (event) => this.formatOnKeystroke(event, ";")));
        this.disposable.add(omni.addTextEditorCommand("omnisharp-atom:code-format-on-curly-brace",
            (event) => this.formatOnKeystroke(event, "}")));
    }

    public dispose() {
        this.disposable.dispose();
    }

    public format(editor?: Atom.TextEditor) {
        editor = editor || atom.workspace.getActiveTextEditor();
        if (editor) {
            const buffer = editor.getBuffer();
            this.omni.request(editor, solution => {
                const request = <OmniSharp.Models.FormatRangeRequest>{
                    Line: 0,
                    Column: 0,
                    EndLine: buffer.getLineCount() - 1,
                    EndColumn: 0,
                };

                return solution
                    .formatRange(request)
                    .do((data) => applyChanges(editor, data));
            });
        }
    }

    public formatOnKeystroke(event: Event, char: string): any {
        const editor = atom.workspace.getActiveTextEditor();
        if (editor) {
            editor.insertText(char);

            this.omni.request(editor, solution => {
                const request = <OmniSharp.Models.FormatAfterKeystrokeRequest>{
                    Character: char
                };

                return solution.formatAfterKeystroke(request)
                    .do((data) => applyChanges(editor, data));
            });
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        event.stopPropagation();
        return false;
    }

    public required = true;
    public title = "Code Format";
    public description = "Support for code formatting.";
}
export const codeFormat = new CodeFormat;
