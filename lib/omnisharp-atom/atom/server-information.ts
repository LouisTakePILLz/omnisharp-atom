import {OmniSharpAtom} from "../../omnisharp.ts";
import {CompositeDisposable} from "../../Disposable";
import {Observable} from "@reactivex/rxjs";
import {OmniManager} from "../../omni-sharp-server/omni";
import {OmnisharpClientStatus} from "omnisharp-client";
import {dock} from "../atom/dock";
import {OutputWindow} from "../views/omni-output-pane-view";
import {ViewModel} from "../../omni-sharp-server/view-model";

class ServerInformation implements OmniSharpAtom.IFeature {
    private disposable: CompositeDisposable;
    private omni: OmniManager;
    public observe: {
        status: Observable<OmnisharpClientStatus>;
        output: Observable<OmniSharpAtom.OutputMessage[]>;
        projects: Observable<OmniSharpAtom.IProjectViewModel[]>;
        model: Observable<ViewModel>;
    };

    public model: ViewModel;

    public activate(omni: OmniManager) {
        this.disposable = new CompositeDisposable();
        this.omni = omni;

        const status = this.setupStatus();
        const output = this.setupOutput();
        const projects = this.setupProjects();

        this.disposable.add(omni.activeModel.subscribe(z => this.model = z));
        this.observe = { status, output, projects, model: omni.activeModel };

        this.disposable.add(dock.addWindow("output", "Omnisharp output", OutputWindow, {}));
    }

    private setupStatus() {
        // Stream the status from the active model
        return this.omni.activeModel
            .switchMap(model => model.observe.status)
            .share();
    }

    private setupOutput() {
        // As the active model changes (when we go from an editor for ClientA to an editor for ClientB)
        // We want to make sure that the output field is
        return this.omni.activeModel
            .switchMap(z => z.observe.output)
        // This starts us off with the current models output
            .merge(this.omni.activeModel.map(z => z.output))
            .startWith([])
            .share();
    }

    private setupProjects() {
        return this.omni.activeModel
            .switchMap(model => model.observe.projects)
        // This starts us off with the current projects output
            .merge(this.omni.activeModel.map(z => z.projects))
            .share();
    }

    public dispose() {
        this.disposable.dispose();
    }

    public required = true;
    public title = "Server Information";
    public description = "Monitors server output and status.";
}

export const server = new ServerInformation;
