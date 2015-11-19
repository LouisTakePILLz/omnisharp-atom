import {OmniSharpAtom} from "../../omnisharp.ts";
import {CompositeDisposable} from "../../Disposable";
import {OmniManager} from "../../omni-sharp-server/omni";
import {FindSymbolsView} from "../views/find-symbols-view";

class FindSymbols implements OmniSharpAtom.IFeature {
    private disposable: CompositeDisposable;
    private view: FindSymbolsView;

    public activate(omni: OmniManager) {
        this.disposable = new CompositeDisposable();
        this.disposable.add(atom.commands.add("atom-workspace", "omnisharp-atom:find-symbols", () => {
            this.view = new FindSymbolsView();
        }));

        this.disposable.add(omni.listener.findsymbols.subscribe((data) => {
            this.view.addToList(data.response.QuickFixes);
        }));
    }

    public dispose() {
        this.disposable.dispose();
    }

    public required = true;
    public title = "Find Symbols";
    public description = "Adds commands to find symbols through the UI.";
}

export const findSymbols = new FindSymbols;
