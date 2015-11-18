/// <reference path="../tsd.d.ts" />
import {setupFeature} from "../test-helpers";
import {CompositeDisposable} from "../../lib/Disposable";

describe("Lookup", () => {
    setupFeature(["features/lookup"]);

    it("adds commands", () => {
        const disposable = new CompositeDisposable();

        runs(() => {
            const commands: any = atom.commands;

            expect(commands.registeredCommands["omnisharp-atom:type-lookup"]).toBeTruthy();
            disposable.dispose();
        });
    });

    // TODO: Test functionality
});
