/// <reference path="../tsd.d.ts" />
import {CompositeDisposable} from "../../lib/Disposable";
import {setupFeature, openEditor} from "../test-helpers";
import {RenameView} from "../../lib/omnisharp-atom/views/rename-view";
const a = require("atom");
/* tslint:disable:variable-name */
const Range: typeof TextBuffer.Range = a.Range;
/* tslint:enable:variable-name */

describe("Rename", () => {
    setupFeature(["features/rename"]);

    it("adds commands", () => {
        const disposable = new CompositeDisposable();

        runs(() => {
            const commands: any = atom.commands;

            expect(commands.registeredCommands["omnisharp-atom:rename"]).toBeTruthy();
            disposable.dispose();
        });
    });

    it("should select rename text appropriately with selection", () => {
        waitsForPromise(() => openEditor("simple/rename/ClassToRename.cs")
            .then(({editor}) => {
                editor.setSelectedBufferRange(<any>new Range([4, 16], [4, 22]));
                atom.commands.dispatch(atom.views.getView(editor), "omnisharp-atom:rename");
            }));

        waitsFor(() => {
            const panels = atom.workspace.getTopPanels();
            return !!panels.length;
        });

        runs(function() {
            const panels = atom.workspace.getTopPanels();
            const panel : RenameView = panels[0].item;

            expect(panel.miniEditor.getText()).toEqual("Method");
        });
    });

    it("should select rename text appropriately with cursor", () => {
        waitsForPromise(() => openEditor("simple/rename/ClassToRename.cs")
            .then(({editor}) => {
                editor.setCursorBufferPosition([4, 18]);
                atom.commands.dispatch(atom.views.getView(editor), "omnisharp-atom:rename");
            }));

        waitsFor(() => {
            const panels = atom.workspace.getTopPanels();
            return !!panels.length;
        });

        runs(function() {
            const panels = atom.workspace.getTopPanels();
            const panel : RenameView = panels[0].item;

            expect(panel.miniEditor.getText()).toEqual("Method");
        });
    });

});
