/// <reference path="../tsd.d.ts" />
import {CompositeDisposable} from "../../lib/Disposable";
import {setupFeature} from "../test-helpers";

describe("Navigation", () => {
    setupFeature(["features/navigate-up-down"]);

    it("adds commands", () => {
        const disposable = new CompositeDisposable();

        runs(() => {
            const commands: any = atom.commands;

            expect(commands.registeredCommands["omnisharp-atom:navigate-up"]).toBeTruthy();
            expect(commands.registeredCommands["omnisharp-atom:navigate-down"]).toBeTruthy();
            disposable.dispose();
        });
    });

    // TODO: Test functionality
});
