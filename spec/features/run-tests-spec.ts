/// <reference path="../tsd.d.ts" />
import {CompositeDisposable} from "../../lib/Disposable";
import {setupFeature} from "../test-helpers";

describe("Run Tests", () => {
    setupFeature(["features/run-tests"]);

    it("adds commands", () => {
        const disposable = new CompositeDisposable();

        runs(() => {
            const commands: any = atom.commands;

            expect(commands.registeredCommands["omnisharp-atom:run-all-tests"]).toBeTruthy();
            expect(commands.registeredCommands["omnisharp-atom:run-fixture-tests"]).toBeTruthy();
            expect(commands.registeredCommands["omnisharp-atom:run-single-test"]).toBeTruthy();
            expect(commands.registeredCommands["omnisharp-atom:run-last-test"]).toBeTruthy();
            disposable.dispose();
        });
    });

    // TODO: Test functionality
});
