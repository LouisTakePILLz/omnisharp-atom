/// <reference path="../tsd.d.ts" />
import {CompositeDisposable} from "../../lib/Disposable";
import {setupFeature} from "../test-helpers";

describe("Find Symbols", () => {
    setupFeature(["features/find-symbols"]);

    it("adds commands", () => {
        const disposable = new CompositeDisposable();

        runs(() => {
            const commands: any = atom.commands;

            expect(commands.registeredCommands["omnisharp-atom:find-symbols"]).toBeTruthy();
            disposable.dispose();
        });
    });

    // TODO: Test functionality
});
