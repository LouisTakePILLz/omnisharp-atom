/// <reference path="../tsd.d.ts" />
import {CompositeDisposable} from "../../lib/Disposable";
import {setupFeature} from "../test-helpers";

describe("Go To Definition", () => {
    setupFeature(["features/go-to-definition"]);

    it("adds commands", () => {
        const disposable = new CompositeDisposable();

        runs(() => {
            const commands: any = atom.commands;

            expect(commands.registeredCommands["omnisharp-atom:go-to-definition"]).toBeTruthy();
            disposable.dispose();
        });
    });

    // TODO: Test functionality
});
