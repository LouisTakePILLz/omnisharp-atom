import {OmniSharpAtom} from "../../omnisharp.ts";
import {CompositeDisposable} from "../../Disposable";
import {OmniManager} from "../../omni-sharp-server/omni";

class PackageRestore implements OmniSharpAtom.IFeature {
    private disposable: CompositeDisposable;

    public activate(omni: OmniManager) {
        this.disposable = new CompositeDisposable();
        this.disposable.add(omni.eachConfigEditor((editor, cd) => {
            cd.add(editor.getBuffer().onDidSave(() => {
                omni.request(solution => solution.filesChanged([{ FileName: editor.getPath() }]));
            }));
        }));
    }

    public dispose() {
        this.disposable.dispose();
    }

    public required = true;
    public title = "Package Restore";
    public description = "Initializes a package restore, when an project.json file is saved.";
}

export const packageRestore = new PackageRestore;
