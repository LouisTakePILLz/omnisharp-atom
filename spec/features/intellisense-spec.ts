/// <reference path="../tsd.d.ts" />
import {CompositeDisposable} from "../../lib/Disposable";
import {setupFeature} from "../test-helpers";

describe("Intellisense", () => {
    setupFeature(["features/intellisense"]);

    it("adds commands", () => {
        const disposable = new CompositeDisposable();

        runs(() => {
            const commands: any = atom.commands;

            expect(commands.registeredCommands["omnisharp-atom:intellisense-dot"]).toBeTruthy();
            expect(commands.registeredCommands["omnisharp-atom:intellisense-space"]).toBeTruthy();
            expect(commands.registeredCommands["omnisharp-atom:intellisense-semicolon"]).toBeTruthy();
            disposable.dispose();
        });
    });

    // TODO: Test functionality
});
