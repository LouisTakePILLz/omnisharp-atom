import {OmniSharp, OmniSharpAtom} from "../../omnisharp.ts";
import {CompositeDisposable} from "../../Disposable";
import {OmniManager} from "../../omni-sharp-server/omni";

class Navigate implements OmniSharpAtom.IFeature {
    private omni: OmniManager;
    private disposable: CompositeDisposable;

    public activate(omni: OmniManager) {
        this.disposable = new CompositeDisposable();
        this.omni = omni;

        this.disposable.add(omni.addTextEditorCommand("omnisharp-atom:navigate-up", () => {
            return this.navigateUp();
        }));

        this.disposable.add(omni.addTextEditorCommand("omnisharp-atom:navigate-down", () => {
            return this.navigateDown();
        }));

        this.disposable.add(omni.listener.navigateup.subscribe((data) => this.navigateTo(data.response)));
        this.disposable.add(omni.listener.navigatedown.subscribe((data) => this.navigateTo(data.response)));
    }

    public dispose() {
        this.disposable.dispose();
    }

    public navigateUp() {
        this.omni.request(solution => solution.navigateup({}));
    }

    public navigateDown() {
        this.omni.request(solution => solution.navigatedown({}));
    }

    private navigateTo(data: OmniSharp.Models.NavigateResponse) {
        const editor = atom.workspace.getActiveTextEditor();
        this.omni.navigateTo({ FileName: editor.getURI(), Line: data.Line, Column: data.Column });
    }

    public required = true;
    public title = "Navigate";
    public description = "Adds server based navigation support";
}
export const navigate = new Navigate;
