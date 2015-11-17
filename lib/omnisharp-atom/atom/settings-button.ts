import {OmniSharpAtom} from "../../omnisharp.ts";
import {CompositeDisposable, IDisposable} from "../../Disposable";
import * as React from "react";
import {dock} from "../atom/dock";

class SettingsButton implements OmniSharpAtom.IFeature {
    private disposable: CompositeDisposable;

    public activate() {
        this.disposable = new CompositeDisposable();
        let tooltip: IDisposable;
        const button = React.DOM.a({
            className: `btn icon-gear`,
            onClick: () => atom.commands.dispatch(atom.views.getView(atom.workspace), "omnisharp-atom:settings"),
            onMouseEnter: (e) => {
                tooltip = atom.tooltips.add(<any>e.currentTarget, { title: this.tooltip });
                this.disposable.add(tooltip);
            },
            onMouseLeave: (e) => {
                if (tooltip) {
                    this.disposable.remove(tooltip);
                    tooltip.dispose();
                }
            }
        });

        this.disposable.add(dock.addButton(
            "settings-button",
            "Settings",
            button,
            { priority: 999 }
        ));
    }

    public dispose() {
        this.disposable.dispose();
    }

    public required = true;
    public title = "Show Settings button";
    public tooltip = "Show Settings";
    public description = "Shows the settings button on the OmniSharp Dock";
    public default = true;
}

export const settingsButton = new SettingsButton();
