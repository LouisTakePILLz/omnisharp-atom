import {OmniSelectListView} from "../services/omni-select-list-view";
import {Omni} from "../../omni-sharp-server/omni";

export class FindSymbolsView extends OmniSelectListView {

    constructor() {
        super("Find Symbols");

        this.setMaxItems(50);
    }

    public viewForItem(item: any) {
        return `<li>
            <span>
                <img style="margin-right: 0.75em;" height="16px" width="16px" src="atom://omnisharp-atom/styles/icons/autocomplete_${item.Kind.toLowerCase()}@3x.png" />
                <span>${item.Text}</span>
            </span>
            <br/>
            <span class="filename">${atom.project.relativizePath(item.FileName)[1] + ":" + item.Line}</span>
            </li>`;
    }

    public getFilterKey() {
        return "Text";
    }

    public confirmed(item: any): any {
        this.cancel();
        this.hide();

        Omni.navigateTo(item);
        return null;
    }

    public onFilter(filter: string): void {
        Omni.request(solution =>  solution.findsymbols({ Filter: filter }));
    }

    public getMinQueryLength() {
        return 1;
    }
}
